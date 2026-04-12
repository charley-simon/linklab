/**
 * DataLoader — Fetch les données pour un Trail résolu
 *
 * Fait le pont entre :
 *   Trail (sémantique — où on est, d'où on vient)
 *   QueryEngine (technique — comment fetcher les données)
 *   Provider (physique — SQL ou JSON en mémoire)
 *
 * Principe :
 *   Pour chaque frame RESOLVED dans le Trail, DataLoader
 *   construit la requête optimale depuis le graphe compilé
 *   et remplit frame.data avec les résultats.
 *
 * Deux modes de fetch :
 *   SQL  — via Provider (PostgreSQL, MySQL...)
 *   JSON — via dataset en mémoire (mock, tests, Netflix JSON)
 *
 * Usage :
 * ```typescript
 * const loader = new DataLoader(compiledGraph, { dataset })
 * await loader.load(trail)
 * // trail.current.data contient maintenant les données
 * ```
 */

import type { CompiledGraph, Frame }  from '../types/index.js'
import type { Trail }                  from '../navigation/Trail.js'
import { QueryEngine }                 from './QueryEngine.js'

// ── Types ─────────────────────────────────────────────────────

export interface DataLoaderOptions {
  /**
   * Dataset JSON en mémoire — pour les providers mock ou Netflix JSON.
   * Clé = nom de l'entité, valeur = tableau de rows.
   */
  dataset?: Record<string, any[]>

  /**
   * Provider SQL — pour PostgreSQL, MySQL, etc.
   * Si fourni, prend la priorité sur dataset.
   */
  provider?: {
    query<T = any>(sql: string, params?: any[]): Promise<T[]>
  }

  /**
   * Transforme les filtres d'une frame en paramètres SQL.
   * Par défaut : { field: 'id', value: 1 } → WHERE entity.id = 1
   */
  buildFilters?: (frame: Frame) => Record<string, any>
}

// ── DataLoader ────────────────────────────────────────────────

export class DataLoader {
  private queryEngine: QueryEngine
  private options:     DataLoaderOptions

  constructor(compiledGraph: CompiledGraph, options: DataLoaderOptions = {}) {
    this.queryEngine = new QueryEngine(compiledGraph)
    this.options     = options
  }

  /**
   * Charge les données pour la frame courante du Trail.
   *
   * Stratégie :
   *   1. Si la frame courante est UNRESOLVED → rien à fetcher
   *   2. Si depth === 1 → fetch direct de l'entité (avec id si présent)
   *   3. Si depth > 1  → traverse depuis le dernier ancêtre résolu
   *
   * Mutate trail.current.data avec les résultats.
   */
  async load(trail: Trail): Promise<void> {
    const current = trail.current
    if (!current) return
    if (current.state === 'UNRESOLVED') return

    // Trouver l'ancêtre — point d'entrée de la traversée
    const anchor = this.findAnchor(trail)

    let data: any[]

    if (!anchor || anchor.entity === current.entity) {
      const filters = current.id !== undefined ? { id: current.id } : {}
      data = await this.fetchDirect(current.entity, filters)
    } else {
      const filters = anchor.id !== undefined ? { id: anchor.id } : {}
      data = await this.fetchViaRoute(anchor.entity, current.entity, filters)
    }
    ;(current as any).data = data
  }

  /**
   * Charge les données pour toutes les frames RESOLVED du Trail.
   * Utile pour les réponses enrichies (chaque frame a ses données).
   */
  async loadAll(trail: Trail): Promise<void> {
    for (let i = 0; i < trail.depth; i++) {
      const frame = trail.at(i)
      if (!frame || frame.state !== 'RESOLVED') continue

      const subTrail = trail.slice(i + 1)
      await this.load(subTrail)
    }
  }

  // ── Privé ──────────────────────────────────────────────────

  /**
   * Trouve le premier ancêtre résolu avec un id dans le Trail.
   * C'est le point de départ de la traversée.
   */
  private findAnchor(trail: Trail): Frame | undefined {
    // Remonter le Trail depuis l'avant-dernière frame
    for (let i = trail.depth - 2; i >= 0; i--) {
      const frame = trail.at(i)
      if (frame?.state === 'RESOLVED' && frame.id !== undefined) {
        return frame
      }
    }
    return undefined
  }

  /**
   * Construit les filtres depuis le Trail.
   * Combine les filtres de resolvedBy + l'id de l'ancêtre.
   */
  private buildFilters(trail: Trail): Record<string, any> {
    const current = trail.current!
    const filters: Record<string, any> = {}

    // Filtre sur l'id de la frame courante si présent
    if (current.id !== undefined) {
      filters['id'] = current.id
    }

    // Filtres portés par resolvedBy (conditions sémantiques)
    if (current.resolvedBy?.filters) {
      for (const f of current.resolvedBy.filters) {
        if (f.operator === 'equals') {
          filters[f.field] = f.value
        }
      }
    }

    // Override par buildFilters custom si fourni
    if (this.options.buildFilters) {
      return { ...filters, ...this.options.buildFilters(current) }
    }

    return filters
  }

  /**
   * Résout la clé primaire d'une entité depuis le graphe compilé.
   * Fallback : {entity}_id (convention dvdrental, PostgreSQL standard).
   */
  private pkOf(entity: string): string {
    const node = this.queryEngine.compiledGraph.nodes.find((n: any) => n.id === entity)
    const pk   = (node as any)?.primaryKey
    return Array.isArray(pk) ? pk[0] : (pk ?? `${entity}_id`)
  }

  /**
   * Fetch direct — une seule entité, sans traversée.
   */
  private async fetchDirect(
    entity:  string,
    filters: Record<string, any>
  ): Promise<any[]> {
    if (this.options.provider) {
      // SQL via provider — résoudre la PK réelle au lieu de supposer 'id'
      const conditions = Object.entries(filters)
        .map(([k, v], i) => {
          const col = k === 'id' ? this.pkOf(entity) : k
          return `${entity}.${col} = $${i + 1}`
        })
        .join(' AND ')

      const sql    = conditions
        ? `SELECT * FROM ${entity} WHERE ${conditions}`
        : `SELECT * FROM ${entity}`
      const params = Object.values(filters)

      return this.options.provider.query(sql, params)
    }

    if (this.options.dataset) {
      // JSON en mémoire — chercher sur la PK réelle ou 'id'
      const pk   = this.pkOf(entity)
      const rows = this.options.dataset[entity] ?? []
      return rows.filter(row =>
        Object.entries(filters).every(([k, v]) => {
          const col = k === 'id' ? pk : k
          return row[col] === v
        })
      )
    }

    return []
  }

  /**
   * Fetch via route compilée — traverse from → to.
   */
  private async fetchViaRoute(
    from:    string,
    to:      string,
    filters: Record<string, any>
  ): Promise<any[]> {
    // Vérifier que la route existe
    let route
    try {
      route = this.queryEngine.getRoute(from, to)
    } catch {
      return this.fetchDirect(to, filters)
    }

    if (this.options.provider) {
      const sql = this.queryEngine.generateSQL({ from, to, filters })
      return this.options.provider.query(sql)
    }

    if (this.options.dataset) {
      const result = this.queryEngine.executeInMemory(
        { from, to, filters },
        this.options.dataset
      )
      return result
    }

    return []
  }
}
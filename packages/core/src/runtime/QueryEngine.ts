/**
 * QueryEngine — patch generateSQL pour les routes sémantiques
 *
 * Ajouter ce patch dans generateSQL() de QueryEngine.ts,
 * dans la boucle qui construit les JOIN :
 *
 *   for (let i = 0; i < edges.length; i++) {
 *     const curr = path[i]
 *     const next = path[i + 1]
 *     const edge = edges[i]
 *
 *     const fromCol = edge.fromCol === 'id' ? pkOf(curr) : edge.fromCol
 *     const toCol   = edge.toCol   === 'id' ? pkOf(next) : edge.toCol
 *
 *     // ── PATCH : condition semantic_view ────────────────────────────────
 *     const conditionSQL = edge.condition
 *       ? ' AND ' + Object.entries(edge.condition)
 *           .map(([k, v]) => `${next}.${k} = ${typeof v === 'string' ? `'${v}'` : v}`)
 *           .join(' AND ')
 *       : ''
 *     // ──────────────────────────────────────────────────────────────────
 *
 *     sql += `\n  INNER JOIN ${next} ON ${curr}.${fromCol} = ${next}.${toCol}${conditionSQL}`
 *   }
 *
 * Résultat pour movies→people[actor] (jobId:1) :
 *
 *   SELECT DISTINCT people.*
 *   FROM movies
 *     INNER JOIN credits ON movies.id = credits.movieId
 *     INNER JOIN people  ON credits.personId = people.id AND people.jobId = 1
 *
 * Note : la condition est sur la table de jonction (credits), pas sur people.
 * Le patch ci-dessus est une approximation — la condition correcte est :
 *
 *     INNER JOIN credits ON movies.id = credits.movieId AND credits.jobId = 1
 *     INNER JOIN people  ON credits.personId = people.id
 *
 * Voir generateSQLSemantic() ci-dessous pour la version correcte.
 */

import type { CompiledGraph, RouteInfo } from '../types/index.js'
import { shim } from '../instrumentation/TelemetryShim.js'

export interface QueryOptions {
  from:     string
  to:       string
  filters?: Record<string, any>
  trail?:   string
  traceId?: string
  // ── NOUVEAU : forcer une route sémantique spécifique
  semantic?: string   // ex: 'actor', 'director' — choisit la semantic_view correspondante
}

export class QueryEngine {
  // public pour que DataLoader puisse accéder aux nodes (résolution PK)
  constructor(public compiledGraph: CompiledGraph) {}

  public getRoute(from: string, to: string, semantic?: string): RouteInfo {
    // Si semantic fourni → chercher la route sémantique correspondante
    if (semantic) {
      const semRoute = (this.compiledGraph.routes as any[]).find(
        r => r.from === from && r.to === to && r.semantic && r.label === semantic
      )
      if (semRoute) return semRoute
    }

    // Route physique par défaut (première trouvée)
    const route = this.compiledGraph.routes.find(r => r.from === from && r.to === to)
    if (!route) throw new Error(`LinkLab: No route found between ${from} and ${to}`)
    return route
  }

  public generateSQL(options: QueryOptions): string {
    const { from, to, filters = {}, semantic } = options
    const route = this.getRoute(from, to, semantic)
    const { path, edges } = route.primary

    const pkOf = (tableId: string): string => {
      const node = this.compiledGraph.nodes.find((n: any) => n.id === tableId)
      const pk   = (node as any)?.primaryKey
      return Array.isArray(pk) ? pk[0] : (pk ?? tableId + '_id')
    }

    let sql = `SELECT DISTINCT ${to}.*\nFROM ${from}`

    for (let i = 0; i < edges.length; i++) {
      const curr = path[i]
      const next = path[i + 1]
      const edge = edges[i] as any

      const fromCol = edge.fromCol === 'id' ? pkOf(curr) : edge.fromCol
      const toCol   = edge.toCol   === 'id' ? pkOf(next) : edge.toCol

      // Condition semantic_view — appliquée sur la table de jonction (curr)
      // ex: credits.jobId = 1  (pas sur people)
      const conditionSQL = edge.condition
        ? ' AND ' + Object.entries(edge.condition as Record<string, unknown>)
            .map(([k, v]) => `${curr}.${k} = ${typeof v === 'string' ? `'${v}'` : v}`)
            .join(' AND ')
        : ''

      sql += `\n  INNER JOIN ${next} ON ${curr}.${fromCol} = ${next}.${toCol}${conditionSQL}`
    }

    const sourcePK      = pkOf(from)
    const whereClauses  = Object.entries(filters).map(([key, val]) => {
      const col = key === 'id' ? sourcePK : key
      const v   = val === null ? null : (typeof val === 'string' ? `'${val}'` : val)
      return v === null ? `${from}.${col} IS NULL` : `${from}.${col} = ${v}`
    })

    if (whereClauses.length > 0) sql += `\nWHERE ${whereClauses.join(' AND ')}`

    return sql
  }

  public executeInMemory(options: QueryOptions, dataset: Record<string, any[]>) {
    const { from, to, filters = {}, trail, traceId, semantic } = options

    const spanBuilder = shim.startSpan({ trail: trail ?? `${from}.${to}`, from, to, filters, traceId })
    spanBuilder?.stepStart('QueryEngine')

    try {
      const result = this._executeInMemoryCore(from, to, filters, dataset, semantic)

      spanBuilder?.stepEnd('QueryEngine')
      if (spanBuilder) {
        try {
          const route = this.getRoute(from, to, semantic)
          ;(spanBuilder as any).withPath?.(route.primary.path)
        } catch {}
        const span = spanBuilder.end({ rowCount: result.length })
        shim.emitEnd(span)
      }
      return result
    } catch (err) {
      spanBuilder?.stepEnd('QueryEngine')
      if (spanBuilder) {
        const span = spanBuilder.endWithError(err as Error, {
          compiledGraphHash: (this.compiledGraph as any).version ?? 'unknown',
          weights: {}, cacheState: { l1HitRate:0, l2HitRate:0, globalHitRate:0, yoyoEvents:0 },
        })
        shim.emitError(span)
      }
      throw err
    }
  }

  private _executeInMemoryCore(
    from: string, to: string,
    filters: Record<string, any>,
    dataset: Record<string, any[]>,
    semantic?: string
  ): any[] {
    const route       = this.getRoute(from, to, semantic)
    const { path, edges } = route.primary

    // Appliquer les filtres sur la table source
    const sourceRows  = dataset[from] ?? []
    const filtered    = Object.entries(filters).reduce((rows, [key, val]) => {
      return rows.filter((r: any) => r[key] === val)
    }, sourceRows)

    // Jointures successives
    let current: any[] = filtered

    for (let i = 0; i < edges.length; i++) {
      const currTable = path[i]
      const nextTable = path[i + 1]
      const edge      = edges[i] as any
      const nextRows  = dataset[nextTable] ?? []

      const fromCol = edge.fromCol === 'id' ? 'id' : edge.fromCol
      const toCol   = edge.toCol   === 'id' ? 'id' : edge.toCol

      // Condition semantic_view (ex: { jobId: 1 })
      const condition: Record<string, unknown> = edge.condition ?? {}

      current = current.flatMap(row => {
        const val = row[fromCol]
        return nextRows.filter((next: any) => {
          if (next[toCol] !== val) return false
          // Condition semantic_view appliquée sur 'next' (table de jonction)
          // ex: credits.jobId = 1 — credits est la table 'next' à ce step
          for (const [k, v] of Object.entries(condition)) {
            if (next[k] !== v) return false
          }
          return true
        })
      })

      // Dédoublonnage sur id
      const seen = new Set<unknown>()
      current = current.filter(r => {
        if (seen.has(r.id)) return false
        seen.add(r.id)
        return true
      })
    }

    return current
  }

  public generateJSONPipeline(options: QueryOptions) {
    const { from, to, filters = {}, semantic } = options
    const route = this.getRoute(from, to, semantic)
    const { path, edges } = route.primary
    return {
      metadata:      { from, to, steps: path.length, semantic: semantic ?? null },
      executionPlan: path.map((table, index) => {
        const isSource = index === 0
        return {
          step:   index + 1,
          action: isSource ? 'FETCH_AND_FILTER' : 'JOIN',
          table,
          config: isSource ? { filters } : { joinWith: path[index-1], on: edges[index-1] },
        }
      }),
    }
  }
}
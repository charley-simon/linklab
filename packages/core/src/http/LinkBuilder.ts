/**
 * LinkBuilder — Génère les liens HATEOAS depuis le graphe
 *
 * Logique pure, sans dépendance à Fastify.
 * Prend un Trail + un Graph, retourne des liens navigables.
 *
 * Trois catégories de liens générés automatiquement :
 *
 *   self      — l'URL courante (Trail sérialisé)
 *   up        — le parent (Trail sans la dernière frame)
 *   relations — toutes les arêtes sortantes du nœud courant
 *
 * Les liens émergent du graphe — le dev ne configure rien.
 */

import type { Graph, GraphEdge } from '../types/index.js'
import { Trail }       from '../navigation/Trail.js'
import { TrailParser } from '../navigation/TrailParser.js'

// ── Types ─────────────────────────────────────────────────────

export interface HateoasLink {
  href:     string
  method:   'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  templated?: boolean   // true si l'href contient {id}
  title?:   string      // label lisible — ex: "Films de Nolan"
  rel?:     string      // relation sémantique — ex: "movies"
}

export interface HateoasLinks {
  self:  HateoasLink
  up?:   HateoasLink
  [relation: string]: HateoasLink | undefined
}

export interface LinkBuilderOptions {
  /** Préfixe ajouté à toutes les URLs générées — ex: '/api/v1' */
  prefix?: string
  /** Inclure les arêtes inverses (retour vers le parent) */
  includeReverse?: boolean
  /** Exclure certaines relations — ex: ['internal', 'debug'] */
  exclude?: string[]
}

// ── LinkBuilder ───────────────────────────────────────────────

export class LinkBuilder {
  private graph:   Graph
  private options: Required<LinkBuilderOptions>

  constructor(graph: Graph, options: LinkBuilderOptions = {}) {
    this.graph   = graph
    this.options = {
      prefix:         options.prefix         ?? '',
      includeReverse: options.includeReverse ?? false,
      exclude:        options.exclude        ?? [],
    }
  }

  /**
   * Génère les liens HATEOAS pour un Trail donné.
   *
   * @example
   * ```typescript
   * const builder = new LinkBuilder(graph, { prefix: '/api' })
   * const links   = builder.from(trail)
   * // {
   * //   self:    { href: '/api/people/Nolan/movies' },
   * //   up:      { href: '/api/people/Nolan' },
   * //   actors:  { href: '/api/people/Nolan/movies/{id}/actors', templated: true },
   * //   ratings: { href: '/api/people/Nolan/movies/{id}/ratings', templated: true }
   * // }
   * ```
   */
  from(trail: Trail): HateoasLinks {
    const currentPath = this.prefix(TrailParser.toPath(trail))

    const links: HateoasLinks = {
      self: {
        href:   currentPath,
        method: 'GET',
        rel:    'self',
      }
    }

    // ── Frame courante ────────────────────────────────────────
    const current = trail.current

    // ── Lien "up" — parent dans le Trail ou collection ─────────
    // depth = 1 avec id : up vers la collection (ex: /movies/278 → up: /movies)
    // depth > 1 : up vers l'entité parente (ex: /movies/278/people → up: /movies/278)
    if (trail.depth === 1 && current?.id !== undefined) {
      links.up = {
        href:   this.prefix('/' + current.entity),
        method: 'GET',
        rel:    'up',
        title:  `Collection ${current.entity}`,
      }
    } else if (trail.depth > 1) {
      const parentTrail = trail.slice(trail.depth - 1)
      links.up = {
        href:   this.prefix(TrailParser.toPath(parentTrail)),
        method: 'GET',
        rel:    'up',
        title:  `Retour vers ${parentTrail.current?.entity}`,
      }
    }

    // ── Liens sortants — arêtes depuis le nœud courant ────────
    if (!current) return links

    const outgoing = this.getOutgoingEdges(current.entity)

    // Grouper les arêtes par entité cible (.to)
    // Plusieurs arêtes peuvent pointer vers la même entité (ex: actor, director, writer → people)
    // On génère un seul lien par entité cible, avec l'arête de poids minimal
    const byTarget = new Map<string, GraphEdge>()
    for (const edge of outgoing) {
      // Ignorer les relations exclues
      if (this.options.exclude.includes(edge.name ?? '')) continue
      if (this.options.exclude.includes(edge.to)) continue

      const edgeLabel = (edge as any).label ?? edge.name ?? ''
      // Préférer une edge avec un label significatif (pas 'unknow', pas vide)
      const isSignificant = edgeLabel && edgeLabel !== 'unknow'

      const existing = byTarget.get(edge.to)
      if (!existing) {
        byTarget.set(edge.to, edge)
      } else {
        const existingLabel = (existing as any).label ?? existing.name ?? ''
        const existingSignificant = existingLabel && existingLabel !== 'unknow'
        // Remplacer si : l'actuelle est insignifiante ET la nouvelle est significative,
        // ou les deux sont significatives et la nouvelle est moins lourde
        if ((!existingSignificant && isSignificant) ||
            (existingSignificant && isSignificant && edge.weight < existing.weight)) {
          byTarget.set(edge.to, edge)
        }
      }
    }

    for (const [targetEntity, edge] of byTarget) {
      // L'URL utilise l'entité cible comme segment — pas le nom de l'arête
      // /api/movies/278/people  (pas /api/movies/278/actor)
      const href = current.id !== undefined
        ? this.prefix(TrailParser.toPath(trail) + '/' + targetEntity)
        : this.prefix(TrailParser.toPath(trail) + '/{id}/' + targetEntity)

      const templated = current.id === undefined || href.includes('{id}')

      links[targetEntity] = {
        href,
        method:    'GET',
        templated: templated || undefined,
        rel:       targetEntity,
        title:     this.buildTitle(trail, edge),
      }
    }

    return links
  }

  /**
   * Génère les liens pour une collection de résultats.
   * Chaque item reçoit ses propres liens self + relations.
   *
   * @example
   * ```typescript
   * // GET /people/Nolan/movies → liste de films
   * const itemLinks = builder.forItems(trail, movies, 'id')
   * // itemLinks[0] = { self: { href: '/people/Nolan/movies/1' }, actors: {...} }
   * ```
   */
  forItems(
    trail:   Trail,
    items:   any[],
    idField: string = 'id'
  ): HateoasLinks[] {
    return items.map(item => {
      const id = item[idField]
      if (id === undefined) return this.from(trail)

      // Construire un Trail avec l'id de l'item
      const itemTrail = trail.clone()
      const last = itemTrail.current
      if (last) {
        // Remplacer la dernière frame avec l'id
        itemTrail.pop()
        itemTrail.push({ ...last, id, state: 'RESOLVED' })
      }

      return this.from(itemTrail)
    })
  }

  /**
   * Vérifie si une relation existe depuis un nœud donné.
   * Utile pour les hooks d'access.check.
   */
  hasRelation(fromEntity: string, relation: string): boolean {
    return this.graph.edges.some(
      e => e.from === fromEntity && (e.name === relation || e.to === relation)
    )
  }

  /**
   * Retourne toutes les entités accessibles depuis un nœud.
   */
  reachableFrom(entity: string): string[] {
    return this.getOutgoingEdges(entity).map(e => e.name ?? e.to)
  }

  // ── Privé ──────────────────────────────────────────────────

  private getOutgoingEdges(entity: string): GraphEdge[] {
    return this.graph.edges
      .filter(e => e.from === entity)
      .sort((a, b) => b.weight - a.weight)  // les plus utilisées en premier
  }

  private prefix(path: string): string {
    if (!this.options.prefix) return path
    return this.options.prefix.replace(/\/$/, '') + path
  }

  private buildTitle(trail: Trail, edge: GraphEdge): string {
    const current = trail.current

    // Résoudre un label lisible pour l'edge :
    //   1. edge.name explicite et non générique  (ex: 'LIST_OF_CREDITS', 'actor')
    //   2. edge.to comme fallback neutre          (ex: 'people', 'movies')
    const rawName = edge.name ?? ''
    const isGeneric = !rawName || rawName === 'unknow' || rawName === 'unknow_in'
    const edgeLabel = isGeneric ? edge.to : rawName

    if (!current) return edgeLabel

    const from = current.id !== undefined
      ? `${current.entity}(${current.id})`
      : current.entity

    return `${edgeLabel} de ${from}`
  }
}

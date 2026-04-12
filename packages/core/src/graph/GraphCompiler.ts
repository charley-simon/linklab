/**
 * GraphCompiler — v2.0.0
 *
 * Changements vs v1 :
 *   - Routes sémantiques (semantic_view) compilées et incluses
 *   - compiled-graph contient physical + semantic routes
 *   - version bump : '2.0.0'
 */

import type { Graph, CompiledGraph, CompilerConfig, RouteInfo, MetricsMap } from '../types/index.js'
import { PathFinder } from '../core/PathFinder.js'

export interface EdgeMetadata {
  fromCol: string
  toCol: string
  // Condition portée sur la table SOURCE du JOIN (ex: credits.jobId = 1)
  condition?: Record<string, unknown>
  label?: string
}

export class GraphCompiler {
  private config: Required<CompilerConfig>

  constructor(config: Partial<CompilerConfig> = {}) {
    this.config = {
      weightThreshold: config.weightThreshold ?? 1000,
      minUsage: config.minUsage ?? 0,
      keepFallbacks: config.keepFallbacks ?? true,
      maxFallbacks: config.maxFallbacks ?? 2
    }
  }

  compile(graph: Graph, metrics: MetricsMap): CompiledGraph {
    console.log('🔧 Compiling optimized graph (v2 — physical + semantic)...\n')

    const compiled: CompiledGraph = {
      version: '2.0.0',
      compiledAt: new Date().toISOString(),
      config: this.config,
      nodes: [...graph.nodes],
      routes: [],
      stats: { totalPairs: 0, routesCompiled: 0, routesFiltered: 0, compressionRatio: '0%' }
    }

    // ── Nœuds réels (depuis les edges) ───────────────────────────────────────
    const realNodes = new Set<string>()
    graph.edges.forEach(e => {
      realNodes.add(e.from)
      realNodes.add(e.to)
    })
    const nodeIds = Array.from(realNodes)

    // ── 1. Routes physiques ───────────────────────────────────────────────────
    const fkEdges = graph.edges.filter(
      (e: any) =>
        e.metadata?.type !== 'semantic_view' &&
        e.metadata?.type !== 'virtual' &&
        e.metadata?.type !== 'SEMANTIC'
    )
    // Ne créer un inverse synthétique que si l'inverse n'existe pas déjà
    // Évite les doublons sur les graphes déjà bidirectionnels (ex: metro)
    const existingPairs = new Set(fkEdges.map((e: any) => `${e.from}→${e.to}`))
    const inverseEdges = fkEdges
      .filter((e: any) => !existingPairs.has(`${e.to}→${e.from}`))
      .map((e: any) => ({
        ...e,
        from: e.to,
        to: e.from,
        name: `${e.name}_inv`,
        metadata: { ...e.metadata, type: 'physical_reverse' }
      }))
    const physicalGraph = { ...graph, edges: [...fkEdges, ...inverseEdges] }

    let kept = 0,
      filtered = 0
    const pairs = this.getAllPairs(nodeIds)

    for (const { from, to } of pairs) {
      const route = this.compilePath(from, to, physicalGraph, metrics)
      if (route) {
        compiled.routes.push(route as any)
        kept++
      } else {
        filtered++
      }
    }

    // ── 2. Routes sémantiques ─────────────────────────────────────────────────
    const semanticEdges = graph.edges.filter(
      (e: any) => e.metadata?.type === 'semantic_view' && e.metadata?.condition != null
    )

    let semanticKept = 0
    for (const edge of semanticEdges as any[]) {
      const route = this.compileSemanticRoute(edge, graph)
      if (route) {
        compiled.routes.push(route as any)
        semanticKept++
      }
    }

    // ── 2b. Routes virtuelles (edges custom sans FK) ──────────────────────────
    //
    // Les edges avec metadata.type === 'virtual' sont des relations déclarées
    // par le dev dans {alias}.override.json sans FK réelle dans la source.
    // Ex: { from: 'movies', to: 'categories', via: 'categories', type: 'virtual' }
    //
    // On génère une route directe via la table `via` si elle existe dans le graph,
    // ou une route directe from→to sinon.

    const virtualEdges = graph.edges.filter((e: any) => e.metadata?.type === 'virtual')

    let virtualKept = 0
    for (const edge of virtualEdges as any[]) {
      const { from, to, via, name, weight } = edge as any
      // Vérifier que from et to existent dans le graph
      if (!nodeIds.includes(from) || !nodeIds.includes(to)) continue

      const viaTable = via && nodeIds.includes(via) ? via : null
      const path = viaTable ? [from, viaTable, to] : [from, to]
      const edges = viaTable
        ? [
            { fromCol: 'id', toCol: 'id' },
            { fromCol: 'id', toCol: 'id' }
          ]
        : [{ fromCol: 'id', toCol: 'id' }]

      compiled.routes.push({
        from,
        to,
        semantic: false,
        composed: false,
        label: name ?? `virtual_${from}_${to}`,
        virtual: true,
        primary: {
          path,
          edges,
          weight: weight ?? 1,
          joins: path.length - 1,
          avgTime: weight ?? 1
        },
        fallbacks: [],
        alternativesDiscarded: 0
      } as any)
      virtualKept++
    }

    // ── 3. Routes composées : X(semA) → pivot → X(semB) ─────────────────────
    //
    // Détecte les paires de routes sémantiques qui partagent un pivot
    // et génère les routes composées correspondantes.
    //
    // Ex: people(director_in) → credits → movies → credits → people(actor)
    //     = "acteurs des films dirigés par X"
    //     label: "director_in→actor"

    const compiledSemRoutes = compiled.routes.filter((r: any) => r.semantic) as any[]
    let composedKept = 0

    // Grouper par entité source
    const semByFrom = new Map<string, any[]>()
    for (const r of compiledSemRoutes) {
      if (!semByFrom.has(r.from)) semByFrom.set(r.from, [])
      semByFrom.get(r.from)!.push(r)
    }

    // Pour chaque entité, chercher les paires (outRoute, inRoute) via un pivot commun
    for (const [entityId, outRoutes] of semByFrom) {
      // Routes qui arrivent sur entityId
      const inRoutes = compiledSemRoutes.filter((r: any) => r.to === entityId)
      if (!inRoutes.length) continue

      for (const rOut of outRoutes) {
        const pivot = rOut.to
        // Routes qui partent de pivot ET arrivent sur entityId
        const matchingIn = inRoutes.filter((r: any) => r.from === pivot)

        for (const rIn of matchingIn) {
          // Éviter les routes identiques (même label)
          if (rOut.label === rIn.label) continue

          const composedLabel = `${rOut.label}→${rIn.label}`
          const composedWeight = rOut.primary.weight + rIn.primary.weight
          const composedPath = [...rOut.primary.path, ...rIn.primary.path.slice(1)]
          const composedEdges = [...rOut.primary.edges, ...rIn.primary.edges]

          // Vérifier les métriques — si la route est disqualifiée, l'ignorer
          // Clé composée = même format que train.ts
          const metricKey = `composed:${entityId}→${entityId}:${composedLabel}`
          const metric = metrics.get(metricKey)
          if (metrics.size > 0) {
            // Des métriques existent (post-train) → filtrer strictement
            if (!metric) continue // route absente = non testée ou filtrée
            const w = metric.avgTime ?? composedWeight
            if (!metric.used || w > this.config.weightThreshold) continue
          }

          compiled.routes.push({
            from: entityId,
            to: entityId,
            semantic: true,
            composed: true,
            label: composedLabel,
            primary: {
              path: composedPath,
              edges: composedEdges,
              weight: composedWeight,
              joins: composedPath.length - 1,
              avgTime: composedWeight
            },
            fallbacks: [],
            alternativesDiscarded: 0
          } as any)
          composedKept++
        }
      }
    }

    compiled.stats = {
      totalPairs: pairs.length,
      routesCompiled: kept + semanticKept + virtualKept + composedKept,
      routesFiltered: filtered,
      compressionRatio: '—'
    }

    console.log('\n✅ Compilation complete:')
    console.log(`   Physical routes:  ${kept}`)
    console.log(`   Semantic routes:  ${semanticKept}`)
    console.log(`   Composed routes:  ${composedKept}`)
    console.log(`   Filtered:         ${filtered}`)

    return compiled
  }

  // ── Route sémantique ─────────────────────────────────────────────────────────
  //
  // movies→people[actor] (via credits, condition: { jobId: 1 })
  //
  //   path  = ['movies', 'credits', 'people']
  //   edges = [
  //     { fromCol:'id', toCol:'movieId', condition:{ jobId:1 }, label:'actor' }
  //     { fromCol:'personId', toCol:'id' }
  //   ]
  //
  // SQL généré :
  //   INNER JOIN credits ON movies.id = credits.movieId AND credits.jobId = 1
  //   INNER JOIN people  ON credits.personId = people.id

  private compileSemanticRoute(edge: any, graph: Graph): any | null {
    const { from, to, via, metadata } = edge
    const condition: Record<string, unknown> = metadata.condition ?? {}
    const label: string = edge.name ?? metadata.label ?? 'view'

    // Trouver edge from→via (ex: movies→credits, physical_reverse)
    const e1Raw = graph.edges.find(
      (e: any) =>
        ((e.from === from && e.to === via) || (e.from === via && e.to === from)) &&
        (e.metadata?.type === 'physical' || e.metadata?.type === 'physical_reverse')
    )
    // Trouver edge via→to (ex: credits→people, physical)
    const e2Raw = graph.edges.find(
      (e: any) =>
        ((e.from === via && e.to === to) || (e.from === to && e.to === via)) &&
        (e.metadata?.type === 'physical' || e.metadata?.type === 'physical_reverse')
    )

    if (!e1Raw || !e2Raw) return null

    // Edge 1 : movies → credits
    // movies.id = credits.movieId  + condition credits.jobId = 1
    const e1IsReversed = e1Raw.from === via // ex: physical dit credits→movies, on traverse movies→credits
    const e1: EdgeMetadata = {
      fromCol: e1IsReversed ? 'id' : (e1Raw.via ?? 'id'),
      toCol: e1IsReversed ? (e1Raw.via ?? 'id') : 'id',
      condition, // condition sur la table JOIN courante (credits)
      label
    }

    // Edge 2 : credits → people
    // credits.personId = people.id  (pas de condition)
    const e2IsReversed = e2Raw.from === to // ex: physical dit people→credits
    const e2: EdgeMetadata = {
      fromCol: e2IsReversed ? 'id' : (e2Raw.via ?? 'id'),
      toCol: e2IsReversed ? (e2Raw.via ?? 'id') : 'id'
    }

    return {
      from,
      to,
      semantic: true,
      label,
      primary: {
        path: [from, via, to],
        edges: [e1, e2],
        weight: edge.weight ?? 0.8,
        joins: 2,
        avgTime: edge.weight ?? 0.8
      },
      fallbacks: [],
      alternativesDiscarded: 0
    }
  }

  // ── Routes physiques (identique v1) ──────────────────────────────────────────

  private getAllPairs(nodeIds: string[]): Array<{ from: string; to: string }> {
    const pairs: Array<{ from: string; to: string }> = []
    for (const from of nodeIds) for (const to of nodeIds) if (from !== to) pairs.push({ from, to })
    return pairs
  }

  private compilePath(from: string, to: string, graph: Graph, metrics: MetricsMap): any | null {
    const finder = new PathFinder(graph)
    const allPaths = finder.findAllPaths(from, to, 5)
    if (!allPaths.length) return null

    const pathsWithMetrics = allPaths.map(path => {
      const key = path.join('→')
      const metric = metrics.get(key)
      let w = 0
      for (let i = 0; i < path.length - 1; i++) {
        const ee = graph.edges.filter(
          e =>
            (e.from === path[i] && e.to === path[i + 1]) ||
            (e.from === path[i + 1] && e.to === path[i])
        )
        const ws = ee.map(e => Number(e.weight)).filter(x => !isNaN(x))
        w += ws.length ? Math.min(...ws) : 1
      }
      const finalWeight = metric && !isNaN(metric.avgTime) ? metric.avgTime : w
      return {
        path,
        key,
        weight: finalWeight,
        failed: metric?.failed === true,
        used: metric ? metric.used : true
      }
    })

    const valid = pathsWithMetrics
      .filter(p => !p.failed && p.used !== false)
      .filter(p => !isNaN(p.weight) && p.weight <= this.config.weightThreshold)
      .sort((a, b) => a.weight - b.weight)

    if (!valid.length) return null

    const unique: typeof valid = []
    const seen = new Set<string>()
    for (const p of valid) {
      if (!seen.has(p.key)) {
        unique.push(p)
        seen.add(p.key)
      }
    }

    const best = unique[0]
    const fallbacks = this.config.keepFallbacks ? unique.slice(1, this.config.maxFallbacks + 1) : []

    const primaryEdges = this.resolveEdges(best.path, graph)
    if (!primaryEdges) return null

    return {
      from,
      to,
      primary: {
        path: best.path,
        edges: primaryEdges,
        weight: best.weight,
        joins: best.path.length - 1,
        avgTime: best.weight
      },
      fallbacks: fallbacks
        .map(fb => {
          const ee = this.resolveEdges(fb.path, graph)
          if (!ee) return null
          return {
            path: fb.path,
            edges: ee,
            weight: fb.weight,
            joins: fb.path.length - 1,
            avgTime: fb.weight
          }
        })
        .filter((fb): fb is NonNullable<typeof fb> => fb !== null),
      alternativesDiscarded: unique.length - 1 - fallbacks.length
    }
  }

  private resolveEdges(path: string[], graph: any): EdgeMetadata[] | null {
    const result: EdgeMetadata[] = []
    const nodeNames = new Set(graph.nodes.map((n: any) => n.id))

    for (let i = 0; i < path.length - 1; i++) {
      const from = path[i],
        to = path[i + 1]
      const edgeDirect = graph.edges.find((e: any) => e.from === from && e.to === to)
      const edgeReverse = graph.edges.find((e: any) => e.from === to && e.to === from)
      const edge = edgeDirect ?? edgeReverse
      const isReversed = !edgeDirect && !!edgeReverse

      if (!edge) {
        result.push({ fromCol: 'id', toCol: `${from.toLowerCase()}Id` })
        continue
      }

      if (edge.metadata?.type === 'semantic_view' && nodeNames.has(edge.via)) return null

      const flipCols = edge.metadata?.type === 'physical_reverse' || isReversed
      result.push({
        fromCol: flipCols ? 'id' : edge.via || 'id',
        toCol: flipCols ? edge.via || 'id' : 'id'
      })
    }
    return result
  }

  static getStats(compiled: CompiledGraph) {
    const routes = compiled.routes as any[]
    const semantic = routes.filter(r => r.semantic && !r.composed).length
    const composed = routes.filter(r => r.composed).length
    const physical = routes.length - semantic - composed
    if (!routes.length)
      return { totalRoutes: 0, fallbackRatio: '0%', semantic: 0, physical: 0, composed: 0 }
    const withFallbacks = routes.filter(r => r.fallbacks.length > 0).length
    return {
      totalRoutes: routes.length,
      physical,
      semantic,
      composed,
      fallbackRatio: ((withFallbacks / routes.length) * 100).toFixed(1) + '%'
    }
  }
}

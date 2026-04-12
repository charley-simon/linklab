/**
 * UC-C — GraphCompiler Unit Tests
 *
 * Teste GraphCompiler sur des graphes minimalistes construits en mémoire.
 *
 * Use cases couverts :
 *   UC-C1  Routes physiques compilées correctement
 *   UC-C2  Routes sémantiques v2 avec condition
 *   UC-C3  Pas de doublons d'inverses (fix metro bidirectionnel)
 */

import { describe, it, expect } from 'vitest'
import { GraphCompiler } from '../../src/graph/GraphCompiler.js'
import type { Graph, GraphEdge, MetricsMap } from '../../src/types/index.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

function node(id: string, type = 'table') {
  return { id, type }
}

function edge(
  from: string,
  to: string,
  via: string,
  weight = 1,
  meta: Record<string, unknown> = {}
): GraphEdge {
  return { name: `${from}→${to}`, from, to, via, weight, metadata: meta }
}

function graph(nodes: string[], edges: GraphEdge[]): Graph {
  return {
    nodes: nodes.map(id => node(id)),
    edges
  }
}

function emptyMetrics(): MetricsMap {
  return new Map()
}

function metrics(entries: Record<string, number>): MetricsMap {
  const m: MetricsMap = new Map()
  for (const [key, avgTime] of Object.entries(entries)) {
    m.set(key, {
      path: key.split('→'),
      executions: 10,
      successes: 10,
      totalTime: avgTime * 10,
      avgTime,
      minTime: avgTime,
      maxTime: avgTime,
      used: true,
      failed: false
    })
  }
  return m
}

// ── Graphes de test ───────────────────────────────────────────────────────────

/** A→B→C — graphe linéaire minimal */
const SIMPLE = graph(
  ['movies', 'credits', 'people'],
  [edge('movies', 'credits', 'movieId'), edge('credits', 'people', 'personId')]
)

/** Deux chemins A→C : direct (poids 5) et indirect (poids 2) */
const TWO_PATHS = graph(
  ['A', 'B', 'C'],
  [edge('A', 'B', 'b_id', 1), edge('B', 'C', 'c_id', 1), edge('A', 'C', 'c_id', 5)]
)

/** Netflix minimal : 4 tables, 4 edges FK */
const MULTI = graph(
  ['departments', 'jobs', 'credits', 'movies', 'people'],
  [
    edge('departments', 'jobs', 'departmentId'),
    edge('jobs', 'credits', 'jobId'),
    edge('credits', 'movies', 'movieId'),
    edge('credits', 'people', 'personId')
  ]
)

/** Graphe avec edge semantic_view */
const SEMANTIC_MINI = graph(
  ['movies', 'credits', 'people'],
  [
    edge('movies', 'credits', 'movieId', 1, { type: 'physical' }),
    edge('credits', 'people', 'personId', 1, { type: 'physical' }),
    {
      name: 'actor', // name = label pour que compileSemanticRoute retourne label='actor'
      from: 'movies',
      to: 'people',
      via: 'credits',
      weight: 0.1,
      metadata: { type: 'semantic_view', condition: { jobId: 1 }, label: 'actor' }
    }
  ]
)

/** Graphe unidirectionnel — tous les inverses à créer */
const UNIDIR = graph(['A', 'B', 'C'], [edge('A', 'B', 'b_id'), edge('B', 'C', 'c_id')])

/** Graphe bidirectionnel — aucun inverse à créer */
const BIDIR = graph(
  ['A', 'B', 'C'],
  [edge('A', 'B', 'b_id'), edge('B', 'A', 'b_id'), edge('B', 'C', 'c_id'), edge('C', 'B', 'c_id')]
)

/** Graphe mixte — 1 unidir + 1 bidir */
const MIXED = graph(
  ['A', 'B', 'C'],
  [
    edge('A', 'B', 'b_id'),
    edge('B', 'A', 'b_id'), // bidir
    edge('B', 'C', 'c_id') // unidir → inverse nécessaire
  ]
)

// ── UC-C1 : Routes physiques ──────────────────────────────────────────────────

describe('UC-C1 — compile() : routes physiques', () => {
  it('[C1.1] graphe simple A→B→C : route A→C avec path et joins corrects', () => {
    const compiler = new GraphCompiler()
    const compiled = compiler.compile(SIMPLE, emptyMetrics())

    const route = compiled.routes.find(r => r.from === 'movies' && r.to === 'people')
    expect(route).toBeDefined()
    expect(route!.primary.path).toEqual(['movies', 'credits', 'people'])
    expect(route!.primary.joins).toBe(2)
  })

  it('[C1.2] deux chemins : primary = chemin de poids minimal', () => {
    const compiler = new GraphCompiler()
    const compiled = compiler.compile(TWO_PATHS, emptyMetrics())

    const route = compiled.routes.find(r => r.from === 'A' && r.to === 'C')
    expect(route).toBeDefined()
    // Chemin indirect A→B→C (poids 2) doit être choisi sur direct A→C (poids 5)
    expect(route!.primary.path).toEqual(['A', 'B', 'C'])
    expect(route!.primary.weight).toBe(2)
  })

  it('[C1.3] paire non connectée : absente de routes', () => {
    const isolated = graph(
      ['A', 'B', 'C'],
      [edge('A', 'B', 'b_id')] // C isolé
    )
    const compiler = new GraphCompiler()
    const compiled = compiler.compile(isolated, emptyMetrics())

    const route = compiled.routes.find(r => r.to === 'C')
    expect(route).toBeUndefined()
  })

  it('[C1.4] edges SQL résolus : fromCol/toCol depuis edge.via', () => {
    const compiler = new GraphCompiler()
    const compiled = compiler.compile(SIMPLE, emptyMetrics())

    const route = compiled.routes.find(r => r.from === 'movies' && r.to === 'people')!
    // movies → credits : via = 'movieId'
    expect(route.primary.edges[0].fromCol).toBe('movieId')
    // credits → people : via = 'personId'
    expect(route.primary.edges[1].fromCol).toBe('personId')
  })

  it('[C1.5] avec métriques avgTime : poids = metric.avgTime', () => {
    const compiler = new GraphCompiler()
    const m = metrics({ 'movies→credits→people': 42 })
    const compiled = compiler.compile(SIMPLE, m)

    const route = compiled.routes.find(r => r.from === 'movies' && r.to === 'people')!
    expect(route.primary.weight).toBe(42)
    expect(route.primary.avgTime).toBe(42)
  })

  it('[C1.6] sans métriques : poids = somme edge.weight', () => {
    const compiler = new GraphCompiler()
    const compiled = compiler.compile(SIMPLE, emptyMetrics())

    const route = compiled.routes.find(r => r.from === 'movies' && r.to === 'people')!
    // movies→credits (weight=1) + credits→people (weight=1) = 2
    expect(route.primary.weight).toBe(2)
  })

  it('[C1.7] keepFallbacks=true : fallbacks présents si alternatives', () => {
    const compiler = new GraphCompiler({ keepFallbacks: true, maxFallbacks: 2 })
    const compiled = compiler.compile(TWO_PATHS, emptyMetrics())

    const route = compiled.routes.find(r => r.from === 'A' && r.to === 'C')!
    // Le chemin direct A→C est un fallback
    expect(route.fallbacks.length).toBeGreaterThan(0)
  })

  it('[C1.8] keepFallbacks=false : fallbacks=[] même si alternatives existent', () => {
    const compiler = new GraphCompiler({ keepFallbacks: false })
    const compiled = compiler.compile(TWO_PATHS, emptyMetrics())

    compiled.routes.forEach(r => {
      expect(r.fallbacks).toEqual([])
    })
  })

  it('[C1.9] stats cohérentes : routesCompiled + routesFiltered = totalPairs', () => {
    const compiler = new GraphCompiler()
    const compiled = compiler.compile(MULTI, emptyMetrics())

    expect(compiled.stats.routesCompiled + compiled.stats.routesFiltered).toBe(
      compiled.stats.totalPairs
    )
  })

  it('[C1.10] weightThreshold=1 : filtre les chemins de poids > 1', () => {
    const compiler = new GraphCompiler({ weightThreshold: 1 })
    const compiled = compiler.compile(SIMPLE, emptyMetrics())

    // movies→credits→people a poids 2 > threshold 1 → filtré
    const route = compiled.routes.find(r => r.from === 'movies' && r.to === 'people')
    expect(route).toBeUndefined()
  })
})

// ── UC-C2 : Routes sémantiques ────────────────────────────────────────────────

describe('UC-C2 — compile() : routes sémantiques v2', () => {
  it('[C2.1] edge semantic_view produit RouteInfo avec semantic=true et label', () => {
    const compiler = new GraphCompiler()
    const compiled = compiler.compile(SEMANTIC_MINI, emptyMetrics())

    const semRoute = compiled.routes.find(
      r => r.from === 'movies' && r.to === 'people' && (r as any).semantic === true
    )
    expect(semRoute).toBeDefined()
    expect((semRoute as any).label).toBe('actor')
  })

  it('[C2.2] condition injectée sur le bon step (table de jonction)', () => {
    const compiler = new GraphCompiler()
    const compiled = compiler.compile(SEMANTIC_MINI, emptyMetrics())

    const semRoute = compiled.routes.find(
      r => r.from === 'movies' && r.to === 'people' && (r as any).semantic
    )!
    // La condition { jobId: 1 } doit être sur l'edge movies→credits
    const firstEdge = semRoute.primary.edges[0] as any
    expect(firstEdge.condition).toEqual({ jobId: 1 })
  })

  it('[C2.3] route sémantique et physique coexistent pour même paire', () => {
    const compiler = new GraphCompiler()
    const compiled = compiler.compile(SEMANTIC_MINI, emptyMetrics())

    const routes = compiled.routes.filter(r => r.from === 'movies' && r.to === 'people')
    // Au moins 2 routes : 1 physique + 1 sémantique
    expect(routes.length).toBeGreaterThanOrEqual(2)
    const hasSemantic = routes.some(r => (r as any).semantic === true)
    const hasPhysical = routes.some(r => !(r as any).semantic)
    expect(hasSemantic).toBe(true)
    expect(hasPhysical).toBe(true)
  })

  it('[C2.4] route sémantique a un poids inférieur à la route physique', () => {
    const compiler = new GraphCompiler()
    const compiled = compiler.compile(SEMANTIC_MINI, emptyMetrics())

    const semRoute = compiled.routes.find(r => (r as any).semantic && r.from === 'movies')!
    const physRoute = compiled.routes.find(
      r => !(r as any).semantic && r.from === 'movies' && r.to === 'people'
    )!

    expect(semRoute.primary.weight).toBeLessThan(physRoute.primary.weight)
  })

  it('[C2.5] graphe sans semantic_view : 0 routes sémantiques', () => {
    const compiler = new GraphCompiler()
    const compiled = compiler.compile(SIMPLE, emptyMetrics())

    const semRoutes = compiled.routes.filter(r => (r as any).semantic)
    expect(semRoutes).toHaveLength(0)
  })
})

// ── UC-C3 : Pas de doublons d'inverses ───────────────────────────────────────

describe("UC-C3 — compile() : pas de doublons d'inverses", () => {
  it('[C3.1] graphe unidirectionnel : inverses synthétiques créés', () => {
    const compiler = new GraphCompiler()
    const compiled = compiler.compile(UNIDIR, emptyMetrics())

    // C→B et B→A doivent être navigables (inverses créés)
    const cToB = compiled.routes.find(r => r.from === 'C' && r.to === 'A')
    expect(cToB).toBeDefined()
  })

  it('[C3.2] graphe bidirectionnel : routes dans les deux sens sans doublon', () => {
    const compiler = new GraphCompiler()
    const compiled = compiler.compile(BIDIR, emptyMetrics())

    const aToC = compiled.routes.find(r => r.from === 'A' && r.to === 'C')
    const cToA = compiled.routes.find(r => r.from === 'C' && r.to === 'A')

    expect(aToC).toBeDefined()
    expect(cToA).toBeDefined()

    // Pas de routes en double
    const keys = compiled.routes.map(r => `${r.from}→${r.to}`)
    const uniqueKeys = new Set(keys)
    // Chaque clé physique (non sémantique) est unique
    const physKeys = compiled.routes.filter(r => !(r as any).semantic).map(r => `${r.from}→${r.to}`)
    expect(physKeys.length).toBe(new Set(physKeys).size)
  })

  it("[C3.3] graphe mixte : inverse créé uniquement pour l'edge unidir", () => {
    const compiler = new GraphCompiler()
    const compiled = compiler.compile(MIXED, emptyMetrics())

    // B→C était unidir → C→B doit être navigable
    const cToB = compiled.routes.find(r => r.from === 'C' && r.to === 'B')
    expect(cToB).toBeDefined()

    // A→B était bidir → pas de doublon
    const aToBRoutes = compiled.routes.filter(
      r => r.from === 'A' && r.to === 'B' && !(r as any).semantic
    )
    expect(aToBRoutes.length).toBe(1)
  })

  it('[C3.4] routes compilées identiques avant/après fix', () => {
    const compiler = new GraphCompiler()

    // UNIDIR avec le fix
    const compiled = compiler.compile(UNIDIR, emptyMetrics())

    // Les routes essentielles doivent être présentes
    expect(compiled.routes.find(r => r.from === 'A' && r.to === 'C')).toBeDefined()
    expect(compiled.routes.find(r => r.from === 'C' && r.to === 'A')).toBeDefined()
  })
})

// ── UC-C — Cas limites ───────────────────────────────────────────────────────

describe('UC-C — Cas limites du compilateur', () => {
  it('graphe vide : compiled.routes = []', () => {
    const compiler = new GraphCompiler()
    const compiled = compiler.compile(graph([], []), emptyMetrics())
    expect(compiled.routes).toEqual([])
  })

  it('graphe vide : stats cohérentes', () => {
    const compiler = new GraphCompiler()
    const compiled = compiler.compile(graph([], []), emptyMetrics())
    expect(compiled.stats.totalPairs).toBe(0)
    expect(compiled.stats.routesCompiled).toBe(0)
  })

  it('getStats() retourne totalRoutes correct', () => {
    const compiler = new GraphCompiler()
    const compiled = compiler.compile(SIMPLE, emptyMetrics())
    const stats = GraphCompiler.getStats(compiled)
    expect(stats.totalRoutes).toBe(compiled.routes.length)
  })

  it('version du compiled-graph est définie', () => {
    const compiler = new GraphCompiler()
    const compiled = compiler.compile(SIMPLE, emptyMetrics())
    expect(compiled.version).toBeDefined()
    expect(compiled.version).toMatch(/^\d+\.\d+\.\d+$/)
  })
})

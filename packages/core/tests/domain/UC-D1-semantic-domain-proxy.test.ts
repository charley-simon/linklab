/**
 * UC-D1 — DomainProxy : résolution des labels sémantiques
 *
 * Teste que DomainNode résout les labels sémantiques (actor, director, writer)
 * depuis compiled.routes, et passe le paramètre semantic au QueryEngine.
 *
 * Use cases couverts :
 *   UC-D1  Résolution sémantique dans DomainProxy
 */

import { describe, it, expect } from 'vitest'
import { Graph } from '../../src/api/Graph.js'
import type { Graph as GraphData, CompiledGraph, RouteInfo } from '../../src/types/index.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

function route(
  from: string,
  to: string,
  path: string[],
  edges: Array<{ fromCol: string; toCol: string; condition?: Record<string, any> }>,
  opts: { semantic?: boolean; label?: string; weight?: number } = {}
): RouteInfo {
  return {
    from,
    to,
    ...(opts.semantic !== undefined && { semantic: opts.semantic }),
    ...(opts.label !== undefined && { label: opts.label }),
    primary: {
      path,
      edges,
      weight: opts.weight ?? path.length - 1,
      joins: path.length - 1,
      avgTime: opts.weight ?? path.length - 1
    },
    fallbacks: [],
    alternativesDiscarded: 0
  } as RouteInfo
}

function makeCompiledGraph(routes: RouteInfo[]): CompiledGraph {
  const nodeIds = [...new Set(routes.flatMap(r => r.primary.path))]
  return {
    version: '2.0.0',
    compiledAt: new Date().toISOString(),
    config: { weightThreshold: 1000, keepFallbacks: true, maxFallbacks: 2 },
    nodes: nodeIds.map(id => ({ id, type: 'table', primaryKey: 'id' })),
    routes,
    stats: {
      totalPairs: routes.length,
      routesCompiled: routes.length,
      routesFiltered: 0,
      compressionRatio: '0%'
    }
  }
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

// Route physique people → movies
const ROUTE_PEOPLE_MOVIES = route(
  'people',
  'movies',
  ['people', 'credits', 'movies'],
  [
    { fromCol: 'id', toCol: 'personId' },
    { fromCol: 'movieId', toCol: 'id' }
  ]
)

// Route physique movies → people
const ROUTE_MOVIES_PEOPLE = route(
  'movies',
  'people',
  ['movies', 'credits', 'people'],
  [
    { fromCol: 'id', toCol: 'movieId' },
    { fromCol: 'personId', toCol: 'id' }
  ]
)

// Route sémantique people → movies [director_in] (jobId=2)
const ROUTE_DIRECTOR_IN = route(
  'people',
  'movies',
  ['people', 'credits', 'movies'],
  [
    { fromCol: 'id', toCol: 'personId', condition: { jobId: 2 } },
    { fromCol: 'movieId', toCol: 'id' }
  ],
  { semantic: true, label: 'director_in', weight: 0.1 }
)

// Route sémantique people → movies [actor_in] (jobId=1)
const ROUTE_ACTOR_IN = route(
  'people',
  'movies',
  ['people', 'credits', 'movies'],
  [
    { fromCol: 'id', toCol: 'personId', condition: { jobId: 1 } },
    { fromCol: 'movieId', toCol: 'id' }
  ],
  { semantic: true, label: 'actor_in', weight: 0.1 }
)

// Route sémantique movies → people [director] (jobId=2)
const ROUTE_DIRECTOR = route(
  'movies',
  'people',
  ['movies', 'credits', 'people'],
  [
    { fromCol: 'id', toCol: 'movieId', condition: { jobId: 2 } },
    { fromCol: 'personId', toCol: 'id' }
  ],
  { semantic: true, label: 'director', weight: 0.1 }
)

// Route sémantique movies → people [actor] (jobId=1)
const ROUTE_ACTOR = route(
  'movies',
  'people',
  ['movies', 'credits', 'people'],
  [
    { fromCol: 'id', toCol: 'movieId', condition: { jobId: 1 } },
    { fromCol: 'personId', toCol: 'id' }
  ],
  { semantic: true, label: 'actor', weight: 0.1 }
)

const COMPILED = makeCompiledGraph([
  ROUTE_PEOPLE_MOVIES,
  ROUTE_MOVIES_PEOPLE,
  ROUTE_DIRECTOR_IN,
  ROUTE_ACTOR_IN,
  ROUTE_DIRECTOR,
  ROUTE_ACTOR
])

const RAW_GRAPH: GraphData = {
  nodes: [
    { id: 'movies', type: 'table', primaryKey: 'id' },
    { id: 'credits', type: 'table', primaryKey: 'id' },
    { id: 'people', type: 'table', primaryKey: 'id' }
  ],
  edges: [
    {
      from: 'movies',
      to: 'credits',
      name: 'LIST_OF_CREDITS',
      via: 'movieId',
      weight: 1,
      metadata: { type: 'physical_reverse' }
    },
    {
      from: 'credits',
      to: 'movies',
      name: 'FK_movieId',
      via: 'movieId',
      weight: 1,
      metadata: { type: 'physical' }
    },
    {
      from: 'credits',
      to: 'people',
      name: 'FK_personId',
      via: 'personId',
      weight: 1,
      metadata: { type: 'physical' }
    },
    {
      from: 'people',
      to: 'credits',
      name: 'LIST_OF_CREDITS',
      via: 'personId',
      weight: 1,
      metadata: { type: 'physical_reverse' }
    }
  ]
}

const DATASET = {
  movies: [
    { id: 278, title: 'The Shawshank Redemption' },
    { id: 680, title: 'Pulp Fiction' }
  ],
  credits: [
    { id: 1, movieId: 278, personId: 1, jobId: 1 }, // Robbins acteur dans 278
    { id: 2, movieId: 278, personId: 2, jobId: 2 }, // Darabont réalisateur dans 278
    { id: 3, movieId: 680, personId: 2, jobId: 2 } // Darabont réalisateur dans 680
  ],
  people: [
    { id: 1, name: 'Tim Robbins' },
    { id: 2, name: 'Frank Darabont' }
  ]
}

// ── UC-D1 : Résolution sémantique depuis compiled.routes ─────────────────────

describe('UC-D1 — DomainProxy : résolution des labels sémantiques', () => {
  const cinema = new Graph(RAW_GRAPH, { compiled: COMPILED, dataset: DATASET }).domain()

  it('[D1.1] cinema.directors("Darabont").movies → films réalisés (jobId=2)', async () => {
    const result = await (cinema as any).directors('Frank Darabont').movies
    expect(result).toBeDefined()
    expect(result.length).toBeGreaterThan(0)
    // Darabont a réalisé les films 278 et 680
    const ids = result.map((m: any) => m.id)
    expect(ids).toContain(278)
    expect(ids).toContain(680)
  })

  it('[D1.2] cinema.actors("Robbins").movies → films joués (jobId=1)', async () => {
    const result = await (cinema as any).actors('Tim Robbins').movies
    expect(result).toBeDefined()
    expect(result.length).toBeGreaterThan(0)
    // Robbins est acteur uniquement dans 278
    const ids = result.map((m: any) => m.id)
    expect(ids).toContain(278)
    expect(ids).not.toContain(680)
  })

  it('[D1.3] cinema.people("Darabont").movies → tous films (physique, jobId ignoré)', async () => {
    const result = await (cinema as any).people('Frank Darabont').movies
    expect(result).toBeDefined()
    const ids = result.map((m: any) => m.id)
    expect(ids).toContain(278)
    expect(ids).toContain(680)
  })

  it('[D1.4] résultats directors ⊆ résultats people pour même personne', async () => {
    const byDirector = await (cinema as any).directors('Frank Darabont').movies
    const byPeople = await (cinema as any).people('Frank Darabont').movies
    const dirIds = new Set(byDirector.map((m: any) => m.id))
    const peopIds = new Set(byPeople.map((m: any) => m.id))
    for (const id of dirIds) {
      expect(peopIds.has(id)).toBe(true)
    }
  })

  it('[D1.5] résultats actors ⊆ résultats people pour même personne', async () => {
    const byActor = await (cinema as any).actors('Tim Robbins').movies
    const byPeople = await (cinema as any).people('Tim Robbins').movies
    const actIds = new Set(byActor.map((m: any) => m.id))
    const peopIds = new Set(byPeople.map((m: any) => m.id))
    for (const id of actIds) {
      expect(peopIds.has(id)).toBe(true)
    }
  })

  it('[D1.6] cinema.movies(278).actors → Tim Robbins uniquement (jobId=1)', async () => {
    const result = await (cinema as any).movies(278).actors
    expect(result).toBeDefined()
    const names = result.map((p: any) => p.name)
    expect(names).toContain('Tim Robbins')
    expect(names).not.toContain('Frank Darabont')
  })

  it('[D1.7] cinema.movies(278).directors → Frank Darabont uniquement (jobId=2)', async () => {
    const result = await (cinema as any).movies(278).directors
    expect(result).toBeDefined()
    const names = result.map((p: any) => p.name)
    expect(names).toContain('Frank Darabont')
    expect(names).not.toContain('Tim Robbins')
  })

  it('[D1.8] cinema.movies(278).people → Tim + Frank (tous crédités)', async () => {
    const result = await (cinema as any).movies(278).people
    expect(result).toBeDefined()
    const names = result.map((p: any) => p.name)
    expect(names).toContain('Tim Robbins')
    expect(names).toContain('Frank Darabont')
  })

  it('[D1.9] sans compiledGraph : cinema.directors("X") → undefined (pas d\'exception)', () => {
    const cinemaNoCompiled = new Graph(RAW_GRAPH, { dataset: DATASET }).domain()
    expect(() => (cinemaNoCompiled as any).directors).not.toThrow()
    expect((cinemaNoCompiled as any).directors).toBeUndefined()
  })

  it("[D1.10] label inexistant → undefined silencieux (pas d'exception)", () => {
    expect(() => (cinema as any).unknownRole).not.toThrow()
    expect((cinema as any).unknownRole).toBeUndefined()
  })
})

/**
 * UC-T9 — Intégration NavigationEngine + QueryEngine
 *
 * Vérifie la chaîne complète :
 *   @linklab/core (moteurs) → TelemetryShim → @linklab/telemetry → traceBus
 *
 * Fixtures auto-suffisantes — pas de dépendance vers les JSON du projet.
 */

import { describe, it, expect, beforeAll, afterEach } from 'vitest'

// ── @linklab/telemetry ────────────────────────────────────────────────────────
import { traceBus } from '../src/bus/TraceBus.js'
import { SpanBuilder } from '../src/spans/SpanBuilder.js'
import type { Span } from '../src/types.js'

// ── @linklab/core ─────────────────────────────────────────────────────────────
import { injectTelemetry, shim, NavigationEngine, QueryEngine } from '@linklab/core'
import type { Graph, CompiledGraph, Frame } from '@linklab/core'

// ══════════════════════════════════════════════════════════════════════════════
// Fixtures
// ══════════════════════════════════════════════════════════════════════════════

const GRAPH_MINI: Graph = {
  nodes: [
    { id: 'movies', label: 'Movies' },
    { id: 'credits', label: 'Credits' },
    { id: 'people', label: 'People' }
  ],
  edges: [
    {
      name: 'movies_to_credits',
      from: 'movies',
      to: 'credits',
      via: 'movie_id',
      weight: 2,
      metadata: {}
    },
    {
      name: 'credits_to_movies',
      from: 'credits',
      to: 'movies',
      via: 'movie_id',
      weight: 2,
      metadata: {}
    },
    {
      name: 'credits_to_people',
      from: 'credits',
      to: 'people',
      via: 'person_id',
      weight: 2,
      metadata: {}
    },
    {
      name: 'people_to_credits',
      from: 'people',
      to: 'credits',
      via: 'person_id',
      weight: 2,
      metadata: {}
    }
  ]
}

const COMPILED_MINI: CompiledGraph = {
  version: '1.0.0',
  compiledAt: new Date().toISOString(),
  config: { weightThreshold: 0, keepFallbacks: false, maxFallbacks: 0 },
  nodes: [
    { id: 'movies', primaryKey: 'movie_id' } as any,
    { id: 'credits', primaryKey: ['movie_id', 'person_id'] } as any,
    { id: 'people', primaryKey: 'person_id' } as any
  ],
  routes: [
    {
      from: 'movies',
      to: 'people',
      primary: {
        path: ['movies', 'credits', 'people'],
        edges: [
          { fromCol: 'movie_id', toCol: 'movie_id' },
          { fromCol: 'person_id', toCol: 'person_id' }
        ]
      },
      fallbacks: []
    } as any
  ],
  stats: {} as any
}

const DATASET_MINI: Record<string, any[]> = {
  movies: [{ movie_id: 1, title: 'Inception' }],
  credits: [{ movie_id: 1, person_id: 10, role: 'director' }],
  people: [{ person_id: 10, name: 'Christopher Nolan' }]
}

function makeNavigateStack(): Frame[] {
  return [
    { entity: 'movies', id: 1, state: 'RESOLVED' },
    { entity: 'people', state: 'UNRESOLVED' }
  ]
}

interface ScheduleAction {
  name: string
  weight: number
  execute: (stack: Frame[], graph: Graph) => Promise<any>
  when?: (stack: Frame[]) => boolean
}

function makeScheduleActions(): ScheduleAction[] {
  return [{ name: 'browse_movies', weight: 1, execute: async () => ({ type: 'SUCCESS' }) }]
}

// ══════════════════════════════════════════════════════════════════════════════
// Setup
// ══════════════════════════════════════════════════════════════════════════════

beforeAll(() => {
  injectTelemetry({ SpanBuilder, traceBus })
})

afterEach(() => {
  traceBus.removeAllListeners()
})

// ══════════════════════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════════════════════

describe('UC-T9 — Intégration NavigationEngine + QueryEngine', () => {
  it('[t9-1] preloadTelemetry() → shim.active = true', () => {
    expect(shim.active).toBe(true)
  })

  it('[t9-2] PATHFIND → span:end reçu sur traceBus', async () => {
    const spans: Span[] = []
    traceBus.on('span:end', s => spans.push(s))
    await NavigationEngine.forPathfinding(GRAPH_MINI, {
      from: 'movies',
      to: 'people',
      maxPaths: 2
    }).run()
    expect(spans).toHaveLength(1)
  })

  it("[t9-3] PATHFIND → span.timings contient step 'PathFinder'", async () => {
    const spans: Span[] = []
    traceBus.on('span:end', s => spans.push(s))
    await NavigationEngine.forPathfinding(GRAPH_MINI, { from: 'movies', to: 'people' }).run()
    const pf = spans[0]?.timings.find(t => t.step === 'PathFinder')
    expect(pf).toBeDefined()
    expect(pf!.durationMs).toBeGreaterThanOrEqual(0)
  })

  it("[t9-4] PATHFIND → span.from = 'movies', span.to = 'people'", async () => {
    const spans: Span[] = []
    traceBus.on('span:end', s => spans.push(s))
    await NavigationEngine.forPathfinding(GRAPH_MINI, { from: 'movies', to: 'people' }).run()
    expect(spans[0].from).toBe('movies')
    expect(spans[0].to).toBe('people')
  })

  it("[t9-5] PATHFIND → span.timings contient step 'Total'", async () => {
    const spans: Span[] = []
    traceBus.on('span:end', s => spans.push(s))
    await NavigationEngine.forPathfinding(GRAPH_MINI, { from: 'movies', to: 'people' }).run()
    expect(spans[0]?.timings.find(t => t.step === 'Total')).toBeDefined()
  })

  it("[t9-6] NAVIGATE → span:end avec step 'Resolver'", async () => {
    const spans: Span[] = []
    traceBus.on('span:end', s => spans.push(s))
    await NavigationEngine.forNavigation(GRAPH_MINI, { stack: makeNavigateStack() }).run(2)
    expect(spans).toHaveLength(1)
    expect(spans[0].timings.find(t => t.step === 'Resolver')).toBeDefined()
  })

  it("[t9-7] SCHEDULE → span:end avec step 'Scheduler'", async () => {
    const spans: Span[] = []
    traceBus.on('span:end', s => spans.push(s))
    await NavigationEngine.forScheduling(GRAPH_MINI, { actions: makeScheduleActions() }).run(1)
    expect(spans).toHaveLength(1)
    expect(spans[0].timings.find(t => t.step === 'Scheduler')).toBeDefined()
  })

  it('[t9-8] QueryEngine.executeInMemory → span:end, rowCount = 1', async () => {
    const spans: Span[] = []
    traceBus.on('span:end', s => spans.push(s))
    const engine = new QueryEngine(COMPILED_MINI)
    const result = engine.executeInMemory(
      { from: 'movies', to: 'people', trail: 'movies(1).people', filters: { movie_id: 1 } },
      DATASET_MINI
    )
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Christopher Nolan')
    expect(spans).toHaveLength(1)
    expect(spans[0].rowCount).toBe(1)
  })

  it("[t9-9] QueryEngine → span.timings contient step 'QueryEngine'", async () => {
    const spans: Span[] = []
    traceBus.on('span:end', s => spans.push(s))
    new QueryEngine(COMPILED_MINI).executeInMemory(
      { from: 'movies', to: 'people', trail: 'movies.people' },
      DATASET_MINI
    )
    expect(spans[0]?.timings.find(t => t.step === 'QueryEngine')).toBeDefined()
  })

  it('[t9-10] Sans listener → emit silencieux, pas de crash', () => {
    const engine = new QueryEngine(COMPILED_MINI)
    expect(() => {
      engine.executeInMemory({ from: 'movies', to: 'people' }, DATASET_MINI)
    }).not.toThrow()
  })

  it("[t9-11] L'instrumentation n'altère pas les résultats métier", () => {
    const engine = new QueryEngine(COMPILED_MINI)
    const result = engine.executeInMemory({ from: 'movies', to: 'people' }, DATASET_MINI)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Christopher Nolan')
  })

  it('[t9-12] span.totalMs ≥ 0 pour PATHFIND, NAVIGATE, QueryEngine', async () => {
    const spans: Span[] = []
    traceBus.on('span:end', s => spans.push(s))
    await NavigationEngine.forPathfinding(GRAPH_MINI, { from: 'movies', to: 'people' }).run()
    await NavigationEngine.forNavigation(GRAPH_MINI, { stack: makeNavigateStack() }).run(1)
    new QueryEngine(COMPILED_MINI).executeInMemory({ from: 'movies', to: 'people' }, DATASET_MINI)
    expect(spans).toHaveLength(3)
    for (const span of spans) {
      expect(span.totalMs).toBeGreaterThanOrEqual(0)
    }
  })

  it('[t9-13] QueryEngine dataset vide → rowCount = 0, pas de throw', () => {
    const spans: Span[] = []
    traceBus.on('span:end', s => spans.push(s))
    const engine = new QueryEngine(COMPILED_MINI)
    let result: any[] = []
    expect(() => {
      result = engine.executeInMemory(
        { from: 'movies', to: 'people' },
        { movies: [], credits: [], people: [] }
      )
    }).not.toThrow()
    expect(result).toHaveLength(0)
    expect(spans[0]?.rowCount).toBe(0)
  })

  it('[t9-14] Chaque run() produit un spanId unique', () => {
    const spans: Span[] = []
    traceBus.on('span:end', s => spans.push(s))
    const engine = new QueryEngine(COMPILED_MINI)
    engine.executeInMemory({ from: 'movies', to: 'people' }, DATASET_MINI)
    engine.executeInMemory({ from: 'movies', to: 'people' }, DATASET_MINI)
    expect(spans).toHaveLength(2)
    expect(spans[0].spanId).not.toBe(spans[1].spanId)
  })
})

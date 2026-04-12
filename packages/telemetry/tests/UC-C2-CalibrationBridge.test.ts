/**
 * UC-C2 — CalibrationBridge
 *
 * Deux groupes de tests :
 *
 *   A) bridge-utils — computeNewWeight() : logique pure, zéro dépendance externe.
 *      Toutes les stratégies, clamping, cas limites.
 *
 *   B) onCalibrated wiring : vérifie que CalibrationJob appelle correctement
 *      le callback et que le wiring manuel (simulation du bridge) met à jour
 *      les edges et déclenche le reload.
 *      Pas d'import @linklab/core — Graph et CompiledGraph sont des objets littéraux.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { computeNewWeight }     from '../src/calibration/bridge-utils.js'
import { CalibrationJob }       from '../src/calibration/CalibrationJob.js'
import { DuckDBDriver }         from '../src/drivers/DuckDBDriver.js'
import { LatencyBaselineStore } from '../src/metrics/LatencyBaseline.js'
import { traceBus }             from '../src/bus/TraceBus.js'
import type { Span }            from '../src/types.js'
import type { CalibrationResult } from '../src/calibration/CalibrationJob.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSpan(overrides: Partial<Span> = {}): Span {
  return {
    spanId:      `span-${Math.random().toString(36).slice(2)}`,
    traceId:     'trace-1',
    timestamp:   Date.now(),
    trail:       'movies(278).people',
    from:        'movies',
    to:          'people',
    path:        ['movies', 'credits', 'people'],
    filters:     {},
    timings:     [],
    totalMs:     50,
    rowCount:    10,
    cacheEvents: [],
    ...overrides,
  } as Span
}

async function writeSpans(driver: DuckDBDriver, spans: Partial<Span>[]): Promise<void> {
  for (const s of spans) await driver.write(makeSpan(s))
}

// Edge minimal qui respecte l'interface GraphEdge
function makeEdge(from: string, to: string, weight = 10) {
  return { from, to, weight, name: `${from}->${to}`, via: 'id' }
}

// ── Setup ─────────────────────────────────────────────────────────────────────

let driver:  DuckDBDriver
let latency: LatencyBaselineStore
let job:     CalibrationJob

beforeEach(async () => {
  driver  = new DuckDBDriver({ dbPath: ':memory:' })
  latency = new LatencyBaselineStore()
  await driver.connect()
  job = new CalibrationJob({
    duckdb: driver, latency, bus: traceBus,
    windowMs: 60_000, intervalMs: 999_999, initialDelayMs: 999_999,
    minSamples: 3,
  })
})

afterEach(async () => {
  job.stop()
  await driver.disconnect()
})

// ── A) bridge-utils — computeNewWeight() ──────────────────────────────────────

describe('UC-C2-A — computeNewWeight()', () => {

  it('[c-13a] direct → weight = p90 brut', () => {
    expect(computeNewWeight(80, 10, { strategy: 'direct' })).toBe(80)
  })

  it('[c-13b] normalized → weight = p90 / 100', () => {
    expect(computeNewWeight(200, 10, { strategy: 'normalized' })).toBeCloseTo(2.0)
    expect(computeNewWeight(50,  10, { strategy: 'normalized' })).toBeCloseTo(0.5)
  })

  it('[c-13c] smoothed → lissage exponentiel', () => {
    // w = 0.7 × 20 + 0.3 × 100 = 14 + 30 = 44
    expect(computeNewWeight(100, 20, { strategy: 'smoothed', smoothFactor: 0.3 }))
      .toBeCloseTo(44)
  })

  it('[c-13d] smoothed défaut — facteur 0.3', () => {
    // Sans options : strategy=smoothed, smoothFactor=0.3
    const result = computeNewWeight(100, 10)
    // w = 0.7 × 10 + 0.3 × 100 = 7 + 30 = 37
    expect(result).toBeCloseTo(37)
  })

  it('[c-13e] clamping minWeight', () => {
    // normalized : p90=1 → 0.01 → clampé à minWeight=0.5
    expect(computeNewWeight(1, 10, { strategy: 'normalized', minWeight: 0.5 })).toBe(0.5)
  })

  it('[c-13f] clamping maxWeight', () => {
    // direct : p90=5000 → clampé à maxWeight=1000
    expect(computeNewWeight(5000, 10, { strategy: 'direct', maxWeight: 1000 })).toBe(1000)
  })

  it('[c-13g] p90 = 0 → clampé à minWeight', () => {
    expect(computeNewWeight(0, 10, { strategy: 'direct', minWeight: 0.5 })).toBe(0.5)
  })

  it('[c-13h] smoothFactor = 0 → weight inchangé', () => {
    // α=0 → tout le poids sur l'ancien
    expect(computeNewWeight(999, 42, { strategy: 'smoothed', smoothFactor: 0 }))
      .toBeCloseTo(42)
  })

  it('[c-13i] smoothFactor = 1 → weight = p90 brut', () => {
    // α=1 → tout le poids sur le nouveau
    expect(computeNewWeight(75, 42, { strategy: 'smoothed', smoothFactor: 1 }))
      .toBeCloseTo(75)
  })
})

// ── B) onCalibrated wiring ────────────────────────────────────────────────────

describe('UC-C2-B — onCalibrated wiring (simulation bridge)', () => {

  it('[c-14a] onCalibrated reçoit le résultat et met à jour les edges', async () => {
    const edge = makeEdge('movies', 'people', 10)

    // Simulation du bridge : onCalibrated met à jour l'edge avec stratégie direct
    job.onCalibrated = async (result: CalibrationResult) => {
      for (const r of result.routes) {
        const [f, t] = r.route.split('→')
        if (edge.from === f && edge.to === t) {
          edge.weight = computeNewWeight(r.p90, edge.weight, { strategy: 'direct' })
        }
      }
    }

    await writeSpans(driver, [
      { from: 'movies', to: 'people', totalMs: 80 },
      { from: 'movies', to: 'people', totalMs: 90 },
      { from: 'movies', to: 'people', totalMs: 100 },
    ])

    await job.runOnce()

    // Le poids doit avoir bougé du 10 initial vers le p90 réel
    expect(edge.weight).not.toBe(10)
    expect(edge.weight).toBeGreaterThan(0)
  })

  it('[c-14b] hot reload déclenché après mise à jour des edges', async () => {
    const edge    = makeEdge('movies', 'people', 10)
    const reloads: any[] = []
    const mockCompiler = { compile: vi.fn(() => ({ routes: [], nodes: [], version: '1.0' })) }

    job.onCalibrated = async (result: CalibrationResult) => {
      for (const r of result.routes) {
        const [f, t] = r.route.split('→')
        if (edge.from === f && edge.to === t) {
          edge.weight = computeNewWeight(r.p90, edge.weight, { strategy: 'direct' })
        }
      }
      const compiled = mockCompiler.compile({ nodes: [], edges: [edge] }, new Map())
      reloads.push(compiled)
    }

    await writeSpans(driver, [
      { from: 'movies', to: 'people', totalMs: 60 },
      { from: 'movies', to: 'people', totalMs: 70 },
      { from: 'movies', to: 'people', totalMs: 80 },
    ])

    await job.runOnce()

    expect(mockCompiler.compile).toHaveBeenCalledOnce()
    expect(reloads).toHaveLength(1)
  })

  it('[c-14c] route sans edge correspondant → pas de reload', async () => {
    const edge    = makeEdge('shows', 'cast', 10)  // pas de movies→people
    const reloads: any[] = []
    const mockCompiler = { compile: vi.fn() }

    job.onCalibrated = async (result: CalibrationResult) => {
      let updated = 0
      for (const r of result.routes) {
        const [f, t] = r.route.split('→')
        if (edge.from === f && edge.to === t) {
          edge.weight = computeNewWeight(r.p90, edge.weight, { strategy: 'direct' })
          updated++
        }
      }
      if (updated > 0) reloads.push(mockCompiler.compile())
    }

    await writeSpans(driver, [
      { from: 'movies', to: 'people', totalMs: 60 },
      { from: 'movies', to: 'people', totalMs: 70 },
      { from: 'movies', to: 'people', totalMs: 80 },
    ])

    await job.runOnce()

    expect(mockCompiler.compile).not.toHaveBeenCalled()
    expect(edge.weight).toBe(10)  // inchangé
  })

  it('[c-14d] smoothed sur deux cycles → convergence progressive', async () => {
    const edge = makeEdge('movies', 'people', 10)

    job.onCalibrated = async (result: CalibrationResult) => {
      for (const r of result.routes) {
        const [f, t] = r.route.split('→')
        if (edge.from === f && edge.to === t) {
          edge.weight = computeNewWeight(r.p90, edge.weight, {
            strategy: 'smoothed', smoothFactor: 0.3
          })
        }
      }
    }

    // Cycle 1 : spans à ~80ms
    await writeSpans(driver, [
      { from: 'movies', to: 'people', totalMs: 70 },
      { from: 'movies', to: 'people', totalMs: 80 },
      { from: 'movies', to: 'people', totalMs: 90 },
    ])
    await job.runOnce()
    const afterCycle1 = edge.weight

    // Cycle 2 : spans à ~80ms (stable) — le poids doit continuer à converger
    await writeSpans(driver, [
      { from: 'movies', to: 'people', totalMs: 70 },
      { from: 'movies', to: 'people', totalMs: 80 },
      { from: 'movies', to: 'people', totalMs: 90 },
    ])
    await job.runOnce()
    const afterCycle2 = edge.weight

    // Le poids s'est éloigné du 10 initial
    expect(afterCycle1).toBeGreaterThan(10)
    // Le deuxième cycle continue la convergence (ou se stabilise)
    expect(afterCycle2).toBeGreaterThanOrEqual(afterCycle1)
  })
})

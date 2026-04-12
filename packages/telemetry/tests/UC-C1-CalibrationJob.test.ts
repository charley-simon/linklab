/**
 * UC-C1 — CalibrationJob
 *
 * Vérifie la boucle de feedback :
 *   DuckDB.latencyPercentiles() → CalibrationJob → LatencyBaselineStore
 *
 * Tests avec DuckDB ':memory:' — même pattern que UC-D1.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DuckDBDriver }         from '../src/drivers/DuckDBDriver.js'
import { CalibrationJob }       from '../src/calibration/CalibrationJob.js'
import { LatencyBaselineStore } from '../src/metrics/LatencyBaseline.js'
import { traceBus }             from '../src/bus/TraceBus.js'
import type { Span }            from '../src/types.js'
import type { CalibrationResult } from '../src/calibration/CalibrationJob.js'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeSpan(overrides: Partial<Span> = {}): Span {
  return {
    spanId:      `span-${Math.random().toString(36).slice(2)}`,
    traceId:     'trace-1',
    timestamp:   Date.now(),
    trail:       'movies(278).people',
    from:        'movies',
    to:          'people',
    path:        ['movies', 'credits', 'people'],
    filters:     { id: 278 },
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

// ── Setup ────────────────────────────────────────────────────────────────────

let driver:  DuckDBDriver
let latency: LatencyBaselineStore
let job:     CalibrationJob

beforeEach(async () => {
  driver  = new DuckDBDriver({ dbPath: ':memory:' })
  latency = new LatencyBaselineStore()
  await driver.connect()

  job = new CalibrationJob({
    duckdb:         driver,
    latency,
    bus:            traceBus,
    windowMs:       60_000,
    intervalMs:     60_000,    // ne pas déclencher en test
    initialDelayMs: 999_999,   // ne pas déclencher en test
    minSamples:     3,
  })
})

afterEach(async () => {
  job.stop()
  await driver.disconnect()
})

// ── Tests ────────────────────────────────────────────────────────────────────

describe('UC-C1 — CalibrationJob', () => {

  it('[c-1] runOnce() sans données → retourne null', async () => {
    const result = await job.runOnce()
    expect(result).toBeNull()
  })

  it('[c-2] runOnce() sous minSamples → retourne null', async () => {
    // Seulement 2 spans, minSamples = 3
    await writeSpans(driver, [{ totalMs: 50 }, { totalMs: 60 }])
    const result = await job.runOnce()
    expect(result).toBeNull()
  })

  it('[c-3] runOnce() avec données suffisantes → met à jour la baseline', async () => {
    const latencies = [40, 50, 60, 80, 100]
    await writeSpans(driver, latencies.map(ms => ({
      from: 'movies', to: 'people', totalMs: ms,
    })))

    const result = await job.runOnce()

    expect(result).not.toBeNull()
    expect(result!.routeCount).toBe(1)
    expect(result!.routes[0].route).toBe('movies→people')
    expect(result!.routes[0].count).toBe(5)
    expect(result!.routes[0].p90).toBeGreaterThan(0)
  })

  it('[c-4] runOnce() injecte dans LatencyBaselineStore', async () => {
    await writeSpans(driver, [
      { from: 'movies', to: 'people', totalMs: 50 },
      { from: 'movies', to: 'people', totalMs: 70 },
      { from: 'movies', to: 'people', totalMs: 90 },
      { from: 'movies', to: 'people', totalMs: 120 },
    ])

    await job.runOnce()

    const baseline = latency.get('movies→people')
    expect(baseline).toBeDefined()
    expect(baseline!.p90Ms).toBeGreaterThan(0)
    expect(baseline!.sampleCount).toBe(4)
    expect(baseline!.lastUpdated).toBeGreaterThan(0)
  })

  it('[c-5] runOnce() calcule delta vs baseline précédente', async () => {
    latency.set({
      route:       'movies→people',
      p50Ms:       60,
      p90Ms:       100,
      p99Ms:       120,
      sampleCount: 10,
      lastUpdated: Date.now() - 120_000,
    })

    await writeSpans(driver, [
      { from: 'movies', to: 'people', totalMs: 100 },
      { from: 'movies', to: 'people', totalMs: 130 },
      { from: 'movies', to: 'people', totalMs: 150 },
      { from: 'movies', to: 'people', totalMs: 160 },
    ])

    const result = await job.runOnce()
    expect(result).not.toBeNull()

    const r = result!.routes[0]
    expect(r.delta).not.toBeNull()
    expect(r.delta!).toBeGreaterThan(0)   // dégradation → delta positif
  })

  it('[c-6] runOnce() émet calibration:done sur le bus', async () => {
    const received: any[] = []
    const handler = (payload: any) => received.push(payload)
    traceBus.on('calibration:done', handler)

    await writeSpans(driver, [
      { from: 'movies', to: 'people', totalMs: 50 },
      { from: 'movies', to: 'people', totalMs: 60 },
      { from: 'movies', to: 'people', totalMs: 70 },
    ])

    await job.runOnce()
    traceBus.off('calibration:done', handler)

    expect(received).toHaveLength(1)
    expect(received[0].p90Ms).toBeGreaterThan(0)
  })

  it('[c-7] runOnce() multi-routes — calibre chaque route indépendamment', async () => {
    await writeSpans(driver, [
      { from: 'movies',  to: 'people', totalMs: 50  },
      { from: 'movies',  to: 'people', totalMs: 80  },
      { from: 'movies',  to: 'people', totalMs: 100 },
      { from: 'movies',  to: 'people', totalMs: 120 },
    ])
    await writeSpans(driver, [
      { from: 'shows', to: 'cast', totalMs: 20 },
      { from: 'shows', to: 'cast', totalMs: 25 },
      { from: 'shows', to: 'cast', totalMs: 30 },
    ])

    const result = await job.runOnce()
    expect(result!.routeCount).toBe(2)

    const routes = result!.routes.map(r => r.route).sort()
    expect(routes).toEqual(['movies→people', 'shows→cast'])

    expect(latency.get('movies→people')).toBeDefined()
    expect(latency.get('shows→cast')).toBeDefined()
    expect(latency.get('shows→cast')!.p90Ms).toBeLessThan(
      latency.get('movies→people')!.p90Ms
    )
  })

  it('[c-8] runOnce() sans DuckDB connecté → retourne null', async () => {
    const disconnectedDriver = new DuckDBDriver({ dbPath: ':memory:' })
    // Volontairement pas de connect()

    const isolatedJob = new CalibrationJob({
      duckdb:   disconnectedDriver,
      latency,
      bus:      traceBus,
      windowMs: 60_000,
    })

    const result = await isolatedJob.runOnce()
    expect(result).toBeNull()
  })

  it('[c-9] start() / stop() — isRunning correct', () => {
    expect(job.isRunning).toBe(false)
    job.start()
    expect(job.isRunning).toBe(true)
    job.stop()
    expect(job.isRunning).toBe(false)
  })

  it('[c-10] start() idempotent — double appel sans effet', () => {
    job.start()
    job.start() // ne doit pas créer deux timers
    expect(job.isRunning).toBe(true)
    job.stop()
  })

  it('[c-11] onCalibrated hook appelé après runOnce() réussi', async () => {
    const calls: CalibrationResult[] = []
    job.onCalibrated = async (result) => { calls.push(result) }

    await writeSpans(driver, [
      { from: 'movies', to: 'people', totalMs: 60 },
      { from: 'movies', to: 'people', totalMs: 80 },
      { from: 'movies', to: 'people', totalMs: 100 },
    ])

    await job.runOnce()

    expect(calls).toHaveLength(1)
    expect(calls[0].routes[0].route).toBe('movies→people')
  })

  it('[c-12] onCalibrated pas appelé si pas assez de données', async () => {
    const calls: CalibrationResult[] = []
    job.onCalibrated = async (result) => { calls.push(result) }

    // Seulement 2 spans, minSamples = 3
    await writeSpans(driver, [{ totalMs: 50 }, { totalMs: 60 }])
    await job.runOnce()

    expect(calls).toHaveLength(0)
  })
})

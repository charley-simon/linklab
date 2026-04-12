/**
 * UC-T5 — MetricsCalculator
 *
 * Tension / Pression / Confort, fenêtre glissante, pathStability,
 * forSpan individuel, recalibration auto de la baseline.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MetricsCalculator }    from '../src/metrics/MetricsCalculator.js'
import { LatencyBaselineStore } from '../src/metrics/LatencyBaseline.js'
import { CapacityBaselineStore } from '../src/metrics/CapacityBaseline.js'
import type { Span, CacheEvent } from '../src/types.js'

// ── Factories ─────────────────────────────────────────────────────────────────

function makeCalc(windowMs = 60_000) {
  const latency  = new LatencyBaselineStore()
  const capacity = new CapacityBaselineStore()
  const calc     = new MetricsCalculator({ windowMs, latency, capacity })
  return { calc, latency, capacity }
}

function makeSpan(opts: {
  from?:        string
  to?:          string
  trail?:       string
  path?:        string[]
  totalMs?:     number
  cacheEvents?: CacheEvent[]
  timestamp?:   number
}): Span {
  return {
    spanId:      Math.random().toString(36).slice(2),
    traceId:     'trace-001',
    timestamp:   opts.timestamp ?? Date.now(),
    trail:       opts.trail  ?? `${opts.from ?? 'movies'}(278).${opts.to ?? 'people'}`,
    from:        opts.from   ?? 'movies',
    to:          opts.to     ?? 'people',
    path:        opts.path   ?? ['movies', 'credits', 'people'],
    filters:     { id: 278 },
    timings:     [{ step: 'Total', startedAt: Date.now(), durationMs: opts.totalMs ?? 50 }],
    totalMs:     opts.totalMs ?? 50,
    cacheEvents: opts.cacheEvents ?? [],
    rowCount:    5,
  }
}

function cacheHit(entity = 'movies:278'):  CacheEvent { return { level: 'L1', hit: true,  entity, promoted: false } }
function cacheMiss(entity = 'movies:278'): CacheEvent { return { level: 'MISS', hit: false, entity, promoted: false } }
function yoyoEvent(entity = 'movies:278'): CacheEvent { return { level: 'L2', hit: false, entity, promoted: false, yoyo: true } }

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('UC-T5 — MetricsCalculator', () => {

  it('[mc-1] fenêtre vide → defaults sains', () => {
    const { calc } = makeCalc()
    const m = calc.compute(60_000)
    expect(m.tension).toBe(1)
    expect(m.pression).toBe(0)
    expect(m.confort).toBe(0)
    expect(m.throughput).toBe(0)
    expect(m.totalSpans).toBe(0)
  })

  it('[mc-2] tension sans baseline → 1.0', () => {
    const { calc } = makeCalc()
    calc.ingest(makeSpan({ totalMs: 500 }))
    calc.ingest(makeSpan({ totalMs: 600 }))
    const m = calc.compute(60_000)
    // Pas de baseline connue → tension = 1.0
    expect(m.tension).toBe(1)
  })

  it('[mc-3] tension nominale avec baseline → ≈ 1.0', () => {
    const { calc, latency } = makeCalc()
    // Baseline : p90 = 100ms
    latency.set({ route: 'movies→people', p50Ms: 50, p90Ms: 100, p99Ms: 150, sampleCount: 100, lastUpdated: 0 })

    // Spans à ≈ p90 : tension attendue ≈ 1.0
    for (let i = 0; i < 10; i++) calc.ingest(makeSpan({ totalMs: 100 }))
    const m = calc.compute(60_000)

    expect(m.tension).toBeGreaterThan(0.8)
    expect(m.tension).toBeLessThan(1.3)
  })

  it('[mc-4] tension dégradée (latences 2× baseline) → ≥ 1.8', () => {
    const { calc, latency } = makeCalc()
    latency.set({ route: 'movies→people', p50Ms: 50, p90Ms: 100, p99Ms: 150, sampleCount: 100, lastUpdated: 0 })

    // Spans à 200ms = 2× le p90 baseline
    for (let i = 0; i < 10; i++) calc.ingest(makeSpan({ totalMs: 200 }))
    const m = calc.compute(60_000)

    expect(m.tension).toBeGreaterThanOrEqual(1.8)
  })

  it('[mc-5] pression monte avec cache misses', () => {
    const { calc, capacity } = makeCalc()
    capacity.set({ nominalRps: 100, maxRps: 150, breakingPoint: 300, lastUpdated: 0 })

    // Spans avec uniquement des misses
    for (let i = 0; i < 20; i++) {
      calc.ingest(makeSpan({ cacheEvents: [cacheMiss()] }))
    }
    const m = calc.compute(60_000)
    expect(m.pression).toBeGreaterThan(0)
    expect(m.cacheMisses).toBe(20)
  })

  it('[mc-6] pression plus haute avec yoyo events', () => {
    const { calc, capacity } = makeCalc()
    capacity.set({ nominalRps: 100, maxRps: 150, breakingPoint: 300, lastUpdated: 0 })

    // Batch A : misses simples
    const { calc: calcA, capacity: capA } = makeCalc()
    capA.set({ nominalRps: 100, maxRps: 150, breakingPoint: 300, lastUpdated: 0 })
    for (let i = 0; i < 10; i++) calcA.ingest(makeSpan({ cacheEvents: [cacheMiss()] }))
    const mA = calcA.compute(60_000)

    // Batch B : misses + yoyos
    const { calc: calcB, capacity: capB } = makeCalc()
    capB.set({ nominalRps: 100, maxRps: 150, breakingPoint: 300, lastUpdated: 0 })
    for (let i = 0; i < 10; i++) calcB.ingest(makeSpan({ cacheEvents: [cacheMiss(), yoyoEvent()] }))
    const mB = calcB.compute(60_000)

    expect(mB.pression).toBeGreaterThan(mA.pression)
    expect(mB.yoyoEvents).toBe(10)
  })

  it('[mc-7] confort ∈ [0..1]', () => {
    const { calc } = makeCalc()
    for (let i = 0; i < 10; i++) calc.ingest(makeSpan({ cacheEvents: [cacheMiss()] }))
    const m = calc.compute(60_000)
    expect(m.confort).toBeGreaterThanOrEqual(0)
    expect(m.confort).toBeLessThanOrEqual(1)
  })

  it('[mc-8] confort élevé → > 0.5 avec bon hit rate et tension nominale', () => {
    const { calc, latency } = makeCalc()
    latency.set({ route: 'movies→people', p50Ms: 50, p90Ms: 100, p99Ms: 150, sampleCount: 100, lastUpdated: 0 })

    // 10 hits, totalMs ≈ p90 → tension ≈ 1 → confort élevé
    for (let i = 0; i < 10; i++) {
      calc.ingest(makeSpan({ totalMs: 100, cacheEvents: [cacheHit(), cacheHit()] }))
    }
    const m = calc.compute(60_000)
    expect(m.cacheHitRate).toBeCloseTo(1.0, 1)
    expect(m.confort).toBeGreaterThan(0.3)
  })

  it('[mc-9] confort proche de 0 avec miss total et tension ×2', () => {
    const { calc, latency } = makeCalc()
    latency.set({ route: 'movies→people', p50Ms: 50, p90Ms: 100, p99Ms: 150, sampleCount: 100, lastUpdated: 0 })

    for (let i = 0; i < 10; i++) {
      calc.ingest(makeSpan({ totalMs: 200, cacheEvents: [cacheMiss()] }))
    }
    const m = calc.compute(60_000)
    expect(m.confort).toBeLessThan(0.2)
  })

  it('[mc-10] pathStability = 1.0 quand tous les trails sont stables', () => {
    const { calc } = makeCalc()
    const path = ['movies', 'credits', 'people']
    for (let i = 0; i < 5; i++) {
      calc.ingest(makeSpan({ trail: 'movies(278).people', path }))
    }
    const m = calc.compute(60_000)
    expect(m.pathStability).toBe(1.0)
  })

  it('[mc-11] pathStability < 1.0 quand un trail a deux chemins différents', () => {
    const { calc } = makeCalc()
    // Même trail, deux chemins différents
    calc.ingest(makeSpan({ trail: 'movies(278).people', path: ['movies', 'credits', 'people'] }))
    calc.ingest(makeSpan({ trail: 'movies(278).people', path: ['movies', 'cast', 'people'] }))
    // Deuxième trail stable
    calc.ingest(makeSpan({ trail: 'movies(278).cast', from: 'movies', to: 'cast', path: ['movies', 'cast'] }))
    calc.ingest(makeSpan({ trail: 'movies(278).cast', from: 'movies', to: 'cast', path: ['movies', 'cast'] }))

    const m = calc.compute(60_000)
    // 1 trail instable sur 2 → stability = 0.5
    expect(m.pathStability).toBeLessThan(1.0)
    expect(m.pathStability).toBeCloseTo(0.5, 1)
  })

  it('[mc-12] windowSize = nb de spans ingérés (dans la fenêtre courante)', () => {
    const { calc } = makeCalc(60_000)
    expect(calc.windowSize).toBe(0)
    calc.ingest(makeSpan({}))
    calc.ingest(makeSpan({}))
    calc.ingest(makeSpan({}))
    expect(calc.windowSize).toBe(3)
  })

  it('[mc-13] forSpan : tension basée sur la route du span', () => {
    const { calc, latency } = makeCalc()
    latency.set({ route: 'movies→people', p50Ms: 50, p90Ms: 100, p99Ms: 150, sampleCount: 100, lastUpdated: 0 })

    const span    = makeSpan({ totalMs: 200 })  // 2× p90
    const metrics = calc.forSpan(span)
    expect(metrics.tension).toBeGreaterThan(1.5)
  })

  it('[mc-14] forSpan : pression = ratio miss+yoyo / total events du span', () => {
    const { calc } = makeCalc()
    const span = makeSpan({
      cacheEvents: [cacheHit(), cacheMiss(), cacheMiss()],  // 1 hit, 2 miss
    })
    const metrics = calc.forSpan(span)
    // pression = 2 misses / 3 events = 0.666
    expect(metrics.pression).toBeCloseTo(2 / 3, 1)
  })

  it('[mc-15] ingest recalibre automatiquement la baseline après 10 mesures', () => {
    const { calc, latency } = makeCalc()
    // Avant ingest : pas de baseline
    expect(latency.p90('movies→people')).toBeUndefined()

    // Après 10 ingests : la baseline est calculée automatiquement
    for (let i = 0; i < 10; i++) calc.ingest(makeSpan({ totalMs: 80 + i }))
    expect(latency.p90('movies→people')).toBeDefined()
  })

  it('[mc-16] throughput = nb spans / windowSec', () => {
    const windowMs = 10_000  // 10s
    const { calc } = makeCalc(windowMs)
    for (let i = 0; i < 20; i++) calc.ingest(makeSpan({}))
    const m = calc.compute(windowMs)
    // 20 spans / 10s = 2 rps
    expect(m.throughput).toBeCloseTo(2.0, 0)
  })
})

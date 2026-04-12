/**
 * UC-T7 — GraphDriver
 *
 * Driver in-memory : write/read, LRU par count, requêtes spécialisées,
 * aggregate, summary, flush.
 */

import { describe, it, expect } from 'vitest'
import { GraphDriver } from '../src/drivers/GraphDriver.js'
import type { Span }   from '../src/types.js'

// ── Factories ─────────────────────────────────────────────────────────────────

let _id = 0
function makeSpan(opts: {
  trail?:     string
  from?:      string
  to?:        string
  path?:      string[]
  totalMs?:   number
  timestamp?: number
  withError?: boolean
  withYoyo?:  boolean
} = {}): Span {
  _id++
  return {
    spanId:    `span-${_id}`,
    traceId:   'trace-001',
    timestamp:  opts.timestamp ?? Date.now(),
    trail:      opts.trail ?? 'movies(278).people',
    from:       opts.from  ?? 'movies',
    to:         opts.to    ?? 'people',
    path:       opts.path  ?? ['movies', 'credits', 'people'],
    filters:    { id: 278 },
    timings:    [],
    totalMs:    opts.totalMs ?? 50,
    cacheEvents: opts.withYoyo
      ? [{ level: 'L2', hit: false, entity: 'movies:42', promoted: false, yoyo: true }]
      : [],
    rowCount:   5,
    error:      opts.withError
      ? { message: 'fail', type: 'Error', stack: '', engineState: {} as any }
      : undefined,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('UC-T7 — GraphDriver', () => {

  it('[gd-1] write + readRecent(1) → span retrouvé', async () => {
    const driver = new GraphDriver()
    const span   = makeSpan()
    await driver.write(span)
    const result = await driver.readRecent(1)
    expect(result).toHaveLength(1)
    expect(result[0].spanId).toBe(span.spanId)
  })

  it('[gd-2] readRecent(2) sur 5 spans → les 2 derniers en premier', async () => {
    const driver = new GraphDriver()
    const spans  = []
    for (let i = 0; i < 5; i++) {
      const s = makeSpan()
      spans.push(s)
      await driver.write(s)
    }
    const result = await driver.readRecent(2)
    expect(result).toHaveLength(2)
    // Le plus récent en premier
    expect(result[0].spanId).toBe(spans[4].spanId)
    expect(result[1].spanId).toBe(spans[3].spanId)
  })

  it('[gd-3] readErrors → uniquement les spans avec .error', async () => {
    const driver = new GraphDriver()
    await driver.write(makeSpan())
    await driver.write(makeSpan({ withError: true }))
    await driver.write(makeSpan())
    await driver.write(makeSpan({ withError: true }))

    const errors = await driver.readErrors(10)
    expect(errors).toHaveLength(2)
    expect(errors.every(s => s.error != null)).toBe(true)
  })

  it('[gd-4] readByTrail → filtre par trail exact', async () => {
    const driver = new GraphDriver()
    await driver.write(makeSpan({ trail: 'movies(278).people' }))
    await driver.write(makeSpan({ trail: 'movies(278).cast' }))
    await driver.write(makeSpan({ trail: 'movies(278).people' }))

    const result = await driver.readByTrail('movies(278).people', 10)
    expect(result).toHaveLength(2)
    expect(result.every(s => s.trail === 'movies(278).people')).toBe(true)
  })

  it('[gd-5] LRU par count : maxSpans=3, écriture de 4 → le 1er disparaît', async () => {
    const driver = new GraphDriver({ maxSpans: 3 })
    const first  = makeSpan()
    await driver.write(first)
    await driver.write(makeSpan())
    await driver.write(makeSpan())
    await driver.write(makeSpan())  // pousse le premier dehors

    const all = await driver.readRecent(10)
    expect(all).toHaveLength(3)
    expect(all.find(s => s.spanId === first.spanId)).toBeUndefined()
  })

  it('[gd-6] size correct après write', async () => {
    const driver = new GraphDriver()
    expect(driver.size).toBe(0)
    await driver.write(makeSpan())
    await driver.write(makeSpan())
    expect(driver.size).toBe(2)
  })

  it('[gd-7] flush() → size = 0', async () => {
    const driver = new GraphDriver()
    await driver.write(makeSpan())
    await driver.write(makeSpan())
    driver.flush()
    expect(driver.size).toBe(0)
    const result = await driver.readRecent(10)
    expect(result).toHaveLength(0)
  })

  it('[gd-8] trails() → liste dédupliquée', async () => {
    const driver = new GraphDriver()
    await driver.write(makeSpan({ trail: 'movies(278).people' }))
    await driver.write(makeSpan({ trail: 'movies(278).people' }))  // doublon
    await driver.write(makeSpan({ trail: 'movies(278).cast' }))

    const trails = driver.trails()
    expect(trails).toHaveLength(2)
    expect(trails).toContain('movies(278).people')
    expect(trails).toContain('movies(278).cast')
  })

  it('[gd-9] byRoute filtre par from + to', async () => {
    const driver = new GraphDriver()
    await driver.write(makeSpan({ from: 'movies', to: 'people' }))
    await driver.write(makeSpan({ from: 'movies', to: 'cast' }))
    await driver.write(makeSpan({ from: 'movies', to: 'people' }))

    const result = driver.byRoute('movies', 'people', 10)
    expect(result).toHaveLength(2)
    expect(result.every(s => s.from === 'movies' && s.to === 'people')).toBe(true)
  })

  it('[gd-10] latencySamples → tableau de totalMs pour la route', async () => {
    const driver = new GraphDriver()
    await driver.write(makeSpan({ from: 'movies', to: 'people', totalMs: 40 }))
    await driver.write(makeSpan({ from: 'movies', to: 'people', totalMs: 60 }))
    await driver.write(makeSpan({ from: 'movies', to: 'cast',   totalMs: 90 }))  // autre route

    const samples = driver.latencySamples('movies→people')
    expect(samples).toHaveLength(2)
    // ordre inverse : plus récent en dernier dans le tableau brut
    expect(samples).toContain(40)
    expect(samples).toContain(60)
    expect(samples).not.toContain(90)
  })

  it('[gd-11] yoyoSpans → uniquement les spans avec cacheEvent.yoyo=true', async () => {
    const driver = new GraphDriver()
    await driver.write(makeSpan())
    await driver.write(makeSpan({ withYoyo: true }))
    await driver.write(makeSpan())
    await driver.write(makeSpan({ withYoyo: true }))

    const yoyos = driver.yoyoSpans(10)
    expect(yoyos).toHaveLength(2)
    expect(yoyos.every(s => s.cacheEvents.some(e => e.yoyo))).toBe(true)
  })

  it('[gd-12] summary.errors = nb spans avec .error', async () => {
    const driver = new GraphDriver()
    await driver.write(makeSpan({ withError: true }))
    await driver.write(makeSpan())
    await driver.write(makeSpan({ withError: true }))

    const s = driver.summary()
    expect(s.errors).toBe(2)
    expect(s.total).toBe(3)
  })

  it('[gd-13] summary.yoyos = nb spans avec au moins un yoyo', async () => {
    const driver = new GraphDriver()
    await driver.write(makeSpan({ withYoyo: true }))
    await driver.write(makeSpan())

    const s = driver.summary()
    expect(s.yoyos).toBe(1)
  })

  it('[gd-14] summary.avgLatencyMs correct', async () => {
    const driver = new GraphDriver()
    await driver.write(makeSpan({ totalMs: 100 }))
    await driver.write(makeSpan({ totalMs: 200 }))

    const s = driver.summary()
    expect(s.avgLatencyMs).toBe(150)
  })

  it('[gd-15] aggregate → totalSpans uniquement dans la fenêtre', async () => {
    const driver    = new GraphDriver()
    const windowMs  = 5_000  // 5s

    // Span ancien (hors fenêtre)
    await driver.write(makeSpan({ timestamp: Date.now() - 10_000 }))

    // Spans récents (dans la fenêtre)
    await driver.write(makeSpan({ timestamp: Date.now() - 1_000 }))
    await driver.write(makeSpan({ timestamp: Date.now() - 2_000 }))

    const metrics = await driver.aggregate(windowMs)
    expect(metrics.totalSpans).toBe(2)
  })

  it('[gd-16] readByTrail limit respectée', async () => {
    const driver = new GraphDriver()
    for (let i = 0; i < 10; i++) {
      await driver.write(makeSpan({ trail: 'same.trail' }))
    }
    const result = await driver.readByTrail('same.trail', 3)
    expect(result).toHaveLength(3)
  })
})

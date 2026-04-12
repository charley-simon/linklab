/**
 * UC-D1 — DuckDBDriver
 *
 * Tests d'intégration réels avec DuckDB en mémoire (:memory:).
 * Couvre : connect, write, read, OLAP, rotate.
 *
 * Nécessite @duckdb/node-api installé (pnpm add @duckdb/node-api).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DuckDBDriver } from '../src/drivers/DuckDBDriver.js'
import type { Span } from '../src/types.js'

// ── Factory ───────────────────────────────────────────────────────────────────

let _id = 0
function makeSpan(
  opts: {
    trail?: string
    from?: string
    to?: string
    path?: string[]
    totalMs?: number
    timestamp?: number
    withError?: boolean
    withYoyo?: boolean
    cacheHit?: boolean
  } = {}
): Span {
  _id++
  return {
    spanId: `span-${_id}`,
    traceId: 'trace-001',
    timestamp: opts.timestamp ?? Date.now(),
    trail: opts.trail ?? 'movies(278).people',
    from: opts.from ?? 'movies',
    to: opts.to ?? 'people',
    path: opts.path ?? ['movies', 'credits', 'people'],
    filters: { id: 278 },
    timings: [],
    totalMs: opts.totalMs ?? 50,
    cacheEvents: [
      ...(opts.cacheHit
        ? [{ level: 'L1' as const, hit: true, entity: 'movies:278', promoted: false }]
        : []),
      ...(opts.withYoyo
        ? [{ level: 'L2' as const, hit: false, entity: 'movies:42', promoted: false, yoyo: true }]
        : []),
      ...(!opts.cacheHit && !opts.withYoyo
        ? [{ level: 'MISS' as const, hit: false, entity: 'movies:278', promoted: false }]
        : [])
    ],
    rowCount: 5,
    error: opts.withError
      ? { message: 'boom', type: 'RouteNotFound', stack: '', engineState: {} as any }
      : undefined
  }
}

// ── Setup ─────────────────────────────────────────────────────────────────────

let driver: DuckDBDriver

beforeEach(async () => {
  driver = new DuckDBDriver({ dbPath: ':memory:' })
  await driver.connect()
})

afterEach(async () => {
  await driver.disconnect()
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('UC-D1 — DuckDBDriver', () => {
  // ── Connexion ────────────────────────────────────────────────────────────

  it('[db-1] connect() → isConnected = true', () => {
    expect(driver.isConnected).toBe(true)
  })

  it('[db-2] connect() idempotent — double appel sans crash', async () => {
    await driver.connect() // 2ème appel
    expect(driver.isConnected).toBe(true)
  })

  it('[db-3] disconnect() → isConnected = false', async () => {
    await driver.disconnect()
    expect(driver.isConnected).toBe(false)
  })

  // ── write / readRecent ───────────────────────────────────────────────────

  it('[db-4] write + readRecent(1) → span retrouvé', async () => {
    const span = makeSpan()
    await driver.write(span)

    const result = await driver.readRecent(1)
    expect(result).toHaveLength(1)
    expect(result[0].spanId).toBe(span.spanId)
  })

  it('[db-5] readRecent(2) sur 5 spans → les 2 plus récents', async () => {
    const spans: Span[] = []
    for (let i = 0; i < 5; i++) {
      const s = makeSpan({ timestamp: Date.now() + i })
      spans.push(s)
      await driver.write(s)
    }

    const result = await driver.readRecent(2)
    expect(result).toHaveLength(2)
    // DuckDB trie par timestamp DESC
    expect(result[0].spanId).toBe(spans[4].spanId)
    expect(result[1].spanId).toBe(spans[3].spanId)
  })

  it('[db-6] readRecent sur base vide → []', async () => {
    const result = await driver.readRecent(10)
    expect(result).toHaveLength(0)
  })

  // ── readErrors ───────────────────────────────────────────────────────────

  it('[db-7] readErrors → uniquement spans avec error', async () => {
    await driver.write(makeSpan())
    await driver.write(makeSpan({ withError: true }))
    await driver.write(makeSpan())
    await driver.write(makeSpan({ withError: true }))

    const errors = await driver.readErrors(10)
    expect(errors).toHaveLength(2)
    expect(errors.every(s => s.error != null)).toBe(true)
  })

  it('[db-8] readErrors sur base sans erreurs → []', async () => {
    await driver.write(makeSpan())
    const result = await driver.readErrors(10)
    expect(result).toHaveLength(0)
  })

  // ── readByTrail ──────────────────────────────────────────────────────────

  it('[db-9] readByTrail → filtre par trail exact', async () => {
    await driver.write(makeSpan({ trail: 'movies(278).people' }))
    await driver.write(makeSpan({ trail: 'movies(278).cast' }))
    await driver.write(makeSpan({ trail: 'movies(278).people' }))

    const result = await driver.readByTrail('movies(278).people', 10)
    expect(result).toHaveLength(2)
    expect(result.every(s => s.trail === 'movies(278).people')).toBe(true)
  })

  it('[db-10] readByTrail limit respectée', async () => {
    for (let i = 0; i < 10; i++) {
      await driver.write(makeSpan({ trail: 'same.trail' }))
    }
    const result = await driver.readByTrail('same.trail', 3)
    expect(result).toHaveLength(3)
  })

  // ── Persistance des champs ───────────────────────────────────────────────

  it('[db-11] champs scalaires préservés après write+read', async () => {
    const span = makeSpan({ from: 'shows', to: 'cast', totalMs: 99, trail: 'shows(1).cast' })
    await driver.write(span)

    const [back] = await driver.readRecent(1)
    expect(back.spanId).toBe(span.spanId)
    expect(back.from).toBe('shows')
    expect(back.to).toBe('cast')
    expect(back.totalMs).toBe(99)
    expect(back.trail).toBe('shows(1).cast')
    expect(back.rowCount).toBe(5)
  })

  it('[db-12] path[] préservé (JSON round-trip)', async () => {
    const span = makeSpan({ path: ['movies', 'credits', 'people'] })
    await driver.write(span)

    const [back] = await driver.readRecent(1)
    expect(back.path).toEqual(['movies', 'credits', 'people'])
  })

  // ── aggregate ────────────────────────────────────────────────────────────

  it('[db-13] aggregate sur base vide → emptyMetrics', async () => {
    const m = await driver.aggregate(60_000)
    expect(m.totalSpans).toBe(0)
    expect(m.tension).toBe(1)
    expect(m.confort).toBe(0)
  })

  it('[db-14] aggregate.totalSpans = nb spans dans la fenêtre', async () => {
    const now = Date.now()
    await driver.write(makeSpan({ timestamp: now - 1_000 }))
    await driver.write(makeSpan({ timestamp: now - 2_000 }))
    await driver.write(makeSpan({ timestamp: now - 100_000 })) // hors fenêtre

    const m = await driver.aggregate(60_000)
    expect(m.totalSpans).toBe(2)
  })

  it('[db-15] aggregate.errorRate correct', async () => {
    await driver.write(makeSpan())
    await driver.write(makeSpan())
    await driver.write(makeSpan({ withError: true }))

    const m = await driver.aggregate(60_000)
    expect(m.errorRate).toBeCloseTo(1 / 3, 2)
  })

  it('[db-16] aggregate.cacheHitRate correct', async () => {
    await driver.write(makeSpan({ cacheHit: true })) // 1 hit
    await driver.write(makeSpan({ cacheHit: false })) // 1 miss

    const m = await driver.aggregate(60_000)
    expect(m.cacheHitRate).toBeCloseTo(0.5, 2)
  })

  // ── latencyPercentiles ───────────────────────────────────────────────────

  it('[db-17] latencyPercentiles → route movies→people présente', async () => {
    for (const ms of [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]) {
      await driver.write(makeSpan({ from: 'movies', to: 'people', totalMs: ms }))
    }

    const rows = await driver.latencyPercentiles(60_000)
    expect(rows).toHaveLength(1)
    expect(rows[0].route).toBe('movies→people')
    expect(rows[0].count).toBe(10)
    expect(rows[0].p50).toBeGreaterThanOrEqual(40)
    expect(rows[0].p50).toBeLessThanOrEqual(60)
    expect(rows[0].p90).toBeGreaterThanOrEqual(80)
    expect(rows[0].p99).toBeGreaterThanOrEqual(90)
  })

  it('[db-18] latencyPercentiles filtre la fenêtre temporelle', async () => {
    const now = Date.now()
    await driver.write(
      makeSpan({ from: 'movies', to: 'people', totalMs: 50, timestamp: now - 200_000 })
    )
    await driver.write(
      makeSpan({ from: 'movies', to: 'people', totalMs: 50, timestamp: now - 1_000 })
    )

    const rows = await driver.latencyPercentiles(60_000) // 60s
    expect(rows).toHaveLength(1)
    expect(rows[0].count).toBe(1)
  })

  // ── yoyoRateByRoute ──────────────────────────────────────────────────────

  it('[db-19] yoyoRateByRoute → taux correct', async () => {
    await driver.write(makeSpan({ from: 'movies', to: 'people', withYoyo: true }))
    await driver.write(makeSpan({ from: 'movies', to: 'people', withYoyo: false }))
    await driver.write(makeSpan({ from: 'movies', to: 'people', withYoyo: false }))

    const rows = await driver.yoyoRateByRoute(60_000)
    expect(rows).toHaveLength(1)
    expect(rows[0].route).toBe('movies→people')
    // 1 yoyo / 3 spans = ~0.33
    expect(rows[0].yoyoRate).toBeCloseTo(1 / 3, 2)
  })

  // ── unstableTrails ───────────────────────────────────────────────────────

  it('[db-20] unstableTrails → trails avec plusieurs paths distincts', async () => {
    const trail = 'movies(278).people'
    await driver.write(makeSpan({ trail, path: ['movies', 'credits', 'people'] }))
    await driver.write(makeSpan({ trail, path: ['movies', 'jobs', 'people'] })) // chemin différent
    await driver.write(makeSpan({ trail, path: ['movies', 'credits', 'people'] }))

    const rows = await driver.unstableTrails(60_000, 2)
    expect(rows).toHaveLength(1)
    expect(rows[0].trail).toBe(trail)
    expect(rows[0].pathVariants).toBe(2)
  })

  it('[db-21] unstableTrails → trail stable absent du résultat', async () => {
    const trail = 'movies(278).people'
    await driver.write(makeSpan({ trail, path: ['movies', 'credits', 'people'] }))
    await driver.write(makeSpan({ trail, path: ['movies', 'credits', 'people'] }))

    const rows = await driver.unstableTrails(60_000, 2)
    expect(rows).toHaveLength(0)
  })

  // ── rotate ───────────────────────────────────────────────────────────────

  it('[db-22] rotate supprime les plus anciens quand maxRows dépassé', async () => {
    const smallDriver = new DuckDBDriver({ dbPath: ':memory:', maxRows: 5 })
    await smallDriver.connect()

    const now = Date.now()
    for (let i = 0; i < 6; i++) {
      await smallDriver.write(makeSpan({ timestamp: now + i }))
    }

    const deleted = await smallDriver.rotate()
    expect(deleted).toBeGreaterThan(0)

    const remaining = await smallDriver.readRecent(100)
    expect(remaining.length).toBeLessThanOrEqual(5)

    await smallDriver.disconnect()
  })

  it('[db-23] rotate retourne 0 si maxRows non atteint', async () => {
    await driver.write(makeSpan())
    const deleted = await driver.rotate()
    expect(deleted).toBe(0)
  })

  // ── Comportement dégradé ─────────────────────────────────────────────────

  it('[db-24] write sans connect → no-op silencieux', async () => {
    const disconnected = new DuckDBDriver({ dbPath: ':memory:' })
    // Pas de connect() — isConnected = false
    await expect(disconnected.write(makeSpan())).resolves.not.toThrow()
  })

  it('[db-25] readRecent sans connect → []', async () => {
    const disconnected = new DuckDBDriver({ dbPath: ':memory:' })
    const result = await disconnected.readRecent(10)
    expect(result).toHaveLength(0)
  })
})

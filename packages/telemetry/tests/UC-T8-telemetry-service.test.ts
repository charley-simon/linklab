/**
 * UC-T8 — TelemetryService (intégration)
 *
 * Cycle de vie, enrichissement spans, yoyo:detected,
 * interval fake timer, stop() isolation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TelemetryService } from '../src/TelemetryService.js'
import { traceBus }         from '../src/bus/TraceBus.js'
import type { Span }        from '../src/types.js'

// ── Factories ─────────────────────────────────────────────────────────────────

let _id = 0
function makeSpan(opts: {
  from?:      string
  to?:        string
  trail?:     string
  totalMs?:   number
  withError?: boolean
  withYoyo?:  boolean
} = {}): Span {
  _id++
  return {
    spanId:    `span-${_id}`,
    traceId:   'trace-001',
    timestamp:  Date.now(),
    trail:      opts.trail ?? 'movies(278).people',
    from:       opts.from  ?? 'movies',
    to:         opts.to    ?? 'people',
    path:       ['movies', 'credits', 'people'],
    filters:    { id: 278 },
    timings:    [],
    totalMs:    opts.totalMs ?? 50,
    cacheEvents: opts.withYoyo
      ? [{ level: 'L2', hit: false, entity: 'movies:278', promoted: false, yoyo: true }]
      : [],
    rowCount:   5,
    error:      opts.withError
      ? { message: 'boom', type: 'Error', stack: '', engineState: {} as any }
      : undefined,
  }
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  // Le bus est un singleton — nettoyer tous les listeners entre les tests
  // pour éviter les fuites (notamment yoyo:detected cumulé entre tests)
  traceBus.removeAllListeners()
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('UC-T8 — TelemetryService (intégration)', () => {

  it('[srv-1] start() → bus a des listeners sur span:end et span:error', async () => {
    const service = new TelemetryService({ metricsIntervalMs: 5_000 })
    await service.start()

    const counts = service.bus.listenerCounts()
    expect(counts['span:end']).toBeGreaterThanOrEqual(1)
    expect(counts['span:error']).toBeGreaterThanOrEqual(1)

    await service.stop()
  })

  it('[srv-2] span:end → span.metrics enrichi', async () => {
    const service = new TelemetryService({ metricsIntervalMs: 5_000 })
    await service.start()

    const span = makeSpan()
    service.bus.emit('span:end', span)

    // L'enrichissement est synchrone (dans le handler)
    expect(span.metrics).toBeDefined()
    expect(span.metrics!.tension).toBeGreaterThanOrEqual(0)
    expect(span.metrics!.pression).toBeGreaterThanOrEqual(0)
    expect(span.metrics!.confort).toBeGreaterThanOrEqual(0)

    await service.stop()
  })

  it('[srv-3] span:end → span stocké dans graph', async () => {
    const service = new TelemetryService({ metricsIntervalMs: 5_000 })
    await service.start()

    expect(service.graph.size).toBe(0)
    service.bus.emit('span:end', makeSpan())
    expect(service.graph.size).toBe(1)

    await service.stop()
  })

  it('[srv-4] span:end × 3 → metrics().totalSpans = 3', async () => {
    const service = new TelemetryService({ windowMs: 60_000, metricsIntervalMs: 5_000 })
    await service.start()

    service.bus.emit('span:end', makeSpan())
    service.bus.emit('span:end', makeSpan())
    service.bus.emit('span:end', makeSpan())

    const m = service.metrics()
    expect(m.totalSpans).toBe(3)

    await service.stop()
  })

  it('[srv-5] span avec yoyo → yoyo:detected émis sur le bus', async () => {
    const service   = new TelemetryService({ metricsIntervalMs: 5_000 })
    const detected: any[] = []
    service.bus.on('yoyo:detected', e => detected.push(e))

    await service.start()
    service.bus.emit('span:end', makeSpan({ withYoyo: true }))

    expect(detected).toHaveLength(1)
    expect(detected[0].entity).toBe('movies:278')
    expect(detected[0].route).toBe('movies→people')

    await service.stop()
  })

  it('[srv-6] span:error → traité (graph.size incrémenté)', async () => {
    const service = new TelemetryService({ metricsIntervalMs: 5_000 })
    await service.start()

    service.bus.emit('span:error', makeSpan({ withError: true }))
    expect(service.graph.size).toBe(1)

    await service.stop()
  })

  it('[srv-7] fake timer → metrics:update émis après l\'interval', async () => {
    const service  = new TelemetryService({ metricsIntervalMs: 5_000 })
    const updates: any[] = []
    service.bus.on('metrics:update', m => updates.push(m))

    await service.start()
    expect(updates).toHaveLength(0)

    vi.advanceTimersByTime(5_000)
    expect(updates).toHaveLength(1)

    vi.advanceTimersByTime(5_000)
    expect(updates).toHaveLength(2)

    await service.stop()
  })

  it('[srv-8] stop() → span émis après stop pas stocké', async () => {
    const service = new TelemetryService({ metricsIntervalMs: 5_000 })
    await service.start()
    service.bus.emit('span:end', makeSpan())
    expect(service.graph.size).toBe(1)

    await service.stop()

    // Émettre après stop → ignoré
    service.bus.emit('span:end', makeSpan())
    expect(service.graph.size).toBe(1)  // toujours 1
  })

  it('[srv-9] sessionReport() contient "Tension"', async () => {
    const service = new TelemetryService({ metricsIntervalMs: 5_000 })
    await service.start()
    service.bus.emit('span:end', makeSpan())

    const report = service.sessionReport()
    expect(report).toContain('Tension')

    await service.stop()
  })

  it('[srv-10] sessionReport() contient le nb de spans', async () => {
    const service = new TelemetryService({ metricsIntervalMs: 5_000 })
    await service.start()

    for (let i = 0; i < 7; i++) service.bus.emit('span:end', makeSpan())

    const report = service.sessionReport()
    expect(report).toContain('7')

    await service.stop()
  })

  it('[srv-11] double start() idempotent', async () => {
    const service = new TelemetryService({ metricsIntervalMs: 5_000 })
    await service.start()
    await service.start()  // second start — ignoré

    service.bus.emit('span:end', makeSpan())
    // Un seul traitement attendu malgré le double start
    expect(service.graph.size).toBe(1)

    await service.stop()
  })

  it('[srv-12] metrics:update pas émis après stop', async () => {
    const service  = new TelemetryService({ metricsIntervalMs: 5_000 })
    const updates: any[] = []
    service.bus.on('metrics:update', m => updates.push(m))

    await service.start()
    await service.stop()

    vi.advanceTimersByTime(10_000)
    expect(updates).toHaveLength(0)
  })
})

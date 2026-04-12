/**
 * UC-T1 — TraceBus
 *
 * Émission typée, souscription, désouscription, multi-listeners,
 * isolation entre événements, listenerCounts.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { traceBus }   from '../src/bus/TraceBus.js'
import type { Span, SystemMetrics } from '../src/types.js'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeSpan(overrides: Partial<Span> = {}): Span {
  return {
    spanId:      'span-001',
    traceId:     'trace-001',
    timestamp:   Date.now(),
    trail:       'movies(278).people',
    from:        'movies',
    to:          'people',
    path:        ['movies', 'credits', 'people'],
    filters:     { id: 278 },
    timings:     [],
    totalMs:     42,
    cacheEvents: [],
    rowCount:    13,
    ...overrides,
  }
}

function makeMetrics(): SystemMetrics {
  return {
    window: 60_000, timestamp: Date.now(),
    tension: 1.2, pression: 0.3, confort: 0.6,
    throughput: 10, errorRate: 0.01, cacheHitRate: 0.85,
    yoyoRate: 0.02, pathStability: 0.95,
    totalSpans: 100, errorSpans: 1,
    cacheHits: 85, cacheMisses: 15, yoyoEvents: 2,
  }
}

// Nettoyage après chaque test — le bus est un singleton
afterEach(() => {
  traceBus.removeAllListeners()
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('UC-T1 — TraceBus', () => {

  it('[bus-1] emit sans listener → false, pas d\'erreur', () => {
    expect(() => {
      const result = traceBus.emit('span:end', makeSpan())
      expect(result).toBe(false)
    }).not.toThrow()
  })

  it('[bus-2] on + emit → listener reçoit le payload exact', () => {
    const received: Span[] = []
    const span = makeSpan()

    traceBus.on('span:end', s => received.push(s))
    traceBus.emit('span:end', span)

    expect(received).toHaveLength(1)
    expect(received[0]).toEqual(span)
  })

  it('[bus-3] on + emit × 3 → listener appelé 3 fois', () => {
    const fn = vi.fn()
    traceBus.on('span:end', fn)

    traceBus.emit('span:end', makeSpan())
    traceBus.emit('span:end', makeSpan())
    traceBus.emit('span:end', makeSpan())

    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('[bus-4] once + emit × 3 → listener appelé exactement 1 fois', () => {
    const fn = vi.fn()
    traceBus.once('span:end', fn)

    traceBus.emit('span:end', makeSpan())
    traceBus.emit('span:end', makeSpan())
    traceBus.emit('span:end', makeSpan())

    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('[bus-5] off → listener silencieux après désouscription', () => {
    const fn = vi.fn()
    traceBus.on('span:end', fn)
    traceBus.emit('span:end', makeSpan())   // appelé

    traceBus.off('span:end', fn)
    traceBus.emit('span:end', makeSpan())   // silencieux

    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('[bus-6] 2 listeners sur le même event → les deux appelés', () => {
    const fn1 = vi.fn()
    const fn2 = vi.fn()

    traceBus.on('span:end', fn1)
    traceBus.on('span:end', fn2)
    traceBus.emit('span:end', makeSpan())

    expect(fn1).toHaveBeenCalledTimes(1)
    expect(fn2).toHaveBeenCalledTimes(1)
  })

  it('[bus-7] listener span:end pas notifié pour metrics:update', () => {
    const spanFn = vi.fn()
    traceBus.on('span:end', spanFn)
    traceBus.emit('metrics:update', makeMetrics())

    expect(spanFn).not.toHaveBeenCalled()
  })

  it('[bus-8] listenerCounts() après on() → count = 1', () => {
    const fn = vi.fn()
    traceBus.on('span:end', fn)

    const counts = traceBus.listenerCounts()
    expect(counts['span:end']).toBe(1)
  })

  it('[bus-9] listenerCounts() après off() → count = 0', () => {
    const fn = vi.fn()
    traceBus.on('span:end', fn)
    traceBus.off('span:end', fn)

    const counts = traceBus.listenerCounts()
    expect(counts['span:end']).toBe(0)
  })

  it('[bus-10] payload transmis sans mutation', () => {
    let received: Span | null = null
    const span = makeSpan({ rowCount: 99, filters: { id: 278, year: 2010 } })

    traceBus.on('span:end', s => { received = s })
    traceBus.emit('span:end', span)

    expect(received).not.toBeNull()
    expect(received!.rowCount).toBe(99)
    expect(received!.filters).toEqual({ id: 278, year: 2010 })
    // Même référence — pas de copie defensive (comportement EventEmitter natif)
    expect(received).toBe(span)
  })

  it('[bus-11] yoyo:detected payload typé correctement', () => {
    const events: Array<{ entity: string; route: string; timestamp: number }> = []
    traceBus.on('yoyo:detected', e => events.push(e))

    traceBus.emit('yoyo:detected', { entity: 'movies:278', route: 'movies→people', timestamp: 1000 })

    expect(events).toHaveLength(1)
    expect(events[0].entity).toBe('movies:278')
    expect(events[0].route).toBe('movies→people')
  })

  it('[bus-12] span:error reçu sur listener span:error (pas span:end)', () => {
    const endFn   = vi.fn()
    const errorFn = vi.fn()
    const span    = makeSpan({ error: { message: 'fail', type: 'Error', engineState: {} as any } })

    traceBus.on('span:end',   endFn)
    traceBus.on('span:error', errorFn)
    traceBus.emit('span:error', span)

    expect(endFn).not.toHaveBeenCalled()
    expect(errorFn).toHaveBeenCalledWith(span)
  })
})

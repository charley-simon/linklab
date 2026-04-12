/**
 * UC-T2 — SpanBuilder
 *
 * Construction fluente d'un span : identité, timings, cache events,
 * finalisation succès / erreur.
 */

import { describe, it, expect } from 'vitest'
import { SpanBuilder } from '../src/spans/SpanBuilder.js'
import type { EngineState } from '../src/types.js'

// ── Fixture ───────────────────────────────────────────────────────────────────

function makeEngineState(): EngineState {
  return {
    compiledGraphHash: 'abc123',
    weights: { 'movies→credits': 1, 'credits→people': 2 },
    cacheState: { l1HitRate: 0.8, l2HitRate: 0.6, globalHitRate: 0.92, yoyoEvents: 0 },
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('UC-T2 — SpanBuilder', () => {

  it('[sb-1] spanId unique sur deux builders distincts', () => {
    const a = SpanBuilder.start({ trail: 'movies.people', from: 'movies', to: 'people' }).end({ rowCount: 0 })
    const b = SpanBuilder.start({ trail: 'movies.people', from: 'movies', to: 'people' }).end({ rowCount: 0 })
    expect(a.spanId).not.toBe(b.spanId)
  })

  it('[sb-2] traceId partagé si fourni', () => {
    const sharedTrace = 'trace-shared-xyz'
    const span = SpanBuilder
      .start({ trail: 'movies.people', from: 'movies', to: 'people', traceId: sharedTrace })
      .end({ rowCount: 5 })
    expect(span.traceId).toBe(sharedTrace)
  })

  it('[sb-3] traceId auto si absent', () => {
    const span = SpanBuilder
      .start({ trail: 'movies.people', from: 'movies', to: 'people' })
      .end({ rowCount: 0 })
    expect(span.traceId).toBeDefined()
    expect(span.traceId.length).toBeGreaterThan(0)
  })

  it('[sb-4] withFilters → filters présents dans le span', () => {
    const span = SpanBuilder
      .start({ trail: 'movies(278).people', from: 'movies', to: 'people' })
      .withFilters({ id: 278, year: 2010 })
      .end({ rowCount: 3 })
    expect(span.filters).toEqual({ id: 278, year: 2010 })
  })

  it('[sb-5] withPath → path présent dans le span', () => {
    const path = ['movies', 'credits', 'people']
    const span = SpanBuilder
      .start({ trail: 'movies.people', from: 'movies', to: 'people' })
      .withPath(path)
      .end({ rowCount: 0 })
    expect(span.path).toEqual(path)
    // Vérifier que withPath fait une copie défensive
    path.push('extra')
    expect(span.path).toHaveLength(3)
  })

  it('[sb-6] stepStart + stepEnd → timing présent dans span.timings', () => {
    const builder = SpanBuilder.start({ trail: 'movies.people', from: 'movies', to: 'people' })
    builder.stepStart('PathFinder')
    builder.stepEnd('PathFinder')
    const span = builder.end({ rowCount: 0 })

    const pf = span.timings.find(t => t.step === 'PathFinder')
    expect(pf).toBeDefined()
    expect(pf!.durationMs).toBeGreaterThanOrEqual(0)
    expect(pf!.startedAt).toBeGreaterThan(0)
  })

  it('[sb-7] end() → timing Total ajouté automatiquement', () => {
    const span = SpanBuilder
      .start({ trail: 'movies.people', from: 'movies', to: 'people' })
      .end({ rowCount: 0 })

    const total = span.timings.find(t => t.step === 'Total')
    expect(total).toBeDefined()
    expect(total!.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('[sb-8] totalMs ≥ 0', () => {
    const span = SpanBuilder
      .start({ trail: 'movies.people', from: 'movies', to: 'people' })
      .end({ rowCount: 0 })
    expect(span.totalMs).toBeGreaterThanOrEqual(0)
  })

  it('[sb-9] addCacheEvent × 2 → ordre préservé', () => {
    const span = SpanBuilder
      .start({ trail: 'movies.people', from: 'movies', to: 'people' })
      .addCacheEvent({ level: 'L1', hit: true,  entity: 'movies:278', promoted: false })
      .addCacheEvent({ level: 'L2', hit: false, entity: 'people:819', promoted: false })
      .end({ rowCount: 2 })

    expect(span.cacheEvents).toHaveLength(2)
    expect(span.cacheEvents[0].level).toBe('L1')
    expect(span.cacheEvents[1].level).toBe('L2')
  })

  it('[sb-10] end() → error absent', () => {
    const span = SpanBuilder
      .start({ trail: 'movies.people', from: 'movies', to: 'people' })
      .end({ rowCount: 7 })
    expect(span.error).toBeUndefined()
    expect(span.rowCount).toBe(7)
  })

  it('[sb-11] endWithError() → error.message et error.type corrects', () => {
    const err   = new TypeError('Route introuvable')
    const state = makeEngineState()
    const span  = SpanBuilder
      .start({ trail: 'movies.people', from: 'movies', to: 'people' })
      .endWithError(err, state)

    expect(span.error).toBeDefined()
    expect(span.error!.message).toBe('Route introuvable')
    expect(span.error!.type).toBe('TypeError')
  })

  it('[sb-12] endWithError() → rowCount = 0', () => {
    const span = SpanBuilder
      .start({ trail: 'movies.people', from: 'movies', to: 'people' })
      .endWithError(new Error('fail'), makeEngineState())
    expect(span.rowCount).toBe(0)
  })

  it('[sb-13] endWithError() → engineState transmis intact', () => {
    const state = makeEngineState()
    const span  = SpanBuilder
      .start({ trail: 'movies.people', from: 'movies', to: 'people' })
      .endWithError(new Error('x'), state)
    expect(span.error!.engineState).toEqual(state)
  })

  it('[sb-14] stepEnd sans stepStart → silencieux, timing absent', () => {
    expect(() => {
      const builder = SpanBuilder.start({ trail: 'movies.people', from: 'movies', to: 'people' })
      builder.stepEnd('QueryEngine')  // jamais démarré
      const span = builder.end({ rowCount: 0 })
      expect(span.timings.find(t => t.step === 'QueryEngine')).toBeUndefined()
    }).not.toThrow()
  })

  it('[sb-15] routeKey = "from→to"', () => {
    const builder = SpanBuilder.start({ trail: 'movies.people', from: 'movies', to: 'people' })
    expect(builder.routeKey).toBe('movies→people')
  })

  it('[sb-16] plusieurs steps → chacun présent dans timings', () => {
    const builder = SpanBuilder.start({ trail: 'movies.people', from: 'movies', to: 'people' })
    builder.stepStart('PathFinder')
    builder.stepEnd('PathFinder')
    builder.stepStart('QueryEngine')
    builder.stepEnd('QueryEngine')
    builder.stepStart('Provider')
    builder.stepEnd('Provider')
    const span = builder.end({ rowCount: 5 })

    const steps = span.timings.map(t => t.step)
    expect(steps).toContain('PathFinder')
    expect(steps).toContain('QueryEngine')
    expect(steps).toContain('Provider')
    expect(steps).toContain('Total')
  })

  it('[sb-17] yoyo flag dans cacheEvent transmis', () => {
    const span = SpanBuilder
      .start({ trail: 'movies.people', from: 'movies', to: 'people' })
      .addCacheEvent({ level: 'L2', hit: false, entity: 'movies:42', promoted: false, yoyo: true })
      .end({ rowCount: 0 })

    expect(span.cacheEvents[0].yoyo).toBe(true)
  })
})

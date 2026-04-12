/**
 * UC-T3 — LatencyBaselineStore
 *
 * Calcul percentiles p50/p90/p99, fenêtre glissante, injection manuelle.
 */

import { describe, it, expect } from 'vitest'
import { LatencyBaselineStore } from '../src/metrics/LatencyBaseline.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Enregistre n mesures croissantes [1, 2, ..., n] pour une route */
function recordN(store: LatencyBaselineStore, route: string, n: number, base = 1): void {
  for (let i = 0; i < n; i++) store.record(route, base + i)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('UC-T3 — LatencyBaselineStore', () => {

  it('[lat-1] < 10 mesures → baseline undefined', () => {
    const store = new LatencyBaselineStore()
    for (let i = 0; i < 9; i++) store.record('movies→people', 50)
    expect(store.get('movies→people')).toBeUndefined()
    expect(store.p90('movies→people')).toBeUndefined()
  })

  it('[lat-2] exactement 10 mesures → baseline calculée', () => {
    const store = new LatencyBaselineStore()
    recordN(store, 'movies→people', 10, 10)
    const baseline = store.get('movies→people')
    expect(baseline).toBeDefined()
    expect(baseline!.sampleCount).toBe(10)
    expect(baseline!.route).toBe('movies→people')
  })

  it('[lat-3] p50 ≤ p90 ≤ p99', () => {
    const store = new LatencyBaselineStore()
    // Mesures variées : [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
    for (let i = 1; i <= 10; i++) store.record('test→route', i * 10)
    const b = store.get('test→route')!
    expect(b.p50Ms).toBeLessThanOrEqual(b.p90Ms)
    expect(b.p90Ms).toBeLessThanOrEqual(b.p99Ms)
  })

  it('[lat-4] fenêtre glissante — vieilles mesures évictées', () => {
    // windowSize = 10, on enregistre d'abord 10 valeurs basses, puis 10 hautes
    const store = new LatencyBaselineStore({ windowSize: 10 })

    // Phase 1 : mesures basses (1..10)
    recordN(store, 'movies→people', 10, 1)
    const baseline1 = store.get('movies→people')!
    const oldP50 = baseline1.p50Ms

    // Phase 2 : 10 mesures hautes écrasent les anciennes
    recordN(store, 'movies→people', 10, 1000)
    const baseline2 = store.get('movies→people')!
    const newP50 = baseline2.p50Ms

    // Le p50 doit avoir fortement augmenté (les vieilles valeurs sont parties)
    expect(newP50).toBeGreaterThan(oldP50 * 10)
  })

  it('[lat-5] route inconnue → p90() = undefined', () => {
    const store = new LatencyBaselineStore()
    expect(store.p90('inconnue→route')).toBeUndefined()
  })

  it('[lat-6] set() manuel → get() retourne la baseline injectée', () => {
    const store = new LatencyBaselineStore()
    const injected = {
      route:       'custom→route',
      p50Ms:       40,
      p90Ms:       80,
      p99Ms:       150,
      sampleCount: 500,
      lastUpdated: Date.now(),
    }
    store.set(injected)
    expect(store.get('custom→route')).toEqual(injected)
    expect(store.p90('custom→route')).toBe(80)
  })

  it('[lat-7] all() → retourne toutes les baselines', () => {
    const store = new LatencyBaselineStore()
    recordN(store, 'movies→people', 10)
    recordN(store, 'movies→credits', 10)
    // 'movies→short' a < 10 mesures → pas dans all()
    recordN(store, 'movies→short', 5)

    const all = store.all()
    expect(all).toHaveLength(2)
    expect(all.map(b => b.route).sort()).toEqual(['movies→credits', 'movies→people'])
  })

  it('[lat-8] size = nombre de routes distinctes avec baseline', () => {
    const store = new LatencyBaselineStore()
    recordN(store, 'A→B', 10)
    recordN(store, 'C→D', 10)
    expect(store.size).toBe(2)
  })

  it('[lat-9] deux routes indépendantes — pas d\'interférence', () => {
    const store = new LatencyBaselineStore()
    // Route A : mesures basses
    for (let i = 0; i < 10; i++) store.record('A→B', 10)
    // Route B : mesures hautes
    for (let i = 0; i < 10; i++) store.record('C→D', 1000)

    const a = store.get('A→B')!
    const b = store.get('C→D')!

    expect(a.p90Ms).toBeLessThan(100)
    expect(b.p90Ms).toBeGreaterThan(100)
  })

  it('[lat-10] sampleCount = nb de mesures dans la fenêtre', () => {
    const store = new LatencyBaselineStore({ windowSize: 15 })
    // Enregistre 20 mesures → fenêtre garde les 15 dernières
    recordN(store, 'movies→people', 20)
    const b = store.get('movies→people')!
    expect(b.sampleCount).toBe(15)
  })

  it('[lat-11] lastUpdated est un timestamp récent', () => {
    const before = Date.now()
    const store  = new LatencyBaselineStore()
    recordN(store, 'movies→people', 10)
    const b = store.get('movies→people')!
    expect(b.lastUpdated).toBeGreaterThanOrEqual(before)
    expect(b.lastUpdated).toBeLessThanOrEqual(Date.now() + 5)
  })

  it('[lat-12] set() écrase une baseline existante', () => {
    const store = new LatencyBaselineStore()
    recordN(store, 'movies→people', 10, 10)  // p90 ≈ 18

    store.set({ route: 'movies→people', p50Ms: 100, p90Ms: 200, p99Ms: 300, sampleCount: 999, lastUpdated: 0 })
    expect(store.p90('movies→people')).toBe(200)
  })
})

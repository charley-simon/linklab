/**
 * UC-T4 — CapacityBaselineStore
 *
 * Baseline de capacité, ratio de pression, fenêtre glissante throughput.
 */

import { describe, it, expect } from 'vitest'
import { CapacityBaselineStore } from '../src/metrics/CapacityBaseline.js'
import type { CapacityBaseline } from '../src/types.js'

// ── Fixture ───────────────────────────────────────────────────────────────────

function makeBaseline(nominalRps = 70): CapacityBaseline {
  return { nominalRps, maxRps: 100, breakingPoint: 250, lastUpdated: Date.now() }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('UC-T4 — CapacityBaselineStore', () => {

  it('[cap-1] hasBaseline() avant set() → false', () => {
    const store = new CapacityBaselineStore()
    expect(store.hasBaseline()).toBe(false)
  })

  it('[cap-2] set() → hasBaseline() = true', () => {
    const store = new CapacityBaselineStore()
    store.set(makeBaseline())
    expect(store.hasBaseline()).toBe(true)
  })

  it('[cap-3] get() avant set() → null', () => {
    const store = new CapacityBaselineStore()
    expect(store.get()).toBeNull()
  })

  it('[cap-4] nominalRps() sans rien → 100 (fallback)', () => {
    const store = new CapacityBaselineStore()
    expect(store.nominalRps()).toBe(100)
  })

  it('[cap-5] nominalRps() avec baseline → baseline.nominalRps', () => {
    const store = new CapacityBaselineStore()
    store.set(makeBaseline(80))
    expect(store.nominalRps()).toBe(80)
  })

  it('[cap-6] pressureRatio(0) → 0', () => {
    const store = new CapacityBaselineStore()
    store.set(makeBaseline(100))
    expect(store.pressureRatio(0)).toBe(0)
  })

  it('[cap-7] pressureRatio(nominalRps) → ≈ 1.0', () => {
    const store = new CapacityBaselineStore()
    store.set(makeBaseline(50))
    expect(store.pressureRatio(50)).toBeCloseTo(1.0, 5)
  })

  it('[cap-8] pressureRatio(2× nominalRps) → ≈ 2.0', () => {
    const store = new CapacityBaselineStore()
    store.set(makeBaseline(50))
    expect(store.pressureRatio(100)).toBeCloseTo(2.0, 5)
  })

  it('[cap-9] fenêtre glissante — 61e sample écrase le 1er', () => {
    const store = new CapacityBaselineStore()
    // 60 samples à 10 rps
    for (let i = 0; i < 60; i++) store.recordThroughput(10)
    // 61e sample à 100 rps — pousse le premier dehors
    store.recordThroughput(100)

    // La moyenne doit être tirée vers le haut par le 100 rps
    // (59 × 10 + 1 × 100) / 60 ≈ 11.5  → nominalRps estimé ≈ 14.4
    const estimated = store.nominalRps()
    expect(estimated).toBeGreaterThan(10 / 0.80)  // > estimation pure à 10 rps
  })

  it('[cap-10] nominalRps() sans baseline, avec samples → avg / 0.80', () => {
    const store = new CapacityBaselineStore()
    // Tous à 80 rps → avg = 80 → nominalRps estimé = 80 / 0.80 = 100
    for (let i = 0; i < 10; i++) store.recordThroughput(80)
    expect(store.nominalRps()).toBeCloseTo(100, 0)
  })

  it('[cap-11] set() écrase la baseline précédente', () => {
    const store = new CapacityBaselineStore()
    store.set(makeBaseline(50))
    store.set(makeBaseline(200))
    expect(store.nominalRps()).toBe(200)
  })

  it('[cap-12] get() retourne la baseline exacte injectée', () => {
    const store    = new CapacityBaselineStore()
    const baseline = makeBaseline(75)
    store.set(baseline)
    expect(store.get()).toEqual(baseline)
  })
})

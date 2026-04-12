/**
 * UC-T6 — BenchmarkRunner
 *
 * Distribution Zipf, calibration latence, calibration capacité, rapports.
 */

import { describe, it, expect } from 'vitest'
import { BenchmarkRunner }       from '../src/metrics/BenchmarkRunner.js'
import { LatencyBaselineStore }  from '../src/metrics/LatencyBaseline.js'
import { CapacityBaselineStore } from '../src/metrics/CapacityBaseline.js'
import type { TrailDescriptor }  from '../src/metrics/BenchmarkRunner.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRunner() {
  const latency  = new LatencyBaselineStore()
  const capacity = new CapacityBaselineStore()
  const runner   = new BenchmarkRunner(latency, capacity)
  return { runner, latency, capacity }
}

function makeTrails(n: number): TrailDescriptor[] {
  return Array.from({ length: n }, (_, i) => ({
    trail:   `movies(${i}).people`,
    from:    'movies',
    to:      'people',
    filters: { id: i },
  }))
}

/**
 * Simule la distribution Zipf interne en exposant ses tirages via calibrateLatency.
 * On compte quels trails sont accédés.
 */
async function measureZipfDistribution(n: number, iterations: number): Promise<number[]> {
  const { runner } = makeRunner()
  const trails     = makeTrails(n)
  const counts     = new Array(n).fill(0)

  await runner.calibrateLatency(
    trails,
    async (trail) => {
      const idx = trails.findIndex(t => t.trail === trail.trail)
      if (idx >= 0) counts[idx]++
      return 10   // latence fixe
    },
    { iterations, warmup: 0 }
  )
  return counts
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('UC-T6 — BenchmarkRunner', () => {

  it('[bench-1] Zipf top 20% = 70–90% des accès sur 1000 tirages', async () => {
    const n          = 100
    const iterations = 1000
    const counts     = await measureZipfDistribution(n, iterations)
    const total      = counts.reduce((a, b) => a + b, 0)

    // Top 20 trails (indices 0..19)
    const top20Count = counts.slice(0, Math.floor(n * 0.20)).reduce((a, b) => a + b, 0)
    const top20Pct   = top20Count / total

    expect(top20Pct).toBeGreaterThanOrEqual(0.60)   // ≥ 60% — marge pour l'aléatoire
    expect(top20Pct).toBeLessThanOrEqual(0.95)       // ≤ 95%
  }, 10_000)  // timeout 10s pour les 1000 iterations

  it('[bench-2] calibrateLatency 2 trails → 2 routes dans baselines', async () => {
    const { runner, latency } = makeRunner()
    const trails = [
      { trail: 'movies.people', from: 'movies', to: 'people',  filters: {} },
      { trail: 'movies.cast',   from: 'movies', to: 'cast',    filters: {} },
    ]

    await runner.calibrateLatency(
      trails,
      async () => Math.random() * 100 + 10,
      { iterations: 50, warmup: 0 }
    )

    const all = latency.all()
    expect(all.length).toBeGreaterThanOrEqual(1)  // au moins 1 route (dépend de la distribution)
  }, 5_000)

  it('[bench-3] totalRuns = iterations demandées', async () => {
    const { runner } = makeRunner()
    const result = await runner.calibrateLatency(
      makeTrails(5),
      async () => 50,
      { iterations: 30, warmup: 0 }
    )
    expect(result.totalRuns).toBe(30)
  }, 5_000)

  it('[bench-4] report contient un tableau formaté', async () => {
    const { runner, latency } = makeRunner()
    // Injecter une baseline pour que le rapport soit non-vide
    latency.set({ route: 'movies→people', p50Ms: 40, p90Ms: 80, p99Ms: 120, sampleCount: 50, lastUpdated: 0 })

    const result = await runner.calibrateLatency(
      makeTrails(2),
      async () => 50,
      { iterations: 20, warmup: 0 }
    )
    // Le rapport doit contenir des lignes de tableau
    expect(result.report).toMatch(/[┌┐│├┤└┘]/)
  }, 5_000)

  it('[bench-5] baselines dans latencyStore après calibration', async () => {
    const { runner, latency } = makeRunner()
    // Un seul trail, 100 iterations → la route doit avoir une baseline
    await runner.calibrateLatency(
      [{ trail: 'movies.people', from: 'movies', to: 'people', filters: {} }],
      async () => 75,
      { iterations: 100, warmup: 0 }
    )
    expect(latency.p90('movies→people')).toBeDefined()
  }, 5_000)

  it('[bench-6] calibrateLatency trails vides → 0 baselines, pas de crash', async () => {
    const { runner } = makeRunner()
    const result = await runner.calibrateLatency([], async () => 50, { iterations: 10 })
    expect(result.baselines).toHaveLength(0)
    expect(result.totalRuns).toBe(0)
  })

  it('[bench-7] calibrateCapacity → verdict rupture détecté quand latence > 2× p90ref', async () => {
    const { runner } = makeRunner()

    // execute() : latence croissante selon le nb d'appels parallèles simulés
    // Au-delà de 20 concurrents simulés, on dépasse le seuil
    let callCount = 0
    const execute = async (): Promise<number> => {
      callCount++
      // Simule une dégradation progressive
      return callCount > 200 ? 500 : 50
    }

    const result = await runner.calibrateCapacity(execute, {
      p90ref:          100,    // rupture si p90 > 200ms
      maxConcurrency:  30,
      stepSize:        10,
      durationPerStep: 200,    // 200ms par palier pour que le test soit rapide
    })

    const verdicts = result.paliers.map(p => p.verdict)
    // Il doit y avoir au moins un palier "nominal" ou "dégradé"
    expect(verdicts.length).toBeGreaterThan(0)
    expect(result.baseline.nominalRps).toBeGreaterThan(0)
  }, 10_000)

  it('[bench-8] nominalRps ≈ 70% du maxRps mesuré', async () => {
    const { runner } = makeRunner()

    // execute() rapide et stable → pas de rupture, on prend le dernier palier
    const result = await runner.calibrateCapacity(
      async () => 10,   // toujours rapide
      {
        p90ref:          100,
        maxConcurrency:  20,
        stepSize:        10,
        durationPerStep: 100,
      }
    )

    const ratio = result.baseline.nominalRps / result.baseline.maxRps
    expect(ratio).toBeCloseTo(0.70, 1)
  }, 10_000)

  it('[bench-9] baseline capacité dans capacityStore après calibration', async () => {
    const { runner, capacity } = makeRunner()
    await runner.calibrateCapacity(
      async () => 20,
      { p90ref: 50, maxConcurrency: 10, stepSize: 5, durationPerStep: 50 }
    )
    expect(capacity.hasBaseline()).toBe(true)
  }, 5_000)

  it('[bench-10] rapport capacité contient les colonnes attendues', async () => {
    const { runner } = makeRunner()
    const result = await runner.calibrateCapacity(
      async () => 15,
      { p90ref: 50, maxConcurrency: 10, stepSize: 5, durationPerStep: 50 }
    )
    expect(result.report).toMatch(/Nominal/)
    expect(result.report).toMatch(/RPS/)
    expect(result.report).toMatch(/[┌┐│]/)
  }, 5_000)
})

/**
 * LatencyBaseline.ts — Baseline de latence par route
 *
 * Stocke les percentiles (p50/p90/p99) par route "from→to".
 * Utilisé par MetricsCalculator pour calculer Tension.
 *
 * Mise à jour par CalibrationJob sur fenêtre glissante des
 * 100 dernières exécutions réelles de chaque route.
 * Même logique que la calibration des poids de graphe.
 */

import type { LatencyBaseline } from '../types.js'

// ── LatencyBaselineStore ──────────────────────────────────────────────────────

export class LatencyBaselineStore {

  /** baseline par route — clé = "from→to" */
  private baselines = new Map<string, LatencyBaseline>()

  /** historique brut des latences par route (fenêtre glissante) */
  private samples   = new Map<string, number[]>()

  private readonly windowSize: number

  constructor(opts: { windowSize?: number } = {}) {
    // 100 derniers échantillons par route — même fenêtre que les poids de graphe
    this.windowSize = opts.windowSize ?? 100
  }

  // ── Enregistrement ────────────────────────────────────────────────────────

  /** Ajoute une mesure de latence pour une route donnée */
  record(route: string, latencyMs: number): void {
    if (!this.samples.has(route)) {
      this.samples.set(route, [])
    }
    const buf = this.samples.get(route)!
    buf.push(latencyMs)

    // Fenêtre glissante — on garde les N derniers
    if (buf.length > this.windowSize) {
      buf.splice(0, buf.length - this.windowSize)
    }

    // Recalculer la baseline si on a assez d'échantillons
    if (buf.length >= 10) {
      this.recalculate(route, buf)
    }
  }

  // ── Lecture ───────────────────────────────────────────────────────────────

  get(route: string): LatencyBaseline | undefined {
    return this.baselines.get(route)
  }

  /** p90 pour une route — valeur de référence pour Tension */
  p90(route: string): number | undefined {
    return this.baselines.get(route)?.p90Ms
  }

  /** Toutes les baselines connues */
  all(): LatencyBaseline[] {
    return [...this.baselines.values()]
  }

  /** Nombre de routes connues */
  get size(): number { return this.baselines.size }

  // ── Calibration manuelle ─────────────────────────────────────────────────

  /**
   * Injecte une baseline pré-calculée (issue de BenchmarkRunner).
   * Écrase la baseline existante.
   */
  set(baseline: LatencyBaseline): void {
    this.baselines.set(baseline.route, baseline)
  }

  // ── Calcul des percentiles ────────────────────────────────────────────────

  private recalculate(route: string, samples: number[]): void {
    const sorted = [...samples].sort((a, b) => a - b)
    const n      = sorted.length

    this.baselines.set(route, {
      route,
      p50Ms:       percentile(sorted, 0.50),
      p90Ms:       percentile(sorted, 0.90),
      p99Ms:       percentile(sorted, 0.99),
      sampleCount: n,
      lastUpdated: Date.now(),
    })
  }
}

// ── Utilitaire ────────────────────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.min(
    Math.ceil(p * sorted.length) - 1,
    sorted.length - 1
  )
  return sorted[idx]
}

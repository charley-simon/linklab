/**
 * MetricsCalculator.ts — Calcul des métriques sémantiques
 *
 * Trois métriques composites, calculées sur une fenêtre glissante de spans :
 *
 *   Tension  = latence_réelle / latence_attendue (p90 baseline)
 *              > 1 → le système souffre
 *              Valeur clamped à [0..5] pour éviter les pics aberrants
 *
 *   Pression = (upgrades_en_attente + cache_misses) / capacité
 *              Proxy de la charge sur les ressources externes
 *              Valeur clamped à [0..1]
 *
 *   Confort  = cache_hit_rate × (1 - tension_norm) × (1 - pression)
 *              tension_norm = clamp(tension/2, 0, 1)  — normalisée [0..1]
 *              Métrique de synthèse — celle qu'on regarde en premier
 *
 * Alimenté par le TraceBus (span:end) — émet metrics:update périodiquement.
 */

import type { Span, SystemMetrics, SpanMetrics } from '../types.js'
import type { LatencyBaselineStore }              from './LatencyBaseline.js'
import type { CapacityBaselineStore }             from './CapacityBaseline.js'

// ── SlidingWindow — buffer circulaire de spans ────────────────────────────────

class SlidingWindow {
  private buffer:  Span[]   = []
  private readonly maxAge:  number   // ms

  constructor(windowMs: number) {
    this.maxAge = windowMs
  }

  push(span: Span): void {
    this.buffer.push(span)
    this.evict()
  }

  spans(): readonly Span[] {
    this.evict()
    return this.buffer
  }

  private evict(): void {
    const cutoff = Date.now() - this.maxAge
    // Optimisation : les spans arrivent dans l'ordre chronologique
    let i = 0
    while (i < this.buffer.length && this.buffer[i].timestamp < cutoff) i++
    if (i > 0) this.buffer.splice(0, i)
  }

  get size(): number { return this.buffer.length }
}

// ── MetricsCalculator ─────────────────────────────────────────────────────────

export class MetricsCalculator {

  private readonly window:   SlidingWindow
  private readonly latency:  LatencyBaselineStore
  private readonly capacity: CapacityBaselineStore

  constructor(opts: {
    windowMs:  number
    latency:   LatencyBaselineStore
    capacity:  CapacityBaselineStore
  }) {
    this.window   = new SlidingWindow(opts.windowMs)
    this.latency  = opts.latency
    this.capacity = opts.capacity
  }

  // ── Ingestion ─────────────────────────────────────────────────────────────

  /** Ajoute un span terminé à la fenêtre — appelé par TraceBus */
  ingest(span: Span): void {
    const route = `${span.from}→${span.to}`

    // Recalibration auto uniquement si la baseline de cette route
    // n'a pas été injectée manuellement via latency.set().
    // Une baseline manuelle a sampleCount élevé (≥ 100) — on la respecte.
    const existing = this.latency.get(route)
    if (!existing || existing.sampleCount < 100) {
      this.latency.record(route, span.totalMs)
    }

    this.window.push(span)
  }

  // ── Calcul des métriques ──────────────────────────────────────────────────

  /**
   * Calcule les métriques sur la fenêtre courante.
   * Appelé périodiquement (ex: toutes les 5s) ou à la demande.
   */
  compute(windowMs: number): SystemMetrics {
    const spans = this.window.spans()
    const now   = Date.now()

    if (spans.length === 0) {
      return this.emptyMetrics(windowMs, now)
    }

    // ── Primitives ──────────────────────────────────────────────────────────

    const totalSpans = spans.length
    const errorSpans = spans.filter(s => s.error).length
    const errorRate  = totalSpans > 0 ? errorSpans / totalSpans : 0

    // Throughput — requêtes/seconde sur la fenêtre
    const windowSec  = windowMs / 1_000
    const throughput = totalSpans / windowSec

    // Cache stats — agrégées depuis les cacheEvents de chaque span
    let cacheHits = 0, cacheMisses = 0, yoyoEvents = 0
    for (const span of spans) {
      for (const ev of span.cacheEvents) {
        if (ev.hit)  cacheHits++
        else         cacheMisses++
        if (ev.yoyo) yoyoEvents++
      }
    }
    const totalCacheReqs = cacheHits + cacheMisses
    const cacheHitRate   = totalCacheReqs > 0 ? cacheHits / totalCacheReqs : 0
    const yoyoRate       = totalSpans > 0 ? yoyoEvents / totalSpans : 0

    // Path stability — même trail emprunte-t-il toujours le même chemin ?
    const pathStability = computePathStability(spans)

    // ── Tension ─────────────────────────────────────────────────────────────

    const tension = computeTension(spans, this.latency)

    // ── Pression ─────────────────────────────────────────────────────────────

    // Upgrades en attente = yoyo events (entités re-fetchées depuis l'API)
    //                     + cache misses (requêtes vers le provider)
    const pendingUpgrades = yoyoEvents + cacheMisses
    const nominalCap      = this.capacity.nominalRps() * windowSec  // requêtes nominales sur la fenêtre
    const pression        = clamp(pendingUpgrades / Math.max(nominalCap, 1), 0, 1)

    // ── Confort ──────────────────────────────────────────────────────────────

    const tensionNorm = clamp(tension / 2, 0, 1)  // [0..2] → [0..1]
    const confort     = cacheHitRate * (1 - tensionNorm) * (1 - pression)

    // Enregistrer le throughput pour la baseline de capacité
    this.capacity.recordThroughput(throughput)

    return {
      window:    windowMs,
      timestamp: now,
      tension,
      pression,
      confort,
      throughput,
      errorRate,
      cacheHitRate,
      yoyoRate,
      pathStability,
      totalSpans,
      errorSpans,
      cacheHits,
      cacheMisses,
      yoyoEvents,
    }
  }

  /**
   * Calcule les métriques enrichies pour un span individuel.
   * Appelé juste avant l'émission 'span:end' pour enrichir le span.
   */
  forSpan(span: Span): SpanMetrics {
    const route = `${span.from}→${span.to}`
    const p90   = this.latency.p90(route)

    // Tension de ce span par rapport à la baseline de sa route
    const tension = p90 && p90 > 0
      ? clamp(span.totalMs / p90, 0, 5)
      : 1   // sans baseline, on assume nominal

    // Pression du span — ratio miss cache sur ses propres events
    const events     = span.cacheEvents
    const totalEvts  = events.length
    const missEvts   = events.filter(e => !e.hit).length
    const yoyoEvts   = events.filter(e => e.yoyo).length
    const pression   = totalEvts > 0
      ? clamp((missEvts + yoyoEvts) / totalEvts, 0, 1)
      : 0

    // Hit rate de ce span
    const hitRate  = totalEvts > 0 ? (totalEvts - missEvts) / totalEvts : 1

    const tensionNorm = clamp(tension / 2, 0, 1)
    const confort     = hitRate * (1 - tensionNorm) * (1 - pression)

    return { tension, pression, confort }
  }

  // ── État interne ──────────────────────────────────────────────────────────

  get windowSize(): number { return this.window.size }

  // ── Métriques vides ───────────────────────────────────────────────────────

  private emptyMetrics(windowMs: number, now: number): SystemMetrics {
    return {
      window: windowMs, timestamp: now,
      tension: 1, pression: 0, confort: 0,
      throughput: 0, errorRate: 0, cacheHitRate: 0,
      yoyoRate: 0, pathStability: 1,
      totalSpans: 0, errorSpans: 0,
      cacheHits: 0, cacheMisses: 0, yoyoEvents: 0,
    }
  }
}

// ── Fonctions pures ───────────────────────────────────────────────────────────

/**
 * Tension globale = moyenne des tensions par route.
 * Chaque route contribue selon son p90 baseline.
 */
function computeTension(spans: readonly Span[], latency: LatencyBaselineStore): number {
  if (spans.length === 0) return 1

  // Grouper par route
  const byRoute = new Map<string, number[]>()
  for (const span of spans) {
    const route = `${span.from}→${span.to}`
    if (!byRoute.has(route)) byRoute.set(route, [])
    byRoute.get(route)!.push(span.totalMs)
  }

  // Tension par route = p90_réel / p90_baseline
  const tensions: number[] = []
  for (const [route, latencies] of byRoute) {
    const p90Baseline = latency.p90(route)
    if (!p90Baseline) continue  // pas encore de baseline pour cette route

    const sorted = [...latencies].sort((a, b) => a - b)
    const p90Real = sorted[Math.min(Math.ceil(0.90 * sorted.length) - 1, sorted.length - 1)]
    tensions.push(clamp(p90Real / p90Baseline, 0, 5))
  }

  if (tensions.length === 0) return 1  // pas encore de baseline connue → nominal

  return tensions.reduce((a, b) => a + b, 0) / tensions.length
}

/**
 * Path stability = proportion de trails qui empruntent toujours le même chemin.
 * 1.0 = stable, 0.0 = chaos complet.
 */
function computePathStability(spans: readonly Span[]): number {
  if (spans.length === 0) return 1

  // Grouper par trail
  const byTrail = new Map<string, Set<string>>()
  for (const span of spans) {
    if (!byTrail.has(span.trail)) byTrail.set(span.trail, new Set())
    byTrail.get(span.trail)!.add(span.path.join('→'))
  }

  // Stabilité = proportion de trails avec un seul chemin observé
  let stableCount = 0
  for (const paths of byTrail.values()) {
    if (paths.size === 1) stableCount++
  }
  return stableCount / byTrail.size
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

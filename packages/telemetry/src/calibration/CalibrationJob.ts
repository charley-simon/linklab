import { DuckDBDriver }         from '../drivers/DuckDBDriver.js'
import { LatencyBaselineStore } from '../metrics/LatencyBaseline.js'
import type { TraceBus }        from '../bus/TraceBus.js'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CalibrationJobOptions {
  duckdb:          DuckDBDriver
  latency:         LatencyBaselineStore
  bus:             TraceBus
  windowMs?:       number
  intervalMs?:     number
  initialDelayMs?: number
  minSamples?:     number
}

export interface CalibrationRouteResult {
  route: string
  p50:   number
  p90:   number
  p99:   number
  count: number
  delta: number | null  // % de variation vs baseline précédente (null = première fois)
}

export interface CalibrationResult {
  timestamp:  number
  routeCount: number
  routes:     CalibrationRouteResult[]
}

// ─── CalibrationJob ──────────────────────────────────────────────────────────

export class CalibrationJob {

  private readonly duckdb:         DuckDBDriver
  private readonly latency:        LatencyBaselineStore
  private readonly bus:            TraceBus
  private readonly windowMs:       number
  private readonly intervalMs:     number
  private readonly initialDelayMs: number
  private readonly minSamples:     number

  private timer?:        ReturnType<typeof setInterval>
  private initialTimer?: ReturnType<typeof setTimeout>
  private running = false

  /**
   * Hook optionnel appelé après chaque runOnce() réussi.
   * Le bridge (telemetry-graph-bridge) l'utilise pour mettre à jour les
   * poids du graphe et déclencher un hot-reload.
   */
  onCalibrated?: (result: CalibrationResult) => Promise<void> | void

  constructor(opts: CalibrationJobOptions) {
    this.duckdb         = opts.duckdb
    this.latency        = opts.latency
    this.bus            = opts.bus
    this.windowMs       = opts.windowMs       ?? 60_000
    this.intervalMs     = opts.intervalMs     ?? 60_000
    this.initialDelayMs = opts.initialDelayMs ?? 30_000
    this.minSamples     = opts.minSamples     ?? 10
  }

  // ── Cycle de vie ────────────────────────────────────────────────────────────

  start(): void {
    if (this.running) return
    this.running = true

    this.initialTimer = setTimeout(() => {
      this.runOnce().catch(err =>
        console.warn(`[CalibrationJob] Première calibration échouée : ${err}`)
      )

      this.timer = setInterval(() => {
        this.runOnce().catch(err =>
          console.warn(`[CalibrationJob] Calibration échouée : ${err}`)
        )
      }, this.intervalMs)

    }, this.initialDelayMs)

    console.log(
      `[CalibrationJob] Démarré — fenêtre ${this.windowMs}ms, ` +
      `intervalle ${this.intervalMs}ms, délai initial ${this.initialDelayMs}ms`
    )
  }

  stop(): void {
    if (!this.running) return
    this.running = false

    clearTimeout(this.initialTimer)
    clearInterval(this.timer)
    this.initialTimer = undefined
    this.timer        = undefined

    console.log('[CalibrationJob] Arrêté.')
  }

  get isRunning(): boolean { return this.running }

  // ── Calibration ─────────────────────────────────────────────────────────────

  /**
   * Lance une calibration immédiate (hors schedule).
   * Utile pour forcer une recalibration après un bench, en test, ou via CLI.
   */
  async runOnce(): Promise<CalibrationResult | null> {
    if (!this.duckdb.isConnected) return null

    let rows: Awaited<ReturnType<typeof this.duckdb.latencyPercentiles>>
    try {
      rows = await this.duckdb.latencyPercentiles(this.windowMs)
    } catch (err) {
      console.warn(`[CalibrationJob] latencyPercentiles() échoué : ${err}`)
      return null
    }

    const significant = rows.filter(r => r.count >= this.minSamples)
    if (!significant.length) {
      console.log(`[CalibrationJob] Pas assez de données (min ${this.minSamples} spans/route)`)
      return null
    }

    const result: CalibrationResult = {
      timestamp:  Date.now(),
      routeCount: significant.length,
      routes:     [],
    }

    for (const row of significant) {
      const previous = this.latency.get(row.route)
      const delta    = previous
        ? ((row.p90 - previous.p90Ms) / previous.p90Ms) * 100
        : null

      this.latency.set({
        route:       row.route,
        p50Ms:       row.p50,
        p90Ms:       row.p90,
        p99Ms:       row.p99,
        sampleCount: row.count,
        lastUpdated: Date.now(),
      })

      result.routes.push({
        route: row.route,
        p50:   row.p50,
        p90:   row.p90,
        p99:   row.p99,
        count: row.count,
        delta,
      })

      if (delta !== null && Math.abs(delta) > 20) {
        console.warn(
          `[CalibrationJob] Dérive détectée sur ${row.route} : ` +
          `p90 ${delta > 0 ? '+' : ''}${delta.toFixed(1)}% ` +
          `(${previous!.p90Ms.toFixed(0)}ms → ${row.p90.toFixed(0)}ms)`
        )
      }
    }

    // Émettre sur le bus (format agrégé batch pour la CLI/dashboard)
    this.bus.emit('calibration:done', {
      route:       `batch:${result.routeCount}`,
      p50Ms:       result.routes.reduce((s, r) => s + r.p50, 0) / result.routeCount,
      p90Ms:       result.routes.reduce((s, r) => s + r.p90, 0) / result.routeCount,
      p99Ms:       result.routes.reduce((s, r) => s + r.p99, 0) / result.routeCount,
      sampleCount: result.routes.reduce((s, r) => s + r.count, 0),
      lastUpdated: result.timestamp,
    })

    console.log(
      `[CalibrationJob] ${result.routeCount} route(s) recalibrée(s) — ` +
      result.routes
        .map(r =>
          `${r.route} p90=${r.p90.toFixed(0)}ms` +
          (r.delta !== null ? ` (${r.delta > 0 ? '+' : ''}${r.delta.toFixed(1)}%)` : '')
        )
        .join(', ')
    )

    // Appeler le hook onCalibrated si défini (bridge graph/hot-reload)
    if (this.onCalibrated) {
      try {
        await this.onCalibrated(result)
      } catch (err) {
        console.warn(`[CalibrationJob] onCalibrated hook échoué : ${err}`)
      }
    }

    return result
  }
}

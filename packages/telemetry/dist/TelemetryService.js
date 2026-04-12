/**
 * TelemetryService.ts — Façade principale de @linklab/telemetry
 *
 * Orchestre tous les composants :
 *   - TraceBus          : bus d'événements
 *   - GraphDriver       : stockage in-memory session courante
 *   - DuckDBDriver      : persistence analytique (optionnel — activé par duckdb: true)
 *   - MetricsCalculator : Tension / Pression / Confort
 *   - CalibrationJob    : recalibration périodique des baselines depuis DuckDB
 *
 * Usage dans Netflix-backend :
 *
 *   const telemetry = new TelemetryService({
 *     windowMs:    60_000,
 *     duckdb:      true,
 *     duckdbPath:  './data/telemetry.duckdb',
 *     calibration: true,          // active le CalibrationJob
 *   })
 *   await telemetry.start()
 */
import { traceBus } from './bus/TraceBus.js';
import { GraphDriver } from './drivers/GraphDriver.js';
import { DuckDBDriver } from './drivers/DuckDBDriver.js';
import { CalibrationJob } from './calibration/CalibrationJob.js';
import { MetricsCalculator } from './metrics/MetricsCalculator.js';
import { LatencyBaselineStore } from './metrics/LatencyBaseline.js';
import { CapacityBaselineStore } from './metrics/CapacityBaseline.js';
import { BenchmarkRunner } from './metrics/BenchmarkRunner.js';
export class TelemetryService {
    bus = traceBus;
    graph;
    duckdb;
    calculator;
    latency;
    capacity;
    calibration;
    benchmark;
    metricsInterval;
    windowMs;
    metricsIntervalMs;
    duckdbEnabled;
    started = false;
    _onSpanEnd;
    _onSpanError;
    constructor(opts = {}) {
        this.windowMs = opts.windowMs ?? 60_000;
        this.metricsIntervalMs = opts.metricsIntervalMs ?? 5_000;
        this.duckdbEnabled = opts.duckdb ?? false;
        this.graph = new GraphDriver({ maxSpans: opts.maxSpans ?? 10_000 });
        this.duckdb = new DuckDBDriver({ dbPath: opts.duckdbPath });
        this.latency = new LatencyBaselineStore();
        this.capacity = new CapacityBaselineStore();
        this.calculator = new MetricsCalculator({
            windowMs: this.windowMs,
            latency: this.latency,
            capacity: this.capacity,
        });
        this.benchmark = new BenchmarkRunner(this.latency, this.capacity);
        if (opts.calibration) {
            this.calibration = new CalibrationJob({
                duckdb: this.duckdb,
                latency: this.latency,
                bus: this.bus,
                windowMs: this.windowMs,
                intervalMs: opts.calibrationIntervalMs ?? 60_000,
            });
        }
        this._onSpanEnd = (span) => this.onSpan(span);
        this._onSpanError = (span) => this.onSpan(span);
    }
    // ── Cycle de vie ──────────────────────────────────────────────────────────
    async start() {
        if (this.started)
            return;
        this.started = true;
        // Connecter DuckDB si activé
        if (this.duckdbEnabled) {
            await this.duckdb.connect();
            if (!this.duckdb.isConnected) {
                console.warn('[Telemetry] DuckDB non disponible — persistence désactivée');
            }
        }
        this.bus.on('span:end', this._onSpanEnd);
        this.bus.on('span:error', this._onSpanError);
        this.metricsInterval = setInterval(() => {
            const m = this.calculator.compute(this.windowMs);
            this.bus.emit('metrics:update', m);
        }, this.metricsIntervalMs);
        // Démarrer la calibration après un délai initial (laisser DuckDB se peupler)
        this.calibration?.start();
        console.log(`[Telemetry] Démarré — fenêtre ${this.windowMs}ms` +
            (this.duckdb.isConnected ? ' + DuckDB' : '') +
            (this.calibration ? ' + CalibrationJob' : ''));
    }
    async stop() {
        if (!this.started)
            return;
        this.started = false;
        clearInterval(this.metricsInterval);
        this.metricsInterval = undefined;
        this.bus.off('span:end', this._onSpanEnd);
        this.bus.off('span:error', this._onSpanError);
        this.calibration?.stop();
        await this.duckdb.disconnect();
        console.log('[Telemetry] Arrêté.');
    }
    // ── Métriques ─────────────────────────────────────────────────────────────
    metrics() {
        return this.calculator.compute(this.windowMs);
    }
    // ── Rapport de session ────────────────────────────────────────────────────
    sessionReport() {
        const s = this.graph.summary();
        const m = this.metrics();
        const lines = [
            '╔══════════════════════════════════════════════════╗',
            '║         LinkLab Telemetry — Session Report       ║',
            '╠══════════════════════════════════════════════════╣',
            `║  Spans total     : ${String(s.total).padStart(6)}                       ║`,
            `║  Erreurs         : ${String(s.errors).padStart(6)}                       ║`,
            `║  Yoyo events     : ${String(s.yoyos).padStart(6)}                       ║`,
            `║  Trails distincts: ${String(s.trails).padStart(6)}  Routes: ${String(s.routes).padStart(4)}          ║`,
            `║  Latence moyenne : ${String(s.avgLatencyMs).padStart(5)} ms                     ║`,
            '╠══════════════════════════════════════════════════╣',
            `║  Tension  : ${formatMetric(m.tension, 'tension').padEnd(36)} ║`,
            `║  Pression : ${formatMetric(m.pression, 'ratio').padEnd(36)} ║`,
            `║  Confort  : ${formatMetric(m.confort, 'ratio').padEnd(36)} ║`,
            `║  Cache    : ${(m.cacheHitRate * 100).toFixed(1).padStart(5)}% hit rate                    ║`,
            `║  Yoyo     : ${(m.yoyoRate * 100).toFixed(2).padStart(5)}% rate                      ║`,
            '╚══════════════════════════════════════════════════╝',
        ];
        return lines.join('\n');
    }
    // ── Internals ─────────────────────────────────────────────────────────────
    onSpan(span) {
        span.metrics = this.calculator.forSpan(span);
        this.graph.write(span);
        if (this.duckdb.isConnected)
            this.duckdb.write(span);
        this.calculator.ingest(span);
        if (span.cacheEvents.some(e => e.yoyo)) {
            for (const ev of span.cacheEvents.filter(e => e.yoyo)) {
                this.bus.emit('yoyo:detected', {
                    entity: ev.entity ?? 'unknown',
                    route: `${span.from}→${span.to}`,
                    timestamp: span.timestamp,
                });
            }
        }
    }
}
// ── Helpers ───────────────────────────────────────────────────────────────────
function formatMetric(value, type) {
    const pct = type === 'tension'
        ? `${value.toFixed(2)}×`
        : `${(value * 100).toFixed(1)}%`;
    const bar = '█'.repeat(Math.round(Math.min(value, 1) * 10)).padEnd(10);
    return `${pct.padStart(6)} ${bar}`;
}
//# sourceMappingURL=TelemetryService.js.map
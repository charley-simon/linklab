/**
 * @linklab/telemetry — Point d'entrée public
 *
 * ┌─────────────────────────────────────────────────────────────┐
 * │  FAÇADE                                                     │
 * │    TelemetryService  — point d'entrée principal             │
 * │    traceBus          — singleton bus partagé                │
 * ├─────────────────────────────────────────────────────────────┤
 * │  SPANS                                                      │
 * │    SpanBuilder       — construction fluente d'un span       │
 * ├─────────────────────────────────────────────────────────────┤
 * │  MÉTRIQUES                                                  │
 * │    MetricsCalculator — Tension / Pression / Confort         │
 * │    LatencyBaselineStore — p90 par route                     │
 * │    CapacityBaselineStore — throughput nominal               │
 * │    BenchmarkRunner   — calibration initiale (Zipf)          │
 * ├─────────────────────────────────────────────────────────────┤
 * │  DRIVERS                                                    │
 * │    GraphDriver       — in-memory session courante           │
 * │    DuckDBDriver      — persistence analytique        │
 * ├─────────────────────────────────────────────────────────────┤
 * │  TYPES                                                      │
 * │    Span, SpanMetrics, SystemMetrics                         │
 * │    LatencyBaseline, CapacityBaseline                        │
 * │    TelemetryDriver, TelemetryEvent                          │
 * └─────────────────────────────────────────────────────────────┘
 */
// ── Façade ────────────────────────────────────────────────────────────────────
export { TelemetryService } from './TelemetryService.js';
// ── Bus ───────────────────────────────────────────────────────────────────────
export { traceBus } from './bus/TraceBus.js';
// ── Spans ─────────────────────────────────────────────────────────────────────
export { SpanBuilder } from './spans/SpanBuilder.js';
// ── Métriques ─────────────────────────────────────────────────────────────────
export { MetricsCalculator } from './metrics/MetricsCalculator.js';
export { LatencyBaselineStore } from './metrics/LatencyBaseline.js';
export { CapacityBaselineStore } from './metrics/CapacityBaseline.js';
export { BenchmarkRunner } from './metrics/BenchmarkRunner.js';
// ── Drivers ───────────────────────────────────────────────────────────────────
export { GraphDriver } from './drivers/GraphDriver.js';
export { DuckDBDriver } from './drivers/DuckDBDriver.js';
// ── Calibration ───────────────────────────────────────────────────────────────
export { CalibrationJob } from './calibration/CalibrationJob.js';
// ── Bridge utils (logique pure, testable sans @linklab/core) ──────────────────
export { computeNewWeight } from './calibration/bridge-utils.js';
//# sourceMappingURL=index.js.map
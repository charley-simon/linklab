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
export { TelemetryService } from './TelemetryService.js';
export type { TelemetryServiceOptions } from './TelemetryService.js';
export { traceBus } from './bus/TraceBus.js';
export type { TraceBus } from './bus/TraceBus.js';
export { SpanBuilder } from './spans/SpanBuilder.js';
export { MetricsCalculator } from './metrics/MetricsCalculator.js';
export { LatencyBaselineStore } from './metrics/LatencyBaseline.js';
export { CapacityBaselineStore } from './metrics/CapacityBaseline.js';
export { BenchmarkRunner } from './metrics/BenchmarkRunner.js';
export type { TrailDescriptor, BenchmarkLatencyResult, BenchmarkCapacityResult, CapacityPalier } from './metrics/BenchmarkRunner.js';
export { GraphDriver } from './drivers/GraphDriver.js';
export type { GraphDriverOptions, SessionSummary } from './drivers/GraphDriver.js';
export { DuckDBDriver } from './drivers/DuckDBDriver.js';
export type { DuckDBDriverOptions } from './drivers/DuckDBDriver.js';
export type { Span, SpanError, SpanMetrics, StepTiming, CacheEvent, CacheLevel, EngineState, SystemMetrics, LatencyBaseline, CapacityBaseline, TelemetryEvent, TelemetryEventType, TelemetryDriver, } from './types.js';
export { CalibrationJob } from './calibration/CalibrationJob.js';
export type { CalibrationJobOptions, CalibrationResult } from './calibration/CalibrationJob.js';
export { computeNewWeight } from './calibration/bridge-utils.js';
export type { WeightStrategy, WeightUpdateOptions } from './calibration/bridge-utils.js';
//# sourceMappingURL=index.d.ts.map
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
import { GraphDriver } from './drivers/GraphDriver.js';
import { DuckDBDriver } from './drivers/DuckDBDriver.js';
import { BenchmarkRunner } from './metrics/BenchmarkRunner.js';
import type { SystemMetrics } from './types.js';
export interface TelemetryServiceOptions {
    /** Fenêtre de calcul des métriques en ms — défaut: 60_000 (1 min) */
    windowMs?: number;
    /** Intervalle d'émission des metrics:update — défaut: 5_000 (5s) */
    metricsIntervalMs?: number;
    /** Activer DuckDB — défaut: false */
    duckdb?: boolean;
    /** Chemin DuckDB si activé */
    duckdbPath?: string;
    /** Activer la recalibration automatique depuis DuckDB — défaut: false */
    calibration?: boolean;
    /** Intervalle de recalibration en ms — défaut: 60_000 (1 min) */
    calibrationIntervalMs?: number;
    /** Capacité max du GraphDriver in-memory */
    maxSpans?: number;
}
export declare class TelemetryService {
    readonly bus: import("./bus/TraceBus.js").TraceBus;
    readonly graph: GraphDriver;
    readonly duckdb: DuckDBDriver;
    private readonly calculator;
    private readonly latency;
    private readonly capacity;
    private readonly calibration?;
    readonly benchmark: BenchmarkRunner;
    private metricsInterval?;
    private readonly windowMs;
    private readonly metricsIntervalMs;
    private readonly duckdbEnabled;
    private started;
    private readonly _onSpanEnd;
    private readonly _onSpanError;
    constructor(opts?: TelemetryServiceOptions);
    start(): Promise<void>;
    stop(): Promise<void>;
    metrics(): SystemMetrics;
    sessionReport(): string;
    private onSpan;
}
//# sourceMappingURL=TelemetryService.d.ts.map
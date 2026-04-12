import { DuckDBDriver } from '../drivers/DuckDBDriver.js';
import { LatencyBaselineStore } from '../metrics/LatencyBaseline.js';
import type { TraceBus } from '../bus/TraceBus.js';
export interface CalibrationJobOptions {
    duckdb: DuckDBDriver;
    latency: LatencyBaselineStore;
    bus: TraceBus;
    windowMs?: number;
    intervalMs?: number;
    initialDelayMs?: number;
    minSamples?: number;
}
export interface CalibrationRouteResult {
    route: string;
    p50: number;
    p90: number;
    p99: number;
    count: number;
    delta: number | null;
}
export interface CalibrationResult {
    timestamp: number;
    routeCount: number;
    routes: CalibrationRouteResult[];
}
export declare class CalibrationJob {
    private readonly duckdb;
    private readonly latency;
    private readonly bus;
    private readonly windowMs;
    private readonly intervalMs;
    private readonly initialDelayMs;
    private readonly minSamples;
    private timer?;
    private initialTimer?;
    private running;
    /**
     * Hook optionnel appelé après chaque runOnce() réussi.
     * Le bridge (telemetry-graph-bridge) l'utilise pour mettre à jour les
     * poids du graphe et déclencher un hot-reload.
     */
    onCalibrated?: (result: CalibrationResult) => Promise<void> | void;
    constructor(opts: CalibrationJobOptions);
    start(): void;
    stop(): void;
    get isRunning(): boolean;
    /**
     * Lance une calibration immédiate (hors schedule).
     * Utile pour forcer une recalibration après un bench, en test, ou via CLI.
     */
    runOnce(): Promise<CalibrationResult | null>;
}
//# sourceMappingURL=CalibrationJob.d.ts.map
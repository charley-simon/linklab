/**
 * BenchmarkRunner.ts — Calibration initiale des baselines
 *
 * Transposition directe de UC14 au contexte des trails LinkLab.
 *
 * Deux benchmarks :
 *
 *   calibrateLatency(trails, execute)
 *     → Exécute chaque trail N fois
 *     → Calcule p50/p90/p99 par route "from→to"
 *     → Alimente LatencyBaselineStore
 *
 *   calibrateCapacity(execute, opts)
 *     → Envoie des vagues de requêtes parallèles croissantes
 *     → Mesure le throughput et la latence à chaque palier
 *     → Identifie le point de rupture (latence > 2× p90 baseline)
 *     → Capacité nominale = 70% du throughput au point de rupture
 *     → Alimente CapacityBaselineStore
 *
 * Distribution Zipf (UC14) :
 *   80% des accès sur les 20% de trails les plus populaires.
 *   Utilisée pour la calibration de latence afin que la baseline
 *   reflète les conditions réelles de production.
 */
import type { LatencyBaseline, CapacityBaseline } from '../types.js';
import type { LatencyBaselineStore } from './LatencyBaseline.js';
import type { CapacityBaselineStore } from './CapacityBaseline.js';
export interface TrailDescriptor {
    trail: string;
    from: string;
    to: string;
    filters: Record<string, any>;
}
export interface BenchmarkLatencyResult {
    baselines: LatencyBaseline[];
    totalRuns: number;
    durationMs: number;
    report: string;
}
export interface BenchmarkCapacityResult {
    baseline: CapacityBaseline;
    paliers: CapacityPalier[];
    report: string;
}
export interface CapacityPalier {
    concurrency: number;
    throughput: number;
    p90Ms: number;
    verdict: string;
}
export declare class BenchmarkRunner {
    private readonly latencyStore;
    private readonly capacityStore;
    constructor(latencyStore: LatencyBaselineStore, capacityStore: CapacityBaselineStore);
    /**
     * Exécute chaque trail N fois (distribution Zipf) et calibre les baselines.
     *
     * @param trails   - descripteurs des trails à tester
     * @param execute  - fonction d'exécution d'un trail → durée en ms
     * @param opts     - iterations (défaut: 100), warmup (défaut: 10)
     */
    calibrateLatency(trails: TrailDescriptor[], execute: (trail: TrailDescriptor) => Promise<number>, opts?: {
        iterations?: number;
        warmup?: number;
    }): Promise<BenchmarkLatencyResult>;
    /**
     * Benchmark de saturation progressif.
     * Concurrency croissante jusqu'au point de rupture.
     *
     * @param execute     - fonction d'exécution → durée en ms
     * @param opts.p90ref - latence p90 de référence (issue de calibrateLatency)
     */
    calibrateCapacity(execute: () => Promise<number>, opts: {
        p90ref: number;
        maxConcurrency?: number;
        stepSize?: number;
        durationPerStep?: number;
    }): Promise<BenchmarkCapacityResult>;
    private measurePalier;
}
//# sourceMappingURL=BenchmarkRunner.d.ts.map
/**
 * CapacityBaseline.ts — Baseline de capacité du système
 *
 * Stocke le throughput nominal (rps) mesuré par BenchmarkRunner.
 * Utilisé par MetricsCalculator pour calculer Pression.
 *
 * Principe (calqué sur UC14 / benchmark yoyo) :
 *   - Envoyer des requêtes parallèles croissantes
 *   - Mesurer la latence à chaque palier
 *   - Point de rupture = premier palier où latence > 2× p90 baseline
 *   - Capacité nominale = 70% du throughput au point de rupture
 *     (marge de sécurité — même ratio que evictToRatio dans les caches)
 */
import type { CapacityBaseline } from '../types.js';
export declare class CapacityBaselineStore {
    private baseline;
    /** Fenêtre glissante des mesures de throughput (rps observés) */
    private throughputSamples;
    private readonly windowSize;
    /** Résultat d'un benchmark de capacité */
    set(baseline: CapacityBaseline): void;
    /**
     * Enregistre le throughput observé sur la dernière seconde.
     * Appelé par MetricsCalculator à chaque fenêtre glissante.
     */
    recordThroughput(rps: number): void;
    get(): CapacityBaseline | null;
    /**
     * Throughput nominal courant.
     * Si baseline connue → valeur calibrée.
     * Sinon → moyenne des mesures récentes × 1.3 (estimation conservative).
     */
    nominalRps(): number;
    /**
     * Pression de capacité — ratio throughput_actuel / capacité_nominale.
     * ]0..1] nominal, > 1 saturé.
     */
    pressureRatio(currentRps: number): number;
    hasBaseline(): boolean;
}
//# sourceMappingURL=CapacityBaseline.d.ts.map
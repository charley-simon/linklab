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
import type { LatencyBaseline } from '../types.js';
export declare class LatencyBaselineStore {
    /** baseline par route — clé = "from→to" */
    private baselines;
    /** historique brut des latences par route (fenêtre glissante) */
    private samples;
    private readonly windowSize;
    constructor(opts?: {
        windowSize?: number;
    });
    /** Ajoute une mesure de latence pour une route donnée */
    record(route: string, latencyMs: number): void;
    get(route: string): LatencyBaseline | undefined;
    /** p90 pour une route — valeur de référence pour Tension */
    p90(route: string): number | undefined;
    /** Toutes les baselines connues */
    all(): LatencyBaseline[];
    /** Nombre de routes connues */
    get size(): number;
    /**
     * Injecte une baseline pré-calculée (issue de BenchmarkRunner).
     * Écrase la baseline existante.
     */
    set(baseline: LatencyBaseline): void;
    private recalculate;
}
//# sourceMappingURL=LatencyBaseline.d.ts.map
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
import type { Span, SystemMetrics, SpanMetrics } from '../types.js';
import type { LatencyBaselineStore } from './LatencyBaseline.js';
import type { CapacityBaselineStore } from './CapacityBaseline.js';
export declare class MetricsCalculator {
    private readonly window;
    private readonly latency;
    private readonly capacity;
    constructor(opts: {
        windowMs: number;
        latency: LatencyBaselineStore;
        capacity: CapacityBaselineStore;
    });
    /** Ajoute un span terminé à la fenêtre — appelé par TraceBus */
    ingest(span: Span): void;
    /**
     * Calcule les métriques sur la fenêtre courante.
     * Appelé périodiquement (ex: toutes les 5s) ou à la demande.
     */
    compute(windowMs: number): SystemMetrics;
    /**
     * Calcule les métriques enrichies pour un span individuel.
     * Appelé juste avant l'émission 'span:end' pour enrichir le span.
     */
    forSpan(span: Span): SpanMetrics;
    get windowSize(): number;
    private emptyMetrics;
}
//# sourceMappingURL=MetricsCalculator.d.ts.map
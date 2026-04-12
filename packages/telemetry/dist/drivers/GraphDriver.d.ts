/**
 * GraphDriver.ts — Driver in-memory pour la session courante
 *
 * Stocke les spans en mémoire (LRU simplifié par count).
 * Implémente TelemetryDriver — pas de persistence entre redémarrages.
 *
 * Rôle dans l'architecture :
 *   - Session courante : diagnostics live, replay immédiat
 *   - Alimenté par TraceBus (span:end)
 *   - Requêtable par le CLI Rust / dashboard
 *   - DuckDBDriver prend le relais pour la persistence longue durée
 *
 * Capacité par défaut : 10 000 spans (mémoire négligeable < 50 MB)
 */
import type { Span, SystemMetrics, TelemetryDriver } from '../types.js';
export interface GraphDriverOptions {
    maxSpans?: number;
}
export declare class GraphDriver implements TelemetryDriver {
    private readonly spans;
    private readonly maxSpans;
    constructor(opts?: GraphDriverOptions);
    write(span: Span): Promise<void>;
    readRecent(limit: number): Promise<Span[]>;
    readErrors(limit: number): Promise<Span[]>;
    readByTrail(trail: string, limit: number): Promise<Span[]>;
    aggregate(windowMs: number): Promise<SystemMetrics>;
    /** Tous les trails distincts observés dans la session */
    trails(): string[];
    /** Tous les spans d'une route "from→to" */
    byRoute(from: string, to: string, limit?: number): Span[];
    /**
     * Latences observées pour une route (pour comparaison avec la baseline).
     * Retourne les N dernières valeurs de totalMs.
     */
    latencySamples(route: string, limit?: number): number[];
    /** Spans avec yoyo détecté */
    yoyoSpans(limit?: number): Span[];
    /** Résumé de la session courante */
    summary(): SessionSummary;
    get size(): number;
    flush(): void;
}
export interface SessionSummary {
    total: number;
    errors: number;
    yoyos: number;
    trails: number;
    routes: number;
    avgLatencyMs: number;
}
//# sourceMappingURL=GraphDriver.d.ts.map
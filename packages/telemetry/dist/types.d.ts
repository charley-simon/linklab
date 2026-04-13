/**
 * types.ts — Types partagés de @linklab/telemetry
 *
 * Trois familles de types :
 *   Span     — unité atomique d'observation (une exécution)
 *   Metrics  — métriques sémantiques calculées (Tension, Pression, Confort)
 *   Baseline — valeurs de référence pour le calcul des métriques
 */
/** Niveaux de cache — L1 = RAM, L2 = Disque */
export type CacheLevel = 'L1' | 'L2' | 'MISS';
/** Résultat d'un accès cache */
export interface CacheEvent {
    level: CacheLevel;
    hit: boolean;
    entity?: string;
    promoted: boolean;
    yoyo?: boolean;
}
/** Timing détaillé par étape d'exécution */
export interface StepTiming {
    step: 'PathFinder' | 'Resolver' | 'Scheduler' | 'QueryEngine' | 'Provider' | 'Cache' | 'Total';
    startedAt: number;
    durationMs: number;
}
/**
 * Span — contexte complet d'une exécution LinkLab.
 *
 * Auto-suffisant pour le rejeu :
 *   spanId + trail + filters → tout ce qu'il faut pour réexécuter.
 */
export interface Span {
    spanId: string;
    traceId: string;
    timestamp: number;
    trail: string;
    from: string;
    to: string;
    path: string[];
    filters: Record<string, any>;
    timings: StepTiming[];
    totalMs: number;
    cacheEvents: CacheEvent[];
    rowCount: number;
    error?: SpanError;
    metrics?: SpanMetrics;
    dataset?: string;
}
/** Erreur capturée dans un span */
export interface SpanError {
    message: string;
    stack?: string;
    type: string;
    engineState: EngineState;
}
/** Snapshot minimal de l'état du moteur au moment d'une erreur */
export interface EngineState {
    compiledGraphHash: string;
    weights: Record<string, number>;
    cacheState: {
        l1HitRate: number;
        l2HitRate: number;
        globalHitRate: number;
        yoyoEvents: number;
    };
}
/**
 * Métriques sémantiques enrichissant un span.
 *
 * Tension  = latence_réelle / latence_attendue
 *            > 1 → le système souffre
 *
 * Pression = (upgrades_en_attente + cache_misses) / capacité
 *            proche de 1 → risque de saturation
 *
 * Confort  = cache_hit_rate × (1 - tension) × (1 - pression)
 *            métrique composite — celui qu'on regarde en premier
 */
export interface SpanMetrics {
    tension: number;
    pression: number;
    confort: number;
}
/**
 * Métriques globales du système sur une fenêtre glissante.
 * Calculées par MetricsCalculator, exposées via le bus.
 */
export interface SystemMetrics {
    window: number;
    timestamp: number;
    tension: number;
    pression: number;
    confort: number;
    throughput: number;
    errorRate: number;
    cacheHitRate: number;
    yoyoRate: number;
    pathStability: number;
    totalSpans: number;
    errorSpans: number;
    cacheHits: number;
    cacheMisses: number;
    yoyoEvents: number;
}
/**
 * Baseline de latence pour une route donnée.
 * Calculée par BenchmarkRunner, recalibrée par CalibrationJob.
 */
export interface LatencyBaseline {
    route: string;
    p50Ms: number;
    p90Ms: number;
    p99Ms: number;
    sampleCount: number;
    lastUpdated: number;
}
/**
 * Baseline de capacité du système.
 * Calculée par BenchmarkRunner à partir de tests de charge.
 */
export interface CapacityBaseline {
    nominalRps: number;
    maxRps: number;
    breakingPoint: number;
    lastUpdated: number;
}
export type TelemetryEventType = 'span:start' | 'span:end' | 'span:error' | 'metrics:update' | 'calibration:done' | 'yoyo:detected';
export interface TelemetryEvent {
    type: TelemetryEventType;
    timestamp: number;
    payload: Span | SystemMetrics | LatencyBaseline | CapacityBaseline | SpanError;
}
export interface TelemetryDriver {
    /** Persiste un span terminé */
    write(span: Span): Promise<void>;
    /** Charge les N derniers spans (pour replay, analyse) */
    readRecent(limit: number): Promise<Span[]>;
    /** Charge les spans en erreur */
    readErrors(limit: number): Promise<Span[]>;
    /** Charge les spans correspondant à un trail donné */
    readByTrail(trail: string, limit: number): Promise<Span[]>;
    /** Statistiques agrégées sur une fenêtre temporelle */
    aggregate(windowMs: number): Promise<SystemMetrics>;
}
//# sourceMappingURL=types.d.ts.map
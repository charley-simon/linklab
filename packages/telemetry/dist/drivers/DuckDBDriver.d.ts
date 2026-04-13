/**
 * DuckDBDriver.ts — Driver de persistence analytique
 *
 * @duckdb/node-api 1.5.x — API réelle (DuckDBConnection, DuckDBPreparedStatement)
 * write() utilise conn.run() avec valeurs interpolées — évite le binding typé complexe.
 * Les lectures utilisent DuckDBResultReader (.getRows() n'existe pas — on itère les chunks).
 */
import type { Span, SystemMetrics, TelemetryDriver } from '../types.js';
export interface DuckDBDriverOptions {
    /** ':memory:' pour les tests, chemin fichier pour la prod */
    dbPath?: string;
    /** Nb max de spans avant rotation — défaut: 1_000_000 */
    maxRows?: number;
}
export declare class DuckDBDriver implements TelemetryDriver {
    private readonly dbPath;
    private readonly maxRows;
    private duckdb;
    private instance;
    private conn;
    private _connected;
    constructor(opts?: DuckDBDriverOptions);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    get isConnected(): boolean;
    write(span: Span): Promise<void>;
    readRecent(limit: number): Promise<Span[]>;
    readErrors(limit: number): Promise<Span[]>;
    readByTrail(trail: string, limit: number): Promise<Span[]>;
    aggregate(windowMs: number): Promise<SystemMetrics>;
    latencyPercentiles(windowMs: number): Promise<Array<{
        route: string;
        p50: number;
        p90: number;
        p99: number;
        count: number;
    }>>;
    yoyoRateByRoute(windowMs: number): Promise<Array<{
        route: string;
        yoyoRate: number;
    }>>;
    unstableTrails(windowMs: number, minVariants?: number): Promise<Array<{
        trail: string;
        pathVariants: number;
    }>>;
    rotate(): Promise<number>;
    private initSchema;
    /**
     * Exécute une SELECT et retourne les lignes sous forme any[][].
     * DuckDBResultReader expose getRowObjects() ou on itère chunk par chunk.
     */
    private queryRaw;
    private query;
    /**
     * Convertit un DuckDBResultReader en any[][].
     * L'API expose .getRows() sur DuckDBMaterializedResult (pas sur ResultReader).
     * On utilise .getRowObjects() si disponible, sinon on accède aux chunks.
     */
    private readerToRows;
    private rowToSpan;
    private maybeRotate;
    private cleanup;
    /** Échappe une string pour SQL — NULL si undefined/null */
    private str;
    private warn;
    private emptyMetrics;
}
//# sourceMappingURL=DuckDBDriver.d.ts.map
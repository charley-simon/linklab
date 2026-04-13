/**
 * DuckDBDriver.ts — Driver de persistence analytique
 *
 * @duckdb/node-api 1.5.x — API réelle (DuckDBConnection, DuckDBPreparedStatement)
 * write() utilise conn.run() avec valeurs interpolées — évite le binding typé complexe.
 * Les lectures utilisent DuckDBResultReader (.getRows() n'existe pas — on itère les chunks).
 */
export class DuckDBDriver {
    dbPath;
    maxRows;
    duckdb = null; // module @duckdb/node-api
    instance = null; // DuckDBInstance
    conn = null; // DuckDBConnection
    _connected = false;
    constructor(opts = {}) {
        this.dbPath = opts.dbPath ?? './data/telemetry.duckdb';
        this.maxRows = opts.maxRows ?? 1_000_000;
    }
    // ── Lifecycle ─────────────────────────────────────────────────────────────
    async connect() {
        if (this._connected)
            return;
        try {
            this.duckdb = await import('@duckdb/node-api');
        }
        catch {
            this.warn('connect() — @duckdb/node-api introuvable.');
            return;
        }
        try {
            this.instance = await this.duckdb.DuckDBInstance.create(this.dbPath);
            this.conn = await this.instance.connect();
            await this.initSchema();
            this._connected = true;
        }
        catch (err) {
            this.warn(`connect() échoué : ${err}`);
            await this.cleanup();
        }
    }
    async disconnect() {
        await this.cleanup();
    }
    get isConnected() {
        return this._connected;
    }
    // ── TelemetryDriver interface ─────────────────────────────────────────────
    async write(span) {
        if (!this._connected || !this.conn)
            return;
        const ce = span.cacheEvents ?? [];
        const cacheHits = ce.filter(e => e.hit).length;
        const cacheMisses = ce.filter(e => !e.hit).length;
        const yoyoEvents = ce.filter(e => e.yoyo).length;
        const m = span.metrics;
        // Interpolation directe — toutes les valeurs sont des primitives contrôlées
        const sql = `
      INSERT OR REPLACE INTO spans
        (span_id, trace_id, timestamp, trail, from_node, to_node, path,
         filters, total_ms, row_count, cache_hits, cache_misses,
         yoyo_events, has_error, error_type, metrics_json)
      VALUES (
        ${this.str(span.spanId)},
        ${this.str(span.traceId)},
        ${span.timestamp},
        ${this.str(span.trail)},
        ${this.str(span.from)},
        ${this.str(span.to)},
        ${this.str(span.path ? JSON.stringify(span.path) : null)},
        ${this.str(span.filters ? JSON.stringify(span.filters) : null)},
        ${span.totalMs ?? 0},
        ${span.rowCount ?? 0},
        ${cacheHits},
        ${cacheMisses},
        ${yoyoEvents},
        ${span.error ? 'true' : 'false'},
        ${this.str(span.error?.type)},
        ${this.str(m ? JSON.stringify(m) : null)}
      )
    `;
        try {
            await this.conn.run(sql);
        }
        catch (err) {
            this.warn(`write() échoué pour span ${span.spanId} : ${err}`);
        }
        this.maybeRotate().catch(() => { });
    }
    async readRecent(limit) {
        return this.query(`SELECT * FROM spans ORDER BY timestamp DESC LIMIT ${limit}`);
    }
    async readErrors(limit) {
        return this.query(`SELECT * FROM spans WHERE has_error = true ORDER BY timestamp DESC LIMIT ${limit}`);
    }
    async readByTrail(trail, limit) {
        return this.query(`SELECT * FROM spans WHERE trail = ${this.str(trail)} ORDER BY timestamp DESC LIMIT ${limit}`);
    }
    async aggregate(windowMs) {
        if (!this._connected || !this.conn)
            return this.emptyMetrics(windowMs);
        const since = Date.now() - windowMs;
        const rows = await this.queryRaw(`
      SELECT
        COUNT(*)                                                AS total_spans,
        SUM(CASE WHEN has_error THEN 1 ELSE 0 END)             AS error_spans,
        SUM(cache_hits)                                         AS cache_hits,
        SUM(cache_misses)                                       AS cache_misses,
        SUM(yoyo_events)                                        AS yoyo_events,
        AVG(total_ms)                                           AS avg_ms,
        PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY total_ms) AS p90_ms
      FROM spans
      WHERE timestamp > ${since}
    `);
        if (!rows.length)
            return this.emptyMetrics(windowMs);
        const [total, errors, hits, misses, yoyo, , p90] = rows[0];
        const totalSpans = Number(total) || 0;
        if (totalSpans === 0)
            return this.emptyMetrics(windowMs);
        const errorSpans = Number(errors) || 0;
        const cacheHits = Number(hits) || 0;
        const cacheMisses = Number(misses) || 0;
        const yoyoEvents = Number(yoyo) || 0;
        const p90ms = Number(p90) || 0;
        const errorRate = totalSpans > 0 ? errorSpans / totalSpans : 0;
        const cacheTotal = cacheHits + cacheMisses;
        const cacheHitRate = cacheTotal > 0 ? cacheHits / cacheTotal : 0;
        const tension = Math.min(p90ms / 100, 5);
        const pression = Math.min((cacheMisses + yoyoEvents) / (Math.max(totalSpans, 1) * 2), 1);
        const tensionNorm = Math.min(tension / 2, 1);
        const confort = cacheHitRate * (1 - tensionNorm) * (1 - pression);
        return {
            window: windowMs,
            timestamp: Date.now(),
            tension,
            pression,
            confort,
            throughput: totalSpans / (windowMs / 1000),
            errorRate,
            cacheHitRate,
            yoyoRate: totalSpans > 0 ? yoyoEvents / totalSpans : 0,
            pathStability: 1 - errorRate,
            totalSpans,
            errorSpans,
            cacheHits,
            cacheMisses,
            yoyoEvents
        };
    }
    async latencyPercentiles(windowMs) {
        if (!this._connected)
            return [];
        const since = Date.now() - windowMs;
        const rows = await this.queryRaw(`
      SELECT
        from_node || '→' || to_node                                    AS route,
        PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY total_ms)         AS p50,
        PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY total_ms)         AS p90,
        PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY total_ms)         AS p99,
        COUNT(*)                                                        AS cnt
      FROM spans
      WHERE timestamp > ${since}
        AND from_node IS NOT NULL
        AND to_node   IS NOT NULL
      GROUP BY route
      ORDER BY p90 DESC
    `);
        return rows.map((row) => ({
            route: String(row[0]),
            p50: Number(row[1]) || 0,
            p90: Number(row[2]) || 0,
            p99: Number(row[3]) || 0,
            count: Number(row[4]) || 0
        }));
    }
    async yoyoRateByRoute(windowMs) {
        if (!this._connected)
            return [];
        const since = Date.now() - windowMs;
        const rows = await this.queryRaw(`
      SELECT
        from_node || '→' || to_node         AS route,
        SUM(yoyo_events) * 1.0 / COUNT(*)   AS yoyo_rate
      FROM spans
      WHERE timestamp > ${since}
        AND from_node IS NOT NULL
      GROUP BY route
      ORDER BY yoyo_rate DESC
    `);
        return rows.map((row) => ({
            route: String(row[0]),
            yoyoRate: Number(row[1]) || 0
        }));
    }
    async unstableTrails(windowMs, minVariants = 2) {
        if (!this._connected)
            return [];
        const since = Date.now() - windowMs;
        const rows = await this.queryRaw(`
      SELECT trail, COUNT(DISTINCT path) AS path_variants
      FROM spans
      WHERE timestamp > ${since}
        AND trail IS NOT NULL
        AND path  IS NOT NULL
      GROUP BY trail
      HAVING path_variants >= ${minVariants}
      ORDER BY path_variants DESC
    `);
        return rows.map((row) => ({
            trail: String(row[0]),
            pathVariants: Number(row[1]) || 0
        }));
    }
    async rotate() {
        if (!this._connected || !this.conn)
            return 0;
        try {
            const rows = await this.queryRaw(`SELECT COUNT(*) FROM spans`);
            const count = Number(rows[0]?.[0]) || 0;
            if (count <= this.maxRows)
                return 0;
            const toDelete = count - Math.floor(this.maxRows * 0.9);
            await this.conn.run(`
        DELETE FROM spans
        WHERE span_id IN (
          SELECT span_id FROM spans
          ORDER BY timestamp ASC
          LIMIT ${toDelete}
        )
      `);
            return toDelete;
        }
        catch (err) {
            this.warn(`rotate() échoué : ${err}`);
            return 0;
        }
    }
    // ── Privé ─────────────────────────────────────────────────────────────────
    async initSchema() {
        await this.conn.run(`
      CREATE TABLE IF NOT EXISTS spans (
        span_id      VARCHAR PRIMARY KEY,
        trace_id     VARCHAR,
        timestamp    BIGINT,
        trail        VARCHAR,
        from_node    VARCHAR,
        to_node      VARCHAR,
        path         VARCHAR,
        filters      VARCHAR,
        total_ms     DOUBLE,
        row_count    INTEGER,
        cache_hits   INTEGER,
        cache_misses INTEGER,
        yoyo_events  INTEGER,
        has_error    BOOLEAN,
        error_type   VARCHAR,
        metrics_json VARCHAR
      )
    `);
        await this.conn.run(`CREATE INDEX IF NOT EXISTS idx_spans_timestamp ON spans (timestamp)`);
        await this.conn.run(`CREATE INDEX IF NOT EXISTS idx_spans_route     ON spans (from_node, to_node)`);
        await this.conn.run(`CREATE INDEX IF NOT EXISTS idx_spans_trail     ON spans (trail)`);
    }
    /**
     * Exécute une SELECT et retourne les lignes sous forme any[][].
     * DuckDBResultReader expose getRowObjects() ou on itère chunk par chunk.
     */
    async queryRaw(sql) {
        if (!this._connected || !this.conn)
            return [];
        try {
            const reader = await this.conn.runAndReadAll(sql);
            return this.readerToRows(reader);
        }
        catch (err) {
            this.warn(`queryRaw() échoué : ${err}`);
            return [];
        }
    }
    async query(sql) {
        const rows = await this.queryRaw(sql);
        return rows.map(row => this.rowToSpan(row));
    }
    /**
     * Convertit un DuckDBResultReader en any[][].
     * L'API expose .getRows() sur DuckDBMaterializedResult (pas sur ResultReader).
     * On utilise .getRowObjects() si disponible, sinon on accède aux chunks.
     */
    readerToRows(reader) {
        // DuckDBResultReader — méthodes disponibles selon la version
        if (typeof reader.getRows === 'function') {
            return reader.getRows();
        }
        // DuckDBResultReader v1.5.x : accès via columnCount + rowCount + value(col, row)
        if (typeof reader.rowCount !== 'undefined' && typeof reader.value === 'function') {
            const rows = [];
            const colCount = reader.columnCount;
            for (let r = 0; r < reader.rowCount; r++) {
                const row = [];
                for (let c = 0; c < colCount; c++) {
                    const v = reader.value(c, r);
                    // DuckDBValue → primitif
                    row.push(v != null && typeof v === 'object' && 'value' in v ? v.value : v);
                }
                rows.push(row);
            }
            return rows;
        }
        // Fallback : getRowObjects → extraire les valeurs dans l'ordre des colonnes
        if (typeof reader.getRowObjects === 'function') {
            const objs = reader.getRowObjects();
            if (!objs.length)
                return [];
            const keys = Object.keys(objs[0]);
            return objs.map(obj => keys.map(k => {
                const v = obj[k];
                return v != null && typeof v === 'object' && 'value' in v ? v.value : v;
            }));
        }
        this.warn('readerToRows() — format DuckDBResultReader inconnu');
        return [];
    }
    rowToSpan(row) {
        const [spanId, traceId, timestamp, trail, from_, to_, pathJson, filtersJson, totalMs, rowCount, // cache_hits, cache_misses, yoyo_events
        , , , hasError, errorType, metricsJson] = row;
        return {
            spanId: String(spanId),
            traceId: traceId ? String(traceId) : '',
            timestamp: Number(timestamp),
            trail: trail ? String(trail) : '',
            from: from_ ? String(from_) : '',
            to: to_ ? String(to_) : '',
            path: pathJson ? JSON.parse(String(pathJson)) : [],
            filters: filtersJson ? JSON.parse(String(filtersJson)) : {},
            totalMs: Number(totalMs) || 0,
            rowCount: Number(rowCount) || 0,
            timings: [],
            cacheEvents: [],
            error: hasError && errorType
                ? { type: String(errorType), message: String(errorType), engineState: {} }
                : undefined,
            metrics: metricsJson ? JSON.parse(String(metricsJson)) : undefined
        };
    }
    async maybeRotate() {
        if (!this._connected || !this.conn)
            return;
        const rows = await this.queryRaw(`SELECT COUNT(*) FROM spans`).catch(() => []);
        const count = Number(rows[0]?.[0]) || 0;
        if (count > this.maxRows)
            await this.rotate();
    }
    async cleanup() {
        try {
            await this.conn?.close();
        }
        catch { }
        try {
            await this.instance?.close();
        }
        catch { }
        this.conn = null;
        this.instance = null;
        this._connected = false;
    }
    /** Échappe une string pour SQL — NULL si undefined/null */
    str(v) {
        if (v == null)
            return 'NULL';
        return `'${String(v).replace(/'/g, "''")}'`;
    }
    warn(msg) {
        console.warn(`[DuckDBDriver] ${msg}`);
    }
    emptyMetrics(windowMs) {
        return {
            window: windowMs,
            timestamp: Date.now(),
            tension: 1,
            pression: 0,
            confort: 0,
            throughput: 0,
            errorRate: 0,
            cacheHitRate: 0,
            yoyoRate: 0,
            pathStability: 1,
            totalSpans: 0,
            errorSpans: 0,
            cacheHits: 0,
            cacheMisses: 0,
            yoyoEvents: 0
        };
    }
}
//# sourceMappingURL=DuckDBDriver.js.map
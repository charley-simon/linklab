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
export class GraphDriver {
    spans = [];
    maxSpans;
    constructor(opts = {}) {
        this.maxSpans = opts.maxSpans ?? 10_000;
    }
    // ── TelemetryDriver ───────────────────────────────────────────────────────
    async write(span) {
        this.spans.push(span);
        // LRU minimal : si on dépasse la capacité, on retire les plus anciens
        if (this.spans.length > this.maxSpans) {
            this.spans.splice(0, this.spans.length - this.maxSpans);
        }
    }
    async readRecent(limit) {
        return this.spans.slice(-limit).reverse();
    }
    async readErrors(limit) {
        return this.spans
            .filter(s => s.error != null)
            .slice(-limit)
            .reverse();
    }
    async readByTrail(trail, limit) {
        return this.spans
            .filter(s => s.trail === trail)
            .slice(-limit)
            .reverse();
    }
    async aggregate(windowMs) {
        const cutoff = Date.now() - windowMs;
        const window = this.spans.filter(s => s.timestamp >= cutoff);
        return aggregateSpans(window, windowMs);
    }
    // ── Requêtes supplémentaires ──────────────────────────────────────────────
    /** Tous les trails distincts observés dans la session */
    trails() {
        return [...new Set(this.spans.map(s => s.trail))];
    }
    /** Tous les spans d'une route "from→to" */
    byRoute(from, to, limit = 100) {
        return this.spans
            .filter(s => s.from === from && s.to === to)
            .slice(-limit)
            .reverse();
    }
    /**
     * Latences observées pour une route (pour comparaison avec la baseline).
     * Retourne les N dernières valeurs de totalMs.
     */
    latencySamples(route, limit = 100) {
        const [from, to] = route.split('→');
        if (!from || !to)
            return [];
        return this.spans
            .filter(s => s.from === from && s.to === to)
            .slice(-limit)
            .map(s => s.totalMs);
    }
    /** Spans avec yoyo détecté */
    yoyoSpans(limit = 50) {
        return this.spans
            .filter(s => s.cacheEvents.some(e => e.yoyo))
            .slice(-limit)
            .reverse();
    }
    /** Résumé de la session courante */
    summary() {
        const total = this.spans.length;
        const errors = this.spans.filter(s => s.error).length;
        const yoyos = this.spans.filter(s => s.cacheEvents.some(e => e.yoyo)).length;
        const trails = new Set(this.spans.map(s => s.trail)).size;
        const routes = new Set(this.spans.map(s => `${s.from}→${s.to}`)).size;
        const avg = total > 0
            ? this.spans.reduce((acc, s) => acc + s.totalMs, 0) / total
            : 0;
        return { total, errors, yoyos, trails, routes, avgLatencyMs: Math.round(avg) };
    }
    // ── Utilitaires ───────────────────────────────────────────────────────────
    get size() { return this.spans.length; }
    flush() {
        this.spans.splice(0);
    }
}
// ── Agrégation locale (sans DuckDB) ──────────────────────────────────────────
function aggregateSpans(spans, windowMs) {
    const total = spans.length;
    const now = Date.now();
    if (total === 0) {
        return {
            window: windowMs, timestamp: now,
            tension: 1, pression: 0, confort: 0,
            throughput: 0, errorRate: 0, cacheHitRate: 0,
            yoyoRate: 0, pathStability: 1,
            totalSpans: 0, errorSpans: 0,
            cacheHits: 0, cacheMisses: 0, yoyoEvents: 0,
        };
    }
    const errorSpans = spans.filter(s => s.error).length;
    const windowSec = windowMs / 1_000;
    const throughput = total / windowSec;
    let cacheHits = 0, cacheMisses = 0, yoyoEvents = 0;
    for (const s of spans) {
        for (const e of s.cacheEvents) {
            if (e.hit)
                cacheHits++;
            else
                cacheMisses++;
            if (e.yoyo)
                yoyoEvents++;
        }
    }
    const totalCache = cacheHits + cacheMisses;
    const cacheHitRate = totalCache > 0 ? cacheHits / totalCache : 0;
    const yoyoRate = total > 0 ? yoyoEvents / total : 0;
    // Tension approximée : latence médiane / latence minimale observée
    const latencies = spans.map(s => s.totalMs).sort((a, b) => a - b);
    const median = latencies[Math.floor(latencies.length / 2)] ?? 0;
    const min = latencies[0] ?? 1;
    const tension = min > 0 ? Math.min(median / min, 5) : 1;
    const pression = Math.min((cacheMisses + yoyoEvents) / Math.max(total, 1), 1);
    const confort = cacheHitRate * (1 - Math.min(tension / 2, 1)) * (1 - pression);
    // Path stability
    const byTrail = new Map();
    for (const s of spans) {
        if (!byTrail.has(s.trail))
            byTrail.set(s.trail, new Set());
        byTrail.get(s.trail).add(s.path.join('→'));
    }
    let stable = 0;
    for (const paths of byTrail.values())
        if (paths.size === 1)
            stable++;
    const pathStability = byTrail.size > 0 ? stable / byTrail.size : 1;
    return {
        window: windowMs, timestamp: now,
        tension, pression, confort,
        throughput, errorRate: total > 0 ? errorSpans / total : 0,
        cacheHitRate, yoyoRate, pathStability,
        totalSpans: total, errorSpans, cacheHits, cacheMisses, yoyoEvents,
    };
}
//# sourceMappingURL=GraphDriver.js.map
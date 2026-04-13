/**
 * QueryEngine — patch generateSQL pour les routes sémantiques
 *
 * Ajouter ce patch dans generateSQL() de QueryEngine.ts,
 * dans la boucle qui construit les JOIN :
 *
 *   for (let i = 0; i < edges.length; i++) {
 *     const curr = path[i]
 *     const next = path[i + 1]
 *     const edge = edges[i]
 *
 *     const fromCol = edge.fromCol === 'id' ? pkOf(curr) : edge.fromCol
 *     const toCol   = edge.toCol   === 'id' ? pkOf(next) : edge.toCol
 *
 *     // ── PATCH : condition semantic_view ────────────────────────────────
 *     const conditionSQL = edge.condition
 *       ? ' AND ' + Object.entries(edge.condition)
 *           .map(([k, v]) => `${next}.${k} = ${typeof v === 'string' ? `'${v}'` : v}`)
 *           .join(' AND ')
 *       : ''
 *     // ──────────────────────────────────────────────────────────────────
 *
 *     sql += `\n  INNER JOIN ${next} ON ${curr}.${fromCol} = ${next}.${toCol}${conditionSQL}`
 *   }
 *
 * Résultat pour movies→people[actor] (jobId:1) :
 *
 *   SELECT DISTINCT people.*
 *   FROM movies
 *     INNER JOIN credits ON movies.id = credits.movieId
 *     INNER JOIN people  ON credits.personId = people.id AND people.jobId = 1
 *
 * Note : la condition est sur la table de jonction (credits), pas sur people.
 * Le patch ci-dessus est une approximation — la condition correcte est :
 *
 *     INNER JOIN credits ON movies.id = credits.movieId AND credits.jobId = 1
 *     INNER JOIN people  ON credits.personId = people.id
 *
 * Voir generateSQLSemantic() ci-dessous pour la version correcte.
 */
import { shim } from '../instrumentation/TelemetryShim.js';
export class QueryEngine {
    compiledGraph;
    // public pour que DataLoader puisse accéder aux nodes (résolution PK)
    constructor(compiledGraph) {
        this.compiledGraph = compiledGraph;
    }
    getRoute(from, to, semantic) {
        // Si semantic fourni → chercher la route sémantique correspondante
        if (semantic) {
            const semRoute = this.compiledGraph.routes.find(r => r.from === from && r.to === to && r.semantic && r.label === semantic);
            if (semRoute)
                return semRoute;
        }
        // Route physique par défaut (première trouvée)
        const route = this.compiledGraph.routes.find(r => r.from === from && r.to === to);
        if (!route)
            throw new Error(`LinkLab: No route found between ${from} and ${to}`);
        return route;
    }
    generateSQL(options) {
        const { from, to, filters = {}, semantic } = options;
        const route = this.getRoute(from, to, semantic);
        const { path, edges } = route.primary;
        const pkOf = (tableId) => {
            const node = this.compiledGraph.nodes.find((n) => n.id === tableId);
            const pk = node?.primaryKey;
            return Array.isArray(pk) ? pk[0] : (pk ?? tableId + '_id');
        };
        let sql = `SELECT DISTINCT ${to}.*\nFROM ${from}`;
        for (let i = 0; i < edges.length; i++) {
            const curr = path[i];
            const next = path[i + 1];
            const edge = edges[i];
            const fromCol = edge.fromCol === 'id' ? pkOf(curr) : edge.fromCol;
            const toCol = edge.toCol === 'id' ? pkOf(next) : edge.toCol;
            // Condition semantic_view — appliquée sur la table de jonction (curr)
            // ex: credits.jobId = 1  (pas sur people)
            const conditionSQL = edge.condition
                ? ' AND ' + Object.entries(edge.condition)
                    .map(([k, v]) => `${curr}.${k} = ${typeof v === 'string' ? `'${v}'` : v}`)
                    .join(' AND ')
                : '';
            sql += `\n  INNER JOIN ${next} ON ${curr}.${fromCol} = ${next}.${toCol}${conditionSQL}`;
        }
        const sourcePK = pkOf(from);
        const whereClauses = Object.entries(filters).map(([key, val]) => {
            const col = key === 'id' ? sourcePK : key;
            const v = val === null ? null : (typeof val === 'string' ? `'${val}'` : val);
            return v === null ? `${from}.${col} IS NULL` : `${from}.${col} = ${v}`;
        });
        if (whereClauses.length > 0)
            sql += `\nWHERE ${whereClauses.join(' AND ')}`;
        return sql;
    }
    executeInMemory(options, dataset) {
        const { from, to, filters = {}, trail, traceId, semantic } = options;
        const spanBuilder = shim.startSpan({ trail: trail ?? `${from}.${to}`, from, to, filters, traceId });
        spanBuilder?.stepStart('QueryEngine');
        try {
            const result = this._executeInMemoryCore(from, to, filters, dataset, semantic);
            spanBuilder?.stepEnd('QueryEngine');
            if (spanBuilder) {
                try {
                    const route = this.getRoute(from, to, semantic);
                    spanBuilder.withPath?.(route.primary.path);
                }
                catch { }
                const span = spanBuilder.end({ rowCount: result.length });
                shim.emitEnd(span);
            }
            return result;
        }
        catch (err) {
            spanBuilder?.stepEnd('QueryEngine');
            if (spanBuilder) {
                const span = spanBuilder.endWithError(err, {
                    compiledGraphHash: this.compiledGraph.version ?? 'unknown',
                    weights: {}, cacheState: { l1HitRate: 0, l2HitRate: 0, globalHitRate: 0, yoyoEvents: 0 },
                });
                shim.emitError(span);
            }
            throw err;
        }
    }
    _executeInMemoryCore(from, to, filters, dataset, semantic) {
        const route = this.getRoute(from, to, semantic);
        const { path, edges } = route.primary;
        // Appliquer les filtres sur la table source
        const sourceRows = dataset[from] ?? [];
        const filtered = Object.entries(filters).reduce((rows, [key, val]) => {
            return rows.filter((r) => r[key] === val);
        }, sourceRows);
        // Jointures successives
        let current = filtered;
        for (let i = 0; i < edges.length; i++) {
            const currTable = path[i];
            const nextTable = path[i + 1];
            const edge = edges[i];
            const nextRows = dataset[nextTable] ?? [];
            const fromCol = edge.fromCol === 'id' ? 'id' : edge.fromCol;
            const toCol = edge.toCol === 'id' ? 'id' : edge.toCol;
            // Condition semantic_view (ex: { jobId: 1 })
            const condition = edge.condition ?? {};
            current = current.flatMap(row => {
                const val = row[fromCol];
                return nextRows.filter((next) => {
                    if (next[toCol] !== val)
                        return false;
                    // Condition semantic_view appliquée sur 'next' (table de jonction)
                    // ex: credits.jobId = 1 — credits est la table 'next' à ce step
                    for (const [k, v] of Object.entries(condition)) {
                        if (next[k] !== v)
                            return false;
                    }
                    return true;
                });
            });
            // Dédoublonnage sur id
            const seen = new Set();
            current = current.filter(r => {
                if (seen.has(r.id))
                    return false;
                seen.add(r.id);
                return true;
            });
        }
        return current;
    }
    generateJSONPipeline(options) {
        const { from, to, filters = {}, semantic } = options;
        const route = this.getRoute(from, to, semantic);
        const { path, edges } = route.primary;
        return {
            metadata: { from, to, steps: path.length, semantic: semantic ?? null },
            executionPlan: path.map((table, index) => {
                const isSource = index === 0;
                return {
                    step: index + 1,
                    action: isSource ? 'FETCH_AND_FILTER' : 'JOIN',
                    table,
                    config: isSource ? { filters } : { joinWith: path[index - 1], on: edges[index - 1] },
                };
            }),
        };
    }
}
//# sourceMappingURL=QueryEngine.js.map
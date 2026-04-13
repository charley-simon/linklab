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
import type { CompiledGraph, RouteInfo } from '../types/index.js';
export interface QueryOptions {
    from: string;
    to: string;
    filters?: Record<string, any>;
    trail?: string;
    traceId?: string;
    semantic?: string;
}
export declare class QueryEngine {
    compiledGraph: CompiledGraph;
    constructor(compiledGraph: CompiledGraph);
    getRoute(from: string, to: string, semantic?: string): RouteInfo;
    generateSQL(options: QueryOptions): string;
    executeInMemory(options: QueryOptions, dataset: Record<string, any[]>): any[];
    private _executeInMemoryCore;
    generateJSONPipeline(options: QueryOptions): {
        metadata: {
            from: string;
            to: string;
            steps: number;
            semantic: string | null;
        };
        executionPlan: {
            step: number;
            action: string;
            table: string;
            config: {
                filters: Record<string, any>;
                joinWith?: undefined;
                on?: undefined;
            } | {
                joinWith: string;
                on: import("../types/index.js").RouteStep;
                filters?: undefined;
            };
        }[];
    };
}
//# sourceMappingURL=QueryEngine.d.ts.map
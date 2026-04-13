/**
 * GraphCompiler — v2.0.0
 *
 * Changements vs v1 :
 *   - Routes sémantiques (semantic_view) compilées et incluses
 *   - compiled-graph contient physical + semantic routes
 *   - version bump : '2.0.0'
 *
 * v2.1 :
 *   - Support expose config (ADR-0010)
 *   - node.exposed compilé depuis CompilerConfig.expose
 */
import type { Graph, CompiledGraph, CompilerConfig, MetricsMap } from '../types/index.js';
export interface EdgeMetadata {
    fromCol: string;
    toCol: string;
    condition?: Record<string, unknown>;
    label?: string;
}
export declare class GraphCompiler {
    private config;
    constructor(config?: Partial<CompilerConfig>);
    compile(graph: Graph, metrics: MetricsMap): CompiledGraph;
    private compileNodes;
    private compileSemanticRoute;
    private getAllPairs;
    private compilePath;
    private resolveEdges;
    static getStats(compiled: CompiledGraph): {
        totalRoutes: number;
        fallbackRatio: string;
        semantic: number;
        physical: number;
        composed: number;
    };
}
//# sourceMappingURL=GraphCompiler.d.ts.map
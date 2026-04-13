import type { AnalyzedSchema, Dictionary } from '../types/index.js';
export declare class GraphBuilder {
    /**
     * Construit le dictionnaire final à partir du schéma analysé
     */
    build(analyzed: AnalyzedSchema, dataPath: string): Dictionary;
    private injectVirtualViews;
}
//# sourceMappingURL=GraphBuilder.d.ts.map
/**
 * GraphAssembler — Dictionary → Graph V3
 *
 * Transforme le Dictionary produit par GraphBuilder
 * en Graph V3 (nodes + edges) prêt pour PathFinder.
 *
 * Corrige le bug d'itération : dictionary.tables est une Table[]
 * (liste), pas un Record<string, Table> (dictionnaire).
 */
import type { Dictionary, Graph } from '../types/index.js';
export declare class GraphAssembler {
    assemble(dictionary: Dictionary): Graph;
}
//# sourceMappingURL=GraphAssembler.d.ts.map
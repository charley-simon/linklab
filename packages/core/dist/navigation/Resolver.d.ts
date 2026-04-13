/**
 * Resolver - Résolution sémantique de frames (mode NAVIGATE)
 *
 * Parcourt la stack, trouve la première frame UNRESOLVED,
 * identifie la meilleure arête dans le graphe V3 (nodes/edges)
 * et résout la frame avec les filtres appropriés.
 */
import type { Frame, Graph } from '../types/index.js';
export declare class Resolver {
    private graph;
    constructor(graph: Graph);
    /**
     * Résout la prochaine frame UNRESOLVED dans la stack.
     * Retourne une nouvelle stack avec la frame résolue (ou DEFERRED si impossible).
     */
    resolve(stack: Frame[]): Promise<Frame[]>;
    /**
     * Trouve l'arête la plus pertinente pour résoudre une frame.
     *
     * Logique : on cherche parmi les frames RESOLVED (en remontant la stack),
     * une arête qui va de cette entité source vers l'entité cible.
     */
    private selectBestEdge;
    /**
     * Vérifie si l'intention de la frame est compatible avec
     * les conditions sémantiques portées par l'arête.
     */
    private intentMatchesCondition;
    /**
     * Extrait les filtres implicites portés par les métadonnées d'une arête.
     * Ex: une arête sémantique { condition: { jobId: 2 } } devient un filtre.
     */
    private extractEdgeFilters;
}
//# sourceMappingURL=Resolver.d.ts.map
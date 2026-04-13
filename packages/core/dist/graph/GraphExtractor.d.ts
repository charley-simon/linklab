import type { Graph, Provider, ActionRegistry } from '../types/index.js';
export declare class GraphExtractor {
    private provider;
    private actionRegistry?;
    constructor(provider: Provider, actionRegistry?: ActionRegistry);
    /**
     * Extrait le graphe complet : Tables + Actions + Relations
     */
    extract(): Promise<Graph>;
    private getTables;
    private getColumns;
    private getRowCount;
    private getForeignKeys;
    /**
     * Calcul du poids initial (Physique de la donnée)
     * On utilise le logarithme de la taille pour ne pas pénaliser trop lourdement
     * les grosses tables, mais garder une notion de "frais de déplacement".
     */
    private calculateInitialWeight;
}
//# sourceMappingURL=GraphExtractor.d.ts.map
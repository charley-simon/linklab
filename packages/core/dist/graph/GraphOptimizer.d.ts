/**
 * GraphOptimizer — Analyse et rapport sur la qualité du graphe
 *
 * PRINCIPE : signaler, jamais détruire silencieusement.
 *
 * Chaque étape produit un rapport (warnings, suggestions).
 * Le dev décide ensuite de ce qu'il fait.
 *
 * Seules deux opérations sont automatiques et non destructives :
 *   - Suppression des nœuds orphelins (aucune arête — objectivement inutiles)
 *   - Suppression des nœuds dead-end stricts (aucune arête entrante ET sortante)
 *
 * Les cycles sont DÉTECTÉS et CLASSIFIÉS, jamais supprimés :
 *   - SELF_LOOP         : arête A → A (ex: Station-chatelet → Station-chatelet TRANSFER)
 *   - BIDIRECTIONAL     : A → B et B → A (ex: CREATED + CREDITED — intentionnel)
 *   - STRUCTURAL_CYCLE  : A → B → C → A (même type de relation — potentiellement problématique)
 */
import type { Graph } from '../types/index.js';
export type CycleType = 'SELF_LOOP' | 'BIDIRECTIONAL' | 'STRUCTURAL_CYCLE';
export type WarningSeverity = 'INFO' | 'WARNING';
export interface CycleWarning {
    type: CycleType;
    severity: WarningSeverity;
    edges: string[];
    nodes: string[];
    note: string;
}
export interface DuplicatePathWarning {
    from: string;
    to: string;
    paths: string[][];
    note: string;
}
export interface GraphOptimizationReport {
    graph: Graph;
    summary: {
        nodes: {
            before: number;
            after: number;
            removed: number;
        };
        edges: {
            before: number;
            after: number;
            removed: number;
        };
    };
    cycles: CycleWarning[];
    duplicatePaths: DuplicatePathWarning[];
    removedOrphans: string[];
    removedDeadEnds: string[];
    isClean: boolean;
}
export interface GraphOptimizerConfig {
    /**
     * Types de relations bidirectionnelles considérés comme intentionnels (INFO, pas WARNING).
     * Ex: ['DIRECT', 'TRANSFER', 'physical_reverse', 'INFLUENCE']
     * Par défaut : ['physical_reverse'] — les inverses FK sont toujours intentionnels.
     */
    intentionalBidirectional?: string[];
    /**
     * Types de self-loops considérés comme intentionnels (INFO, pas WARNING).
     * Ex: ['TRANSFER'] — les correspondances métro sont des self-loops normaux.
     * Par défaut : [] — tout self-loop est signalé.
     */
    intentionalSelfLoops?: string[];
}
export declare class GraphOptimizer {
    private graph;
    private config;
    constructor(graph: Graph, config?: GraphOptimizerConfig);
    /**
     * Pipeline complet — retourne un rapport, ne modifie pas le graphe original.
     * Seuls orphelins et dead-ends stricts sont supprimés (safe).
     */
    optimize(): GraphOptimizationReport;
    /**
     * Détecte et classifie les cycles — ne supprime rien.
     */
    private detectCycles;
    /**
     * Détecte les cycles structurels A → B → ... → A
     * en ne suivant que les arêtes du même type.
     */
    private detectStructuralCycles;
    /**
     * Supprime les nœuds sans aucune arête (entrante ou sortante).
     * Inoffensif — un nœud isolé ne contribue à aucune traversée.
     */
    private removeOrphans;
    /**
     * Supprime les nœuds sans arête entrante ET sans arête sortante
     * après suppression des orphelins.
     * Différent de removeOrphans — cible les nœuds stricts.
     */
    private removeStrictDeadEnds;
    /**
     * Détecte les paires de nœuds avec plusieurs chemins possibles.
     * Informatif — les chemins multiples sont souvent intentionnels (fallbacks).
     */
    private detectDuplicatePaths;
    private printReport;
}
//# sourceMappingURL=GraphOptimizer.d.ts.map
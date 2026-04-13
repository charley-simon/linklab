/**
 * api/types.ts — Types publics de l'API LinkLab niveau 2+
 *
 * Ces types sont la surface visible pour les utilisateurs du moteur.
 * Les types internes (CompiledGraph, RouteInfo, etc.) restent dans types/index.ts.
 */
import type { GraphEdge } from '../types/index.js';
/**
 * Strategy — comment Dijkstra pondère les chemins.
 *
 * Shortest      : poids brut des arêtes — temps pur, distance minimale
 * Comfort       : pénalité par correspondance (+8 unités) — moins de changements
 * LeastHops     : favorise les chemins avec peu d'étapes
 * Custom(n)     : pénalité explicite par correspondance
 */
export type Strategy = {
    type: 'Shortest';
} | {
    type: 'Comfort';
} | {
    type: 'LeastHops';
} | {
    type: 'Custom';
    transferPenalty: number;
};
export declare const Strategy: {
    readonly Shortest: () => Strategy;
    readonly Comfort: () => Strategy;
    readonly LeastHops: () => Strategy;
    readonly Custom: (transferPenalty: number) => Strategy;
    readonly toPenalty: (s: Strategy) => number;
};
export interface PathStep {
    node: string;
    label?: string;
    via?: GraphEdge;
}
export interface ResolvedPath {
    nodes: string[];
    steps: PathStep[];
    weight: number;
    hops: number;
}
export interface PathResult {
    from: string;
    to: string;
    found: boolean;
    paths: ResolvedPath[];
}
/**
 * QueryResult — retourné par PathBuilder.execute()
 * Uniquement en mode données (netflix, dvdrental) — pas pour metro/musicians.
 */
export interface QueryResult<T = Record<string, any>> {
    from: string;
    to: string;
    filters: Record<string, any>;
    data: T[];
    path: string[];
    timing: number;
}
export interface PathBuilderOptions {
    maxPaths?: number;
    minHops?: number;
    maxHops?: number;
    via?: string[];
    strategy?: Strategy;
}
//# sourceMappingURL=types.d.ts.map
/**
 * PathFinder - Dijkstra + DFS limité
 *
 * Deux algorithmes selon l'usage :
 *
 *   findShortestPath()  → Dijkstra  (chemin optimal garanti, performant)
 *   findAllPaths()      → DFS limité (N meilleurs chemins alternatifs)
 *
 * Sur un graphe de métro (300+ stations, 900+ arêtes),
 * le DFS pur explose. Dijkstra est l'algorithme correct.
 */
import type { Graph, Path, PathDetails } from '../types/index.js';
export declare class PathFinder {
    private graph;
    private adjacencyList;
    constructor(graph: Graph);
    /**
     * Chemin le plus court par poids (Dijkstra).
     * Garanti optimal. Performant sur grands graphes.
     */
    findShortestPath(from: string, to: string): PathDetails | null;
    /**
     * N meilleurs chemins (Yen's K-shortest paths simplifié).
     * Trouve le plus court via Dijkstra, puis des alternatives
     * en pénalisant les arêtes du chemin précédent.
     */
    findAllPaths(from: string, to: string, maxPaths?: number, _maxDepth?: number, transferPenalty?: number, allowedVia?: string[], minHops?: number): Path[];
    /**
     * Dijkstra avec exclusion d'arêtes (pour les chemins alternatifs)
     */
    private dijkstraWithExclusions;
    getPathWeight(path: Path): number;
    getPathDetails(path: Path): PathDetails;
    hasPath(from: string, to: string): boolean;
    getReachableNodes(from: string, maxDepth?: number): Set<string>;
    private buildAdjacencyList;
    getStats(): {
        nodes: number;
        edges: number;
        avgDegree: number;
    };
}
//# sourceMappingURL=PathFinder.d.ts.map
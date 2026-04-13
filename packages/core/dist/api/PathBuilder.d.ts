/**
 * api/PathBuilder.ts — Niveau 2 : exploration algorithmique
 *
 * Point d'entrée : graph.from(a).to(b)
 *
 * Surface publique :
 *   .path(strategy?)     → meilleur chemin (PathResult)
 *   .paths(strategy?)    → tous les chemins ordonnés (PathResult)
 *   .links               → graphe de relations entre les deux nodes
 *   .execute(filters)    → traversée avec hydratation de données
 *
 * Compile vers PathFinder (Dijkstra) + QueryEngine (données).
 * Ne connaît pas le domaine — c'est le niveau 1 (DomainProxy) qui traduit
 * les noms sémantiques en IDs de nodes avant d'appeler PathBuilder.
 */
import type { Graph, CompiledGraph, GraphEdge, Provider } from '../types/index.js';
import type { Strategy, PathResult, QueryResult, PathBuilderOptions } from './types.js';
export declare class PathBuilder {
    private _from;
    private _to;
    private _opts;
    private _graph;
    private _compiled;
    private _dataset;
    private _provider;
    constructor(from: string, graph: Graph, compiled?: CompiledGraph | null, dataset?: Record<string, any[]> | null, opts?: PathBuilderOptions, provider?: Provider | null);
    to(node: string): this;
    maxPaths(n: number): this;
    via(edgeTypes: string[]): this;
    minHops(n: number): this;
    /**
     * path(strategy?) — meilleur chemin selon la stratégie.
     * Stratégie par défaut : Shortest (poids brut).
     *
     * metro:     graph.from('Pigalle').to('Alesia').path(Strategy.Comfort())
     * musicians: graph.from('Jackson').to('West').path()
     */
    path(strategy?: Strategy): PathResult;
    /**
     * paths(strategy?) — tous les chemins ordonnés par poids.
     *
     * metro:     graph.from('Chatelet').to('Nation').paths(Strategy.Shortest())
     * musicians: graph.from('Pharrell').to('Kanye').paths()
     */
    paths(strategy?: Strategy): PathResult;
    /**
     * links — graphe de relations entre from et to.
     * Retourne toutes les arêtes qui participent aux chemins possibles,
     * sans les ordonner — vue structurelle, pas navigationnelle.
     *
     * musicians: graph.from('Jackson').to('West').links
     */
    get links(): PathResult & {
        edges: GraphEdge[];
    };
    /**
     * execute(filters) — traversée avec hydratation de données.
     * Uniquement disponible si un dataset ou provider est configuré.
     *
     * netflix:    graph.from('movies').to('people').execute({ id: 278 })
     * dvdrental:  graph.from('customer').to('actor').execute({ id: 1 })
     */
    execute<T = Record<string, any>>(filters?: Record<string, any>): Promise<QueryResult<T>>;
    private _assertTo;
    private _findPaths;
    /**
     * Enrichit les nodes avec labels et arêtes empruntées.
     */
    private _resolveSteps;
    /**
     * Calcule le poids total d'un chemin en tenant compte de la pénalité
     * de correspondance (changement de ligne/type d'arête).
     */
    private _computeWeight;
}
//# sourceMappingURL=PathBuilder.d.ts.map
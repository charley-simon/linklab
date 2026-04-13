/**
 * api/Graph.ts — Niveau 0 : constructeur et surface unifiée
 *
 * Point d'entrée unique de LinkLab.
 *
 *   const graph = new Graph(graphJson)
 *   const graph = new Graph(graphJson, { compiled, dataset })
 *
 * Expose :
 *   Niveau 2 — graph.from(a).to(b).path(strategy)
 *   Niveau 3 — graph.entities, graph.relations, graph.weights, graph.schema
 *   Niveau 4 — graph.compile(), graph.snapshot()
 *
 * Le niveau 1 (DomainProxy) sera ajouté dans graph.domain() — prochaine étape.
 */
import type { Graph as GraphData, CompiledGraph, GraphNode, GraphEdge, Provider } from '../types/index.js';
import { GraphCompiler } from '../graph/GraphCompiler.js';
import { PathBuilder } from './PathBuilder.js';
import type { PathBuilderOptions } from './types.js';
export interface GraphOptions {
    /** CompiledGraph précalculé — active .execute() sur PathBuilder */
    compiled?: CompiledGraph;
    /** Dataset en mémoire { tableName: rows[] } — active .execute() */
    dataset?: Record<string, any[]>;
    /** Provider externe (PostgreSQL, etc.) — active .execute() via SQL */
    provider?: Provider;
    /** Préfixe de chemin pour résoudre les imports relatifs */
    basePath?: string;
    /** Dictionnaire résolu — labels humains des routes */
    dictionary?: Record<string, any> | null;
}
/** Lien navigable depuis un nœud — retourné par linksFrom() */
export interface NavigationLink {
    to: string;
    label: string;
    semantic: boolean;
    weight?: number;
}
export declare class Graph {
    private _data;
    private _compiled;
    private _dataset;
    private _provider;
    private _dictionary;
    constructor(source: GraphData | string, options?: GraphOptions);
    /**
     * domain() — retourne un Proxy sémantique sur le graphe.
     * Optionnel — Graph lui-même est utilisable comme domaine directement.
     *
     *   const cinema = new Graph(source, opts)
     *   await cinema.movies                    // via Graph comme domaine
     *   await cinema.domain().movies           // équivalent explicite
     *   await cinema.domain('cinema').movies   // avec nom (futur: permissions/projections)
     */
    domain(_name?: string): any;
    /**
     * from(node) — point de départ d'une traversée.
     *
     *   graph.from('Pigalle').to('Alesia').path(Strategy.Comfort())
     *   graph.from('movies').to('people').execute({ id: 278 })
     */
    from(node: string, opts?: PathBuilderOptions): PathBuilder;
    /**
     * within(node, depth) — exploration radiale depuis un node.
     * Retourne tous les nodes accessibles en ≤ depth sauts.
     *
     *   graph.within('Châtelet', 3).nodes
     */
    within(node: string, depth?: number): {
        nodes: GraphNode[];
    };
    /** Liste des entités (nodes) du graphe */
    get entities(): GraphNode[];
    /** Liste des relations (arêtes) du graphe */
    get relations(): GraphEdge[];
    /** Poids courants de toutes les arêtes — { edgeName: weight } */
    get weights(): Record<string, number>;
    /** Schéma résolu — nodes groupés par type */
    get schema(): Record<string, GraphNode[]>;
    /**
     * linksFrom(nodeId) — liens navigables depuis un nœud, au niveau sémantique maximal.
     *
     * Retourne les routes physiques ET les vues sémantiques du compiledGraph.
     * Utilisé par : REPL (autocomplétion), TUI, extension VSCode.
     *
     *   graph.linksFrom('movies')
     *   // → [
     *   //   { to: 'people',   label: 'people',   semantic: false },  ← table physique
     *   //   { to: 'people',   label: 'actor',    semantic: true  },  ← vue filtrée jobId=1
     *   //   { to: 'people',   label: 'director', semantic: true  },  ← vue filtrée jobId=2
     *   // ]
     */
    linksFrom(nodeId: string): NavigationLink[];
    /**
     * compile() — précalcule les routes optimales.
     * Retourne un nouveau Graph avec le compiledGraph injecté.
     */
    compile(config?: Parameters<GraphCompiler['compile']>[1]): Graph;
    /**
     * snapshot() — sérialise l'état courant (graph + compiled si présent).
     */
    snapshot(): {
        graph: GraphData;
        compiled: CompiledGraph | null;
    };
    /**
     * weight(edgeName).set(value) — ajuste le poids d'une arête.
     * Retourne un nouveau Graph (immuable).
     */
    weight(edgeName: string): {
        set: (value: number) => Graph;
        update: (fn: (current: number) => number) => Graph;
    };
    /** GraphData interne — pour les couches qui en ont besoin */
    get raw(): GraphData;
}
//# sourceMappingURL=Graph.d.ts.map
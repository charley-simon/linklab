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
import { PathFinder } from '../core/PathFinder.js';
import { QueryEngine } from '../runtime/QueryEngine.js';
import { Strategy as S } from './types.js';
export class PathBuilder {
    _from;
    _to = null;
    _opts;
    _graph;
    _compiled;
    _dataset;
    _provider;
    constructor(from, graph, compiled = null, dataset = null, opts = {}, provider = null) {
        this._from = from;
        this._graph = graph;
        this._compiled = compiled;
        this._dataset = dataset;
        this._opts = opts;
        this._provider = provider;
    }
    // ── Builder ────────────────────────────────────────────────────────────────
    to(node) {
        this._to = node;
        return this;
    }
    maxPaths(n) {
        this._opts = { ...this._opts, maxPaths: n };
        return this;
    }
    via(edgeTypes) {
        this._opts = { ...this._opts, via: edgeTypes };
        return this;
    }
    minHops(n) {
        this._opts = { ...this._opts, minHops: n };
        return this;
    }
    // ── Résultats ──────────────────────────────────────────────────────────────
    /**
     * path(strategy?) — meilleur chemin selon la stratégie.
     * Stratégie par défaut : Shortest (poids brut).
     *
     * metro:     graph.from('Pigalle').to('Alesia').path(Strategy.Comfort())
     * musicians: graph.from('Jackson').to('West').path()
     */
    path(strategy) {
        return this._findPaths(1, strategy);
    }
    /**
     * paths(strategy?) — tous les chemins ordonnés par poids.
     *
     * metro:     graph.from('Chatelet').to('Nation').paths(Strategy.Shortest())
     * musicians: graph.from('Pharrell').to('Kanye').paths()
     */
    paths(strategy) {
        const maxPaths = this._opts.maxPaths ?? 5;
        return this._findPaths(maxPaths, strategy);
    }
    /**
     * links — graphe de relations entre from et to.
     * Retourne toutes les arêtes qui participent aux chemins possibles,
     * sans les ordonner — vue structurelle, pas navigationnelle.
     *
     * musicians: graph.from('Jackson').to('West').links
     */
    get links() {
        const result = this._findPaths(this._opts.maxPaths ?? 10);
        // Collecter toutes les arêtes participant aux chemins trouvés
        const nodeSet = new Set(result.paths.flatMap(p => p.nodes));
        const edges = this._graph.edges.filter(e => nodeSet.has(e.from) && nodeSet.has(e.to));
        return { ...result, edges };
    }
    /**
     * execute(filters) — traversée avec hydratation de données.
     * Uniquement disponible si un dataset ou provider est configuré.
     *
     * netflix:    graph.from('movies').to('people').execute({ id: 278 })
     * dvdrental:  graph.from('customer').to('actor').execute({ id: 1 })
     */
    async execute(filters = {}) {
        if (!this._to)
            throw new Error(`PathBuilder : .to(node) requis avant execute()`);
        const to = this._to;
        const start = Date.now();
        if (!this._compiled || !this._dataset) {
            throw new Error(`execute() nécessite un compiledGraph et un dataset.\n` +
                `Utilisez new Graph(graphJson, { compiled, dataset }) pour activer la traversée de données.`);
        }
        const engine = new QueryEngine(this._compiled);
        const data = engine.executeInMemory({ from: this._from, to, filters }, this._dataset);
        let path = [this._from, to];
        try {
            const route = engine.getRoute(this._from, to);
            path = route.primary.path;
        }
        catch { /* route inconnue — chemin direct */ }
        return {
            from: this._from,
            to,
            filters,
            data,
            path,
            timing: Date.now() - start,
        };
    }
    // ── Interne ────────────────────────────────────────────────────────────────
    _assertTo() {
        if (!this._to)
            throw new Error(`PathBuilder : .to(node) requis avant cette opération`);
    }
    _findPaths(maxPaths, strategy) {
        if (!this._to)
            throw new Error(`PathBuilder : .to(node) requis avant path()/paths()`);
        const to = this._to;
        const penalty = S.toPenalty(strategy ?? this._opts.strategy ?? S.Shortest());
        const finder = new PathFinder(this._graph);
        const rawPaths = finder.findAllPaths(this._from, to, maxPaths, 50, penalty, this._opts.via, this._opts.minHops ?? 0);
        if (rawPaths.length === 0) {
            return { from: this._from, to, found: false, paths: [] };
        }
        const paths = rawPaths.map(nodes => ({
            nodes,
            steps: this._resolveSteps(nodes),
            weight: this._computeWeight(nodes, penalty),
            hops: nodes.length - 1,
        }));
        return { from: this._from, to, found: true, paths };
    }
    /**
     * Enrichit les nodes avec labels et arêtes empruntées.
     */
    _resolveSteps(nodes) {
        const nodeMap = new Map(this._graph.nodes.map(n => [n.id, n]));
        return nodes.map((nodeId, i) => {
            const node = nodeMap.get(nodeId);
            const step = {
                node: nodeId,
                label: node?.label ?? node?.name ?? nodeId,
            };
            if (i > 0) {
                // Arête qui mène à ce node depuis le précédent
                step.via = this._graph.edges.find(e => e.from === nodes[i - 1] && e.to === nodeId) ?? this._graph.edges.find(e => e.from === nodeId && e.to === nodes[i - 1]);
            }
            return step;
        });
    }
    /**
     * Calcule le poids total d'un chemin en tenant compte de la pénalité
     * de correspondance (changement de ligne/type d'arête).
     */
    _computeWeight(nodes, transferPenalty) {
        let weight = 0;
        let prevEdgeType;
        for (let i = 0; i < nodes.length - 1; i++) {
            const edge = this._graph.edges.find(e => e.from === nodes[i] && e.to === nodes[i + 1]);
            const w = edge ? Number(edge.weight) || 1 : 1;
            const type = edge?.metadata?.type ?? edge?.via;
            // Pénalité si changement de type d'arête (correspondance)
            if (transferPenalty > 0 && prevEdgeType && type !== prevEdgeType) {
                weight += transferPenalty;
            }
            weight += w;
            prevEdgeType = type;
        }
        return weight;
    }
}
//# sourceMappingURL=PathBuilder.js.map
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
import { createRequire } from 'module';
import path from 'path';
import { GraphCompiler } from '../graph/GraphCompiler.js';
import { PathBuilder } from './PathBuilder.js';
import { createDomain } from './DomainNode.js';
export class Graph {
    _data;
    _compiled;
    _dataset;
    _provider;
    _dictionary;
    constructor(source, options = {}) {
        // Accepte un objet GraphData directement ou un chemin vers graph.json
        if (typeof source === 'string') {
            const resolved = options.basePath
                ? path.resolve(options.basePath, source)
                : path.resolve(source);
            const req = createRequire(import.meta.url);
            this._data = req(resolved);
        }
        else {
            this._data = source;
        }
        this._compiled = options.compiled ?? null;
        this._dataset = options.dataset ?? null;
        this._provider = options.provider ?? null;
        this._dictionary = options.dictionary ?? null;
    }
    // ── Niveau 1 — Navigation sémantique (domain proxy) ─────────────────────────
    /**
     * domain() — retourne un Proxy sémantique sur le graphe.
     * Optionnel — Graph lui-même est utilisable comme domaine directement.
     *
     *   const cinema = new Graph(source, opts)
     *   await cinema.movies                    // via Graph comme domaine
     *   await cinema.domain().movies           // équivalent explicite
     *   await cinema.domain('cinema').movies   // avec nom (futur: permissions/projections)
     */
    domain(_name) {
        return createDomain({
            graphData: this._data,
            compiled: this._compiled,
            dataset: this._dataset,
            provider: this._provider,
            dictionary: this._dictionary,
        }, this); // ← passe le Graph pour .graph
    }
    // ── Niveau 2 — Exploration algorithmique ──────────────────────────────────
    /**
     * from(node) — point de départ d'une traversée.
     *
     *   graph.from('Pigalle').to('Alesia').path(Strategy.Comfort())
     *   graph.from('movies').to('people').execute({ id: 278 })
     */
    from(node, opts = {}) {
        return new PathBuilder(node, this._data, this._compiled, this._dataset ?? null, opts, this._provider);
    }
    /**
     * within(node, depth) — exploration radiale depuis un node.
     * Retourne tous les nodes accessibles en ≤ depth sauts.
     *
     *   graph.within('Châtelet', 3).nodes
     */
    within(node, depth = 2) {
        const finder = new (require('../core/PathFinder.js').PathFinder)(this._data);
        const reached = finder.getReachableNodes(node, depth);
        const nodes = this._data.nodes.filter(n => reached.has(n.id));
        return { nodes };
    }
    // ── Niveau 3 — Introspection ───────────────────────────────────────────────
    /** Liste des entités (nodes) du graphe */
    get entities() {
        return [...this._data.nodes];
    }
    /** Liste des relations (arêtes) du graphe */
    get relations() {
        return [...this._data.edges];
    }
    /** Poids courants de toutes les arêtes — { edgeName: weight } */
    get weights() {
        return Object.fromEntries(this._data.edges
            .filter(e => e.name)
            .map(e => [e.name, Number(e.weight) || 1]));
    }
    /** Schéma résolu — nodes groupés par type */
    get schema() {
        const result = {};
        for (const node of this._data.nodes) {
            const type = node.type ?? 'node';
            if (!result[type])
                result[type] = [];
            result[type].push(node);
        }
        return result;
    }
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
    linksFrom(nodeId) {
        const links = [];
        const seen = new Set();
        // Routes physiques — priorité : raw-graph edges, fallback : compiled.routes non-sémantiques
        const rawEdges = this._data.edges.filter(e => e.from === nodeId);
        if (rawEdges.length > 0) {
            for (const e of rawEdges) {
                const label = e.name ?? e.to;
                if (!seen.has(label)) {
                    seen.add(label);
                    links.push({ to: e.to, label, semantic: false, weight: Number(e.weight) || 1 });
                }
            }
        }
        else if (this._compiled) {
            // Pas de raw-graph (cas loadGraph({ compiled })) → routes physiques depuis compiled
            for (const r of this._compiled.routes ?? []) {
                if (r.from === nodeId && !r.semantic) {
                    const label = r.to;
                    if (!seen.has(label)) {
                        seen.add(label);
                        links.push({ to: r.to, label, semantic: false, weight: r.primary?.weight });
                    }
                }
            }
        }
        // Routes sémantiques depuis le compiledGraph
        if (this._compiled) {
            for (const r of this._compiled.routes ?? []) {
                if (r.from === nodeId && r.semantic === true) {
                    const label = r.label ?? r.to;
                    if (!seen.has(label)) {
                        seen.add(label);
                        links.push({ to: r.to, label, semantic: true, weight: r.primary?.weight });
                    }
                }
            }
        }
        return links;
    }
    // ── Niveau 4 — Maintenance ─────────────────────────────────────────────────
    /**
     * compile() — précalcule les routes optimales.
     * Retourne un nouveau Graph avec le compiledGraph injecté.
     */
    compile(config = new Map()) {
        const compiler = new GraphCompiler();
        const compiled = compiler.compile(this._data, config);
        return new Graph(this._data, {
            compiled,
            dataset: this._dataset ?? undefined,
        });
    }
    /**
     * snapshot() — sérialise l'état courant (graph + compiled si présent).
     */
    snapshot() {
        return {
            graph: this._data,
            compiled: this._compiled,
        };
    }
    /**
     * weight(edgeName).set(value) — ajuste le poids d'une arête.
     * Retourne un nouveau Graph (immuable).
     */
    weight(edgeName) {
        return {
            set: (value) => {
                const edges = this._data.edges.map(e => e.name === edgeName ? { ...e, weight: value } : e);
                return new Graph({ ...this._data, edges }, { compiled: this._compiled ?? undefined, dataset: this._dataset ?? undefined });
            },
            update: (fn) => {
                const edges = this._data.edges.map(e => {
                    if (e.name !== edgeName)
                        return e;
                    return { ...e, weight: fn(Number(e.weight) || 1) };
                });
                return new Graph({ ...this._data, edges }, { compiled: this._compiled ?? undefined, dataset: this._dataset ?? undefined });
            },
        };
    }
    // ── Accès aux données brutes ───────────────────────────────────────────────
    /** GraphData interne — pour les couches qui en ont besoin */
    get raw() {
        return this._data;
    }
}
//# sourceMappingURL=Graph.js.map
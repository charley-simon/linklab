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
export class PathFinder {
    graph;
    adjacencyList;
    constructor(graph) {
        this.graph = graph;
        this.adjacencyList = this.buildAdjacencyList(graph);
    }
    // ==================== DIJKSTRA ====================
    /**
     * Chemin le plus court par poids (Dijkstra).
     * Garanti optimal. Performant sur grands graphes.
     */
    findShortestPath(from, to) {
        const dist = new Map();
        const prev = new Map();
        const visited = new Set();
        // Initialisation
        for (const node of this.graph.nodes) {
            dist.set(node.id, Infinity);
        }
        dist.set(from, 0);
        prev.set(from, null);
        // Priority queue simple (pour notre taille, suffisant)
        const queue = new Set(this.graph.nodes.map(n => n.id));
        while (queue.size > 0) {
            // Nœud non visité avec distance minimale
            let u = null;
            let minDist = Infinity;
            for (const node of queue) {
                const d = dist.get(node) ?? Infinity;
                if (d < minDist) {
                    minDist = d;
                    u = node;
                }
            }
            if (u === null || u === to)
                break;
            if (minDist === Infinity)
                break; // Graphe non connexe
            queue.delete(u);
            visited.add(u);
            const neighbors = this.adjacencyList.get(u) ?? [];
            for (const { to: v, edge } of neighbors) {
                if (visited.has(v))
                    continue;
                const alt = (dist.get(u) ?? Infinity) + edge.weight;
                if (alt < (dist.get(v) ?? Infinity)) {
                    dist.set(v, alt);
                    prev.set(v, { node: u, edge });
                }
            }
        }
        if (!prev.has(to) && to !== from)
            return null;
        if ((dist.get(to) ?? Infinity) === Infinity)
            return null;
        // Reconstruction du chemin
        const path = [];
        const edges = [];
        let current = to;
        while (current !== null) {
            path.unshift(current);
            const p = prev.get(current);
            if (p) {
                edges.unshift(p.edge);
                current = p.node;
            }
            else {
                current = null;
            }
        }
        return {
            path,
            edges,
            length: path.length,
            joins: path.length - 1,
            weight: dist.get(to) ?? 0,
            indirect: path.length > 2
        };
    }
    /**
     * N meilleurs chemins (Yen's K-shortest paths simplifié).
     * Trouve le plus court via Dijkstra, puis des alternatives
     * en pénalisant les arêtes du chemin précédent.
     */
    findAllPaths(from, to, maxPaths = 3, _maxDepth = 50, transferPenalty = 0, allowedVia, minHops = 0) {
        const results = [];
        const penalized = new Set(); // arêtes temporairement exclues
        for (let k = 0; k < maxPaths; k++) {
            const result = this.dijkstraWithExclusions(from, to, penalized, transferPenalty, allowedVia, minHops);
            if (!result)
                break;
            results.push(result);
            // Pénaliser la dernière arête du chemin trouvé pour forcer une alternative
            if (result.edges.length > 0) {
                const lastEdge = result.edges[result.edges.length - 1];
                penalized.add(lastEdge.name ?? `${lastEdge.from}->${lastEdge.to}`);
            }
        }
        return results.map(r => r.path);
    }
    /**
     * Dijkstra avec exclusion d'arêtes (pour les chemins alternatifs)
     */
    dijkstraWithExclusions(from, to, excluded, transferPenalty = 0, allowedVia, minHops = 0) {
        const dist = new Map();
        const prev = new Map();
        const visited = new Set();
        for (const node of this.graph.nodes)
            dist.set(node.id, Infinity);
        dist.set(from, 0);
        prev.set(from, null);
        const queue = new Set(this.graph.nodes.map(n => n.id));
        while (queue.size > 0) {
            let u = null;
            let minDist = Infinity;
            for (const node of queue) {
                const d = dist.get(node) ?? Infinity;
                if (d < minDist) {
                    minDist = d;
                    u = node;
                }
            }
            if (u === null || u === to || minDist === Infinity)
                break;
            queue.delete(u);
            visited.add(u);
            for (const { to: v, edge } of this.adjacencyList.get(u) ?? []) {
                if (visited.has(v))
                    continue;
                const edgeKey = edge.name ?? `${edge.from}->${edge.to}`;
                if (excluded.has(edgeKey))
                    continue;
                // Filtre via — si spécifié, ignorer les arêtes dont le type n'est pas dans la liste
                if (allowedVia && allowedVia.length > 0) {
                    const edgeType = edge.metadata?.type ?? edge.via;
                    if (!allowedVia.includes(edgeType))
                        continue;
                }
                // Pénalité sur changement de ligne — deux cas :
                // 1. Arête explicitement TRANSFER (self-loop de correspondance)
                // 2. Changement de ligne implicite (arête DIRECT mais ligne différente de la précédente)
                let penalty = 0;
                if (transferPenalty > 0) {
                    const isExplicitTransfer = edge.metadata?.type === 'TRANSFER';
                    const prevEdge = prev.get(u);
                    const prevLineId = prevEdge?.edge?.metadata?.lineId;
                    const currLineId = edge.metadata?.lineId;
                    const isLineChange = prevLineId && currLineId && prevLineId !== currLineId
                        && edge.metadata?.type !== 'TRANSFER';
                    if (isExplicitTransfer || isLineChange) {
                        penalty = transferPenalty;
                    }
                }
                const alt = (dist.get(u) ?? Infinity) + edge.weight + penalty;
                if (alt < (dist.get(v) ?? Infinity)) {
                    dist.set(v, alt);
                    prev.set(v, { node: u, edge });
                }
            }
        }
        if ((dist.get(to) ?? Infinity) === Infinity)
            return null;
        const path = [];
        const edges = [];
        let current = to;
        while (current !== null) {
            path.unshift(current);
            const p = prev.get(current);
            if (p) {
                edges.unshift(p.edge);
                current = p.node;
            }
            else
                current = null;
        }
        // Filtre minHops — rejeter les chemins trop courts
        if (minHops > 0 && path.length - 1 < minHops)
            return null;
        return {
            path, edges,
            length: path.length,
            joins: path.length - 1,
            weight: dist.get(to) ?? 0,
            indirect: path.length > 2
        };
    }
    // ==================== HELPERS ====================
    getPathWeight(path) {
        let total = 0;
        for (let i = 0; i < path.length - 1; i++) {
            const edge = this.graph.edges.find(e => e.from === path[i] && e.to === path[i + 1]);
            if (edge)
                total += edge.weight;
        }
        return total;
    }
    getPathDetails(path) {
        const edges = [];
        for (let i = 0; i < path.length - 1; i++) {
            const edge = this.graph.edges.find(e => e.from === path[i] && e.to === path[i + 1]);
            if (edge)
                edges.push(edge);
        }
        return {
            path, edges,
            length: path.length,
            joins: path.length - 1,
            weight: this.getPathWeight(path),
            indirect: path.length > 2
        };
    }
    hasPath(from, to) {
        return this.findShortestPath(from, to) !== null;
    }
    getReachableNodes(from, maxDepth = 50) {
        const reachable = new Set();
        const visited = new Set();
        const dfs = (node, depth) => {
            if (depth > maxDepth || visited.has(node))
                return;
            visited.add(node);
            reachable.add(node);
            for (const { to } of this.adjacencyList.get(node) ?? [])
                dfs(to, depth + 1);
        };
        dfs(from, 0);
        reachable.delete(from);
        return reachable;
    }
    buildAdjacencyList(graph) {
        const adj = new Map();
        for (const edge of graph.edges) {
            if (!adj.has(edge.from))
                adj.set(edge.from, []);
            adj.get(edge.from).push({ to: edge.to, edge });
            if (!adj.has(edge.to))
                adj.set(edge.to, []);
        }
        return adj;
    }
    getStats() {
        const degrees = new Map();
        for (const node of this.graph.nodes)
            degrees.set(node.id, 0);
        for (const edge of this.graph.edges) {
            degrees.set(edge.from, (degrees.get(edge.from) ?? 0) + 1);
        }
        const avgDegree = Array.from(degrees.values()).reduce((s, d) => s + d, 0) / degrees.size;
        return { nodes: this.graph.nodes.length, edges: this.graph.edges.length, avgDegree };
    }
}
//# sourceMappingURL=PathFinder.js.map
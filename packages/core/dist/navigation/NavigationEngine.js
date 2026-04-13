/**
 * NavigationEngine - Moteur de navigation sémantique
 *
 * Trois modes orthogonaux :
 *
 *   PATHFIND  — Trouver les N meilleurs chemins entre deux nœuds
 *   NAVIGATE  — Résoudre une stack de frames étape par étape
 *   SCHEDULE  — Exécuter des actions par priorité sur un contexte
 *
 * Trois bus exposés sur chaque instance :
 *
 *   engine.hooks   — awaitable, enrichit ou annule le flux
 *   engine.events  — fire-and-forget, observation pure
 *   engine.errors  — synchrone, jamais silencieux
 *
 * Trail :
 *   Le moteur accepte un Trail existant (Option B).
 *   Si aucun Trail n'est fourni, il en crée un à partir de initialStack.
 *   engine.trail est toujours accessible après création.
 *
 * ── Instrumentation @linklab/telemetry ──────────────────────────────────────
 *   Chaque appel à run() produit un Span si @linklab/telemetry est installé.
 *   Points mesurés :
 *     - Step 'PathFinder'  : durée de findAllPaths() (mode PATHFIND)
 *     - Step 'Resolver'    : durée de resolver.resolve() par frame (mode NAVIGATE)
 *     - Step 'Scheduler'   : durée de scheduler.step() (mode SCHEDULE)
 *   Le span est émis sur traceBus à la fin de run(), succès ou erreur.
 */
import { PathFinder } from '../core/PathFinder.js';
import { Resolver } from './Resolver.js';
import { Scheduler } from './Scheduler.js';
import { Trail } from './Trail.js';
import { createGraphBuses } from '../core/GraphEvents.js';
import { shim } from '../instrumentation/TelemetryShim.js';
export class NavigationEngine {
    mode;
    graph;
    pathFinder;
    resolver;
    scheduler;
    config;
    // ── Trail — contexte de navigation vivant ────────────────────
    trail;
    // ── Les trois bus ────────────────────────────────────────────
    hooks;
    events;
    errors;
    constructor(config) {
        this.config = config;
        this.mode = config.mode;
        this.graph = config.graph;
        this.trail = config.trail ?? Trail.create({
            frames: config.initialStack ?? []
        });
        if (!config.trail && config.initialStack) {
            for (const frame of config.initialStack) {
                if (!frame.state) {
                    frame.state = frame.id !== undefined ? 'RESOLVED' : 'UNRESOLVED';
                }
            }
        }
        const buses = createGraphBuses();
        this.hooks = buses.hooks;
        this.events = buses.events;
        this.errors = buses.errors;
        switch (this.mode) {
            case 'PATHFIND':
                this.pathFinder = new PathFinder(this.graph);
                break;
            case 'NAVIGATE':
                this.resolver = new Resolver(this.graph);
                break;
            case 'SCHEDULE':
                this.scheduler = new Scheduler(config.actions ?? [], this.graph);
                break;
        }
    }
    // ==================== FACTORY METHODS ====================
    static forPathfinding(graph, query) {
        return new NavigationEngine({ mode: 'PATHFIND', graph, pathQuery: query });
    }
    static forNavigation(graph, options) {
        if ('trail' in options) {
            return new NavigationEngine({ mode: 'NAVIGATE', graph, trail: options.trail });
        }
        return new NavigationEngine({ mode: 'NAVIGATE', graph, initialStack: options.stack });
    }
    static forScheduling(graph, options) {
        const trail = options.trail ?? Trail.create({ frames: options.stack ?? [] });
        return new NavigationEngine({ mode: 'SCHEDULE', graph, trail, actions: options.actions });
    }
    // ==================== RUN ====================
    async run(maxSteps = 1) {
        // ── Span : contexte commun aux trois modes ───────────────
        const trailStr = this._buildTrailString();
        const spanBuilder = shim.startSpan({
            trail: trailStr,
            from: this._resolvedFrom(),
            to: this._targetTo(),
            filters: this._currentFilters(),
            path: [], // mis à jour après résolution
        });
        try {
            let results;
            switch (this.mode) {
                case 'PATHFIND':
                    results = await this.runPathfind(spanBuilder);
                    break;
                case 'NAVIGATE':
                    results = await this.runNavigate(maxSteps, spanBuilder);
                    break;
                case 'SCHEDULE':
                    results = await this.runSchedule(maxSteps, spanBuilder);
                    break;
                default:
                    throw new Error(`Mode inconnu : ${this.mode}`);
            }
            // Émettre le span de succès
            if (spanBuilder) {
                const rowCount = this._countRows(results);
                const span = spanBuilder.end({ rowCount });
                shim.emitEnd(span);
            }
            return results;
        }
        catch (err) {
            // Émettre le span d'erreur
            if (spanBuilder) {
                const span = spanBuilder.endWithError(err, {
                    compiledGraphHash: 'unknown',
                    weights: {},
                    cacheState: { l1HitRate: 0, l2HitRate: 0, globalHitRate: 0, yoyoEvents: 0 },
                });
                shim.emitError(span);
            }
            throw err;
        }
    }
    // ==================== PRIVATE (inchangé sauf signature + step timings) ====================
    async runPathfind(spanBuilder) {
        if (!this.pathFinder || !this.config.pathQuery) {
            throw new Error('PATHFIND requiert pathQuery');
        }
        const { from, to, maxPaths = 5, transferPenalty = 0, via, minHops = 0 } = this.config.pathQuery;
        const startTime = Date.now();
        const hookResult = await this.hooks.call('traversal.before', {
            from, to,
            stack: [...this.trail.frames],
            graph: this.graph,
        });
        if (hookResult.cancelled) {
            this.errors.emit('traversal.failed', {
                from, to,
                reason: hookResult.reason ?? 'Annulé par hook traversal.before',
            });
            return [{ time: 0, mode: 'PATHFIND', result: { type: 'FAIL', reason: hookResult.reason } }];
        }
        // ── Step : PathFinder ────────────────────────────────────
        spanBuilder?.stepStart('PathFinder');
        const allPaths = this.pathFinder.findAllPaths(from, to, maxPaths, 50, transferPenalty, via, minHops);
        spanBuilder?.stepEnd('PathFinder');
        if (allPaths.length === 0) {
            this.errors.emit('route.notfound', {
                from, to,
                stack: [...this.trail.frames],
            });
            return [{ time: 0, mode: 'PATHFIND', result: { type: 'FAIL', reason: 'Aucun chemin trouvé' } }];
        }
        const pathsWithDetails = allPaths
            .map(nodes => {
            const edges = [];
            let totalWeight = 0;
            for (let i = 0; i < nodes.length - 1; i++) {
                const edge = this.graph.edges.find(e => e.from === nodes[i] && e.to === nodes[i + 1]);
                if (edge) {
                    edges.push(edge);
                    totalWeight += edge.weight;
                }
            }
            return { nodes, edges, totalWeight };
        })
            .sort((a, b) => a.totalWeight - b.totalWeight)
            .slice(0, maxPaths);
        const best = pathsWithDetails[0];
        // Mettre à jour le path dans le span
        if (spanBuilder) {
            ;
            spanBuilder.withPath?.(best.nodes);
        }
        this.events.emit('traversal.complete', {
            from, to,
            path: best,
            durationMs: Date.now() - startTime,
            stackDepth: this.trail.depth,
            routeUsed: best.nodes.join('→'),
            routeWeight: best.totalWeight,
        });
        return pathsWithDetails.map((path, index) => ({
            time: index,
            mode: 'PATHFIND',
            path,
            result: { type: 'SUCCESS', data: { rank: index + 1, allPaths: pathsWithDetails } }
        }));
    }
    async runNavigate(maxSteps, spanBuilder) {
        if (!this.resolver)
            throw new Error('NAVIGATE requiert Resolver');
        const results = [];
        for (let t = 0; t < maxSteps; t++) {
            const resolved = this.trail.frames.filter(f => f.state === 'RESOLVED').length;
            const unresolved = this.trail.unresolved;
            if (unresolved.length === 0) {
                results.push({
                    time: t, mode: 'NAVIGATE', phase: 'COMPLETE',
                    resolvedCount: resolved, unresolvedCount: 0,
                    result: { type: 'SUCCESS' }
                });
                break;
            }
            const nextUnresolved = unresolved[0];
            const hookResult = await this.hooks.call('traversal.before', {
                from: [...this.trail.frames].reverse().find(f => f.state === 'RESOLVED')?.entity ?? '',
                to: nextUnresolved.entity,
                stack: [...this.trail.frames],
                graph: this.graph,
            });
            if (hookResult.cancelled) {
                this.errors.emit('traversal.failed', {
                    from: '',
                    to: nextUnresolved.entity,
                    reason: hookResult.reason ?? 'Annulé par hook traversal.before',
                });
                results.push({
                    time: t, mode: 'NAVIGATE', phase: 'COMPLETE',
                    result: { type: 'FAIL', reason: hookResult.reason }
                });
                break;
            }
            const accessResult = await this.hooks.call('access.check', {
                node: nextUnresolved.entity,
                stack: [...this.trail.frames],
                context: this.trail.user,
            });
            if (accessResult.cancelled) {
                this.errors.emit('access.denied', {
                    node: nextUnresolved.entity,
                    reason: accessResult.reason ?? 'Accès refusé',
                    stack: [...this.trail.frames],
                });
                results.push({
                    time: t, mode: 'NAVIGATE', phase: 'COMPLETE',
                    result: { type: 'FAIL', reason: accessResult.reason }
                });
                break;
            }
            const startTime = Date.now();
            const currentStack = [...this.trail.frames];
            // ── Step : Resolver ──────────────────────────────────
            spanBuilder?.stepStart('Resolver');
            const newStack = await this.resolver.resolve(currentStack);
            spanBuilder?.stepEnd('Resolver');
            for (const newFrame of newStack) {
                if (newFrame.state === 'RESOLVED' || newFrame.state === 'DEFERRED') {
                    this.trail.updateFrame(newFrame.entity, newFrame);
                }
            }
            const justResolved = newStack.find(f => f.entity === nextUnresolved.entity && f.state === 'RESOLVED');
            if (justResolved?.resolvedBy) {
                this.events.emit('traversal.complete', {
                    from: justResolved.resolvedBy.via,
                    to: justResolved.entity,
                    path: { nodes: [justResolved.resolvedBy.via, justResolved.entity], edges: [], totalWeight: 0 },
                    durationMs: Date.now() - startTime,
                    stackDepth: this.trail.depth,
                    routeUsed: justResolved.resolvedBy.relation,
                    routeWeight: 0,
                });
            }
            results.push({
                time: t, mode: 'NAVIGATE', phase: 'RESOLVE',
                resolvedCount: resolved, unresolvedCount: unresolved.length
            });
        }
        return results;
    }
    async runSchedule(maxSteps, spanBuilder) {
        if (!this.scheduler)
            throw new Error('SCHEDULE requiert Scheduler');
        const results = [];
        let currentStack = [...this.trail.frames];
        for (let t = 0; t < maxSteps; t++) {
            // ── Step : Scheduler ─────────────────────────────────
            spanBuilder?.stepStart('Scheduler');
            const stepResult = await this.scheduler.step(t, currentStack);
            spanBuilder?.stepEnd('Scheduler');
            if (!stepResult) {
                results.push({
                    time: t, mode: 'SCHEDULE', phase: 'COMPLETE',
                    result: { type: 'SUCCESS', reason: 'Plus aucune action disponible' }
                });
                break;
            }
            currentStack = stepResult.updatedStack;
            this.events.emit('traversal.complete', {
                from: stepResult.selectedAction,
                to: currentStack[currentStack.length - 1]?.entity ?? '',
                path: { nodes: [], edges: [], totalWeight: 0 },
                durationMs: 0,
                stackDepth: this.trail.depth,
                routeUsed: stepResult.selectedAction,
                routeWeight: 0,
            });
            results.push({
                time: t, mode: 'SCHEDULE', phase: 'EXECUTE',
                selectedAction: stepResult.selectedAction,
                result: stepResult.result
            });
        }
        return results;
    }
    // ==================== HELPERS INSTRUMENTATION ====================
    _buildTrailString() {
        return this.trail.frames
            .map(f => f.id !== undefined ? `${f.entity}(${f.id})` : f.entity)
            .join('.');
    }
    _resolvedFrom() {
        const resolved = [...this.trail.frames].reverse().find(f => f.state === 'RESOLVED');
        if (resolved)
            return resolved.entity;
        if (this.config.pathQuery)
            return this.config.pathQuery.from;
        return this.trail.frames[0]?.entity ?? '';
    }
    _targetTo() {
        const unresolved = this.trail.unresolved[0];
        if (unresolved)
            return unresolved.entity;
        if (this.config.pathQuery)
            return this.config.pathQuery.to;
        return this.trail.frames[this.trail.frames.length - 1]?.entity ?? '';
    }
    _currentFilters() {
        const resolved = this.trail.frames.find(f => f.state === 'RESOLVED' && f.id !== undefined);
        return resolved?.id !== undefined ? { id: resolved.id } : {};
    }
    _countRows(results) {
        // PATHFIND : nombre de chemins trouvés
        if (this.mode === 'PATHFIND') {
            return results.filter(r => r.result?.type === 'SUCCESS').length;
        }
        // NAVIGATE/SCHEDULE : nombre de steps résolus
        return results.filter(r => r.phase === 'RESOLVE' || r.phase === 'EXECUTE').length;
    }
    // ==================== GETTERS ====================
    getMode() { return this.mode; }
    getGraph() { return this.graph; }
    /** @deprecated Utiliser engine.trail directement */
    getCurrentStack() { return [...this.trail.frames]; }
}
//# sourceMappingURL=NavigationEngine.js.map
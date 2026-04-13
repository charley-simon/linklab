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
import type { Graph, Frame, ScheduleAction, EngineMode, NavigationEngineConfig, EngineStepResult, PathQuery } from '../types/index.js';
import { Trail } from './Trail.js';
import { type GraphBuses } from '../core/GraphEvents.js';
export declare class NavigationEngine {
    private mode;
    private graph;
    private pathFinder?;
    private resolver?;
    private scheduler?;
    private config;
    readonly trail: Trail;
    readonly hooks: GraphBuses['hooks'];
    readonly events: GraphBuses['events'];
    readonly errors: GraphBuses['errors'];
    constructor(config: NavigationEngineConfig);
    static forPathfinding(graph: Graph, query: PathQuery): NavigationEngine;
    static forNavigation(graph: Graph, options: {
        trail: Trail;
    } | {
        stack: Frame[];
    }): NavigationEngine;
    static forScheduling(graph: Graph, options: {
        trail?: Trail;
        stack?: Frame[];
        actions: ScheduleAction[];
    }): NavigationEngine;
    run(maxSteps?: number): Promise<EngineStepResult[]>;
    private runPathfind;
    private runNavigate;
    private runSchedule;
    private _buildTrailString;
    private _resolvedFrom;
    private _targetTo;
    private _currentFilters;
    private _countRows;
    getMode(): EngineMode;
    getGraph(): Graph;
    /** @deprecated Utiliser engine.trail directement */
    getCurrentStack(): Frame[];
}
//# sourceMappingURL=NavigationEngine.d.ts.map
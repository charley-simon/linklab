/**
 * GraphEvents — Catalogue des événements LinkLab
 *
 * Trois bus, trois contrats :
 *
 *   graph.hooks   — awaitable, enrichit ou annule le flux
 *   graph.events  — fire-and-forget, observation pure
 *   graph.errors  — synchrone, jamais silencieux
 *
 * Conventions de nommage :
 *   hooks  : <sujet>.<moment>   ex: traversal.before, access.check
 *   events : <sujet>.<résultat> ex: traversal.complete, cache.miss
 *   errors : <sujet>.<type>     ex: route.notfound, traversal.failed
 */
import { HookBus, EventBus, ErrorBus } from './EventBus.js';
export function createGraphBuses() {
    return {
        hooks: new HookBus(),
        events: new EventBus(),
        errors: new ErrorBus(),
    };
}
//# sourceMappingURL=GraphEvents.js.map
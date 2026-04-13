/**
 * TraceBus.ts — Bus central de télémétrie
 *
 * Singleton léger (EventEmitter) qui découple les émetteurs (LinkLab, Netflix-backend)
 * des consommateurs (drivers, CLI, dashboard).
 *
 * Zéro dépendance externe — Node EventEmitter natif.
 *
 * Usage :
 *   import { traceBus } from '@linklab/telemetry'
 *
 *   // Émission (dans LinkLab QueryEngine, PathFinder, etc.)
 *   traceBus.emit('span:end', span)
 *
 *   // Consommation (dans un driver, le CLI, Netflix-backend)
 *   traceBus.on('span:end', span => { ... })
 *   traceBus.on('metrics:update', metrics => { ... })
 */
import { EventEmitter } from 'node:events';
// ── TraceBus ──────────────────────────────────────────────────────────────────
class TraceBusImpl extends EventEmitter {
    constructor() {
        super();
        // Pas de limite artificielle sur les listeners — on peut avoir
        // plusieurs drivers + CLI + dashboard en même temps
        this.setMaxListeners(20);
    }
    // ── Émission typée ───────────────────────────────────────────────────────
    emit(event, payload) {
        return super.emit(event, payload);
    }
    // ── Souscription typée ───────────────────────────────────────────────────
    on(event, listener) {
        return super.on(event, listener);
    }
    once(event, listener) {
        return super.once(event, listener);
    }
    off(event, listener) {
        return super.off(event, listener);
    }
    // ── Utilitaires ──────────────────────────────────────────────────────────
    /** Nombre de listeners actifs par type */
    listenerCounts() {
        const events = [
            'span:start', 'span:end', 'span:error',
            'metrics:update', 'calibration:done', 'yoyo:detected',
        ];
        return Object.fromEntries(events.map(e => [e, this.listenerCount(e)]));
    }
}
// ── Singleton global ──────────────────────────────────────────────────────────
export const traceBus = new TraceBusImpl();
//# sourceMappingURL=TraceBus.js.map
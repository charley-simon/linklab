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
import type { Span, SystemMetrics, TelemetryEventType, LatencyBaseline, CapacityBaseline } from '../types.js';
type EventPayloadMap = {
    'span:start': Span;
    'span:end': Span;
    'span:error': Span;
    'metrics:update': SystemMetrics;
    'calibration:done': LatencyBaseline | CapacityBaseline;
    'yoyo:detected': {
        entity: string;
        route: string;
        timestamp: number;
    };
};
declare class TraceBusImpl extends EventEmitter {
    constructor();
    emit<K extends TelemetryEventType>(event: K, payload: EventPayloadMap[K]): boolean;
    on<K extends TelemetryEventType>(event: K, listener: (payload: EventPayloadMap[K]) => void): this;
    once<K extends TelemetryEventType>(event: K, listener: (payload: EventPayloadMap[K]) => void): this;
    off<K extends TelemetryEventType>(event: K, listener: (payload: EventPayloadMap[K]) => void): this;
    /** Nombre de listeners actifs par type */
    listenerCounts(): Record<string, number>;
}
export declare const traceBus: TraceBusImpl;
export type { TraceBusImpl as TraceBus };
//# sourceMappingURL=TraceBus.d.ts.map
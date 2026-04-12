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

import { EventEmitter }  from 'node:events'
import type {
  Span,
  SystemMetrics,
  TelemetryEventType,
  LatencyBaseline,
  CapacityBaseline,
  SpanError,
}                        from '../types.js'

// ── Types des handlers par événement ──────────────────────────────────────────

type EventPayloadMap = {
  'span:start':        Span
  'span:end':          Span
  'span:error':        Span            // span avec span.error défini
  'metrics:update':    SystemMetrics
  'calibration:done':  LatencyBaseline | CapacityBaseline
  'yoyo:detected':     { entity: string; route: string; timestamp: number }
}

// ── TraceBus ──────────────────────────────────────────────────────────────────

class TraceBusImpl extends EventEmitter {

  constructor() {
    super()
    // Pas de limite artificielle sur les listeners — on peut avoir
    // plusieurs drivers + CLI + dashboard en même temps
    this.setMaxListeners(20)
  }

  // ── Émission typée ───────────────────────────────────────────────────────

  emit<K extends TelemetryEventType>(
    event: K,
    payload: EventPayloadMap[K]
  ): boolean {
    return super.emit(event, payload)
  }

  // ── Souscription typée ───────────────────────────────────────────────────

  on<K extends TelemetryEventType>(
    event: K,
    listener: (payload: EventPayloadMap[K]) => void
  ): this {
    return super.on(event, listener as (...args: any[]) => void)
  }

  once<K extends TelemetryEventType>(
    event: K,
    listener: (payload: EventPayloadMap[K]) => void
  ): this {
    return super.once(event, listener as (...args: any[]) => void)
  }

  off<K extends TelemetryEventType>(
    event: K,
    listener: (payload: EventPayloadMap[K]) => void
  ): this {
    return super.off(event, listener as (...args: any[]) => void)
  }

  // ── Utilitaires ──────────────────────────────────────────────────────────

  /** Nombre de listeners actifs par type */
  listenerCounts(): Record<string, number> {
    const events: TelemetryEventType[] = [
      'span:start', 'span:end', 'span:error',
      'metrics:update', 'calibration:done', 'yoyo:detected',
    ]
    return Object.fromEntries(
      events.map(e => [e, this.listenerCount(e)])
    )
  }
}

// ── Singleton global ──────────────────────────────────────────────────────────

export const traceBus = new TraceBusImpl()
export type  { TraceBusImpl as TraceBus }

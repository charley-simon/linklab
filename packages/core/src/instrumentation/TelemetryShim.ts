/**
 * TelemetryShim.ts — Pont opt-in entre @linklab/core et @linklab/telemetry
 *
 * @linklab/core ne dépend PAS de @linklab/telemetry.
 *
 * Deux modes d'activation :
 *
 * 1. INJECTION (recommandé, toujours fiable) :
 *    L'appelant qui connaît les deux packages injecte les modules directement.
 *    Utilisé dans les tests (@linklab/telemetry) et en production (Netflix-backend).
 *
 *      import { injectTelemetry } from '@linklab/core'
 *      import { SpanBuilder, traceBus } from '@linklab/telemetry'
 *      injectTelemetry({ SpanBuilder, traceBus })
 *
 * 2. PRELOAD (production uniquement) :
 *    Import dynamique — fonctionne si @linklab/telemetry est installé ET
 *    accessible depuis le même module resolver que @linklab/core.
 *    Ne pas utiliser dans les tests (résolution cross-package impossible sous Vitest).
 *
 *      import { preloadTelemetry } from '@linklab/core'
 *      await preloadTelemetry()
 *
 * Sans activation → toutes les opérations sont des no-ops silencieux.
 */

// ── Types minimaux inlinés — pas d'import depuis @linklab/telemetry ───────────

interface MinimalSpanBuilder {
  stepStart(step: string): this
  stepEnd(step: string): this
  addCacheEvent(event: {
    level: 'L1' | 'L2' | 'MISS'
    hit: boolean
    entity?: string
    promoted: boolean
    yoyo?: boolean
  }): this
  end(opts: { rowCount: number }): MinimalSpan
  endWithError(err: Error, state: MinimalEngineState): MinimalSpan
  withPath?(path: string[]): this
  withFilters?(filters: Record<string, any>): this
  readonly routeKey: string
}

interface MinimalSpan {
  spanId: string
  traceId: string
  timestamp: number
  trail: string
  from: string
  to: string
  path: string[]
  filters: Record<string, any>
  timings: any[]
  totalMs: number
  cacheEvents: any[]
  rowCount: number
  error?: any
  metrics?: any
}

interface MinimalEngineState {
  compiledGraphHash: string
  weights: Record<string, number>
  cacheState: {
    l1HitRate: number
    l2HitRate: number
    globalHitRate: number
    yoyoEvents: number
  }
}

export interface TelemetryModule {
  SpanBuilder: {
    start(opts: { trail: string; from: string; to: string; traceId?: string }): MinimalSpanBuilder
  }
  traceBus: {
    emit(event: 'span:end' | 'span:error', span: MinimalSpan): void
  }
}

// ── Registre interne ──────────────────────────────────────────────────────────

let _module: TelemetryModule | null = null
let _attempted = false

// ── API d'injection ───────────────────────────────────────────────────────────

/**
 * Injecte les composants de @linklab/telemetry dans le shim.
 * Méthode universelle — fonctionne dans tous les contextes (tests, prod).
 * Prend effet immédiatement et de manière synchrone.
 */
export function injectTelemetry(module: TelemetryModule): void {
  _module = module
  _attempted = true // bloquer tout preloadTelemetry() ultérieur
}

/**
 * Réinitialise le shim — utile pour les tests d'isolation.
 */
export function resetTelemetry(): void {
  _module = null
  _attempted = false
}

/**
 * Précharge le module telemetry via import dynamique.
 * Uniquement pour la production (Netflix-backend) où les deux packages
 * partagent le même module resolver Node.js.
 * Ne pas utiliser dans les tests — préférer injectTelemetry().
 */
export async function preloadTelemetry(): Promise<void> {
  if (_attempted) return
  _attempted = true
  try {
    const specifier = '@linklab/telemetry'
    const mod = await new Function('s', 'return import(s)')(specifier)
    _module = mod as TelemetryModule
  } catch {
    _module = null
  }
}

// ── API du shim ───────────────────────────────────────────────────────────────

export const shim = {
  startSpan(opts: {
    trail: string
    from: string
    to: string
    traceId?: string
    path?: string[]
    filters?: Record<string, any>
  }): MinimalSpanBuilder | null {
    if (!_module) return null
    try {
      const builder = _module.SpanBuilder.start({
        trail: opts.trail,
        from: opts.from,
        to: opts.to,
        traceId: opts.traceId
      })
      if (opts.path) builder.withPath?.(opts.path)
      if (opts.filters) builder.withFilters?.(opts.filters)
      return builder
    } catch {
      return null
    }
  },

  emitEnd(span: MinimalSpan): void {
    if (!_module) return
    try {
      _module.traceBus.emit('span:end', span)
    } catch {}
  },

  emitError(span: MinimalSpan): void {
    if (!_module) return
    try {
      _module.traceBus.emit('span:error', span)
    } catch {}
  },

  get active(): boolean {
    return _module !== null
  }
}

export type { MinimalSpanBuilder, MinimalSpan, MinimalEngineState }

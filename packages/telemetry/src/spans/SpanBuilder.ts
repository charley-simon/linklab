/**
 * SpanBuilder.ts — Construction fluente d'un Span
 *
 * Utilisé dans LinkLab (QueryEngine, PathFinder) et Netflix-backend
 * pour construire le contexte d'exécution sans boilerplate.
 *
 * Usage (dans QueryEngine) :
 *
 *   const span = SpanBuilder
 *     .start({ trail: 'movies(278).people', from: 'movies', to: 'people' })
 *     .withFilters({ id: 278 })
 *     .withPath(['movies', 'credits', 'people'])
 *
 *   span.stepStart('PathFinder')
 *   // ... calcul du chemin ...
 *   span.stepEnd('PathFinder')
 *
 *   span.addCacheEvent({ level: 'L1', hit: true, entity: 'movies:278', promoted: false })
 *
 *   const finishedSpan = span.end({ rowCount: 13 })
 *   traceBus.emit('span:end', finishedSpan)
 */

import { randomUUID }  from 'node:crypto'
import type {
  Span,
  StepTiming,
  CacheEvent,
  SpanError,
  EngineState,
}                      from '../types.js'

// ── SpanBuilder ───────────────────────────────────────────────────────────────

export class SpanBuilder {
  private readonly spanId:    string
  private readonly traceId:   string
  private readonly timestamp: number

  private trail   = ''
  private from    = ''
  private to      = ''
  private path:   string[] = []
  private filters: Record<string, any> = {}

  private timings:     StepTiming[]  = []
  private cacheEvents: CacheEvent[]  = []
  private stepStarts:  Map<string, number> = new Map()

  private constructor(traceId?: string) {
    this.spanId    = randomUUID()
    this.traceId   = traceId ?? randomUUID()
    this.timestamp = Date.now()
  }

  // ── Constructeur statique ─────────────────────────────────────────────────

  static start(opts: {
    trail:   string
    from:    string
    to:      string
    traceId?: string
  }): SpanBuilder {
    const builder  = new SpanBuilder(opts.traceId)
    builder.trail  = opts.trail
    builder.from   = opts.from
    builder.to     = opts.to
    return builder
  }

  // ── Configuration ─────────────────────────────────────────────────────────

  withFilters(filters: Record<string, any>): this {
    this.filters = { ...filters }
    return this
  }

  withPath(path: string[]): this {
    this.path = [...path]
    return this
  }

  // ── Timings par étape ─────────────────────────────────────────────────────

  stepStart(step: StepTiming['step']): this {
    this.stepStarts.set(step, Date.now())
    return this
  }

  stepEnd(step: StepTiming['step']): this {
    const start = this.stepStarts.get(step)
    if (start !== undefined) {
      this.timings.push({
        step,
        startedAt:  start,
        durationMs: Date.now() - start,
      })
      this.stepStarts.delete(step)
    }
    return this
  }

  // ── Cache events ──────────────────────────────────────────────────────────

  addCacheEvent(event: CacheEvent): this {
    this.cacheEvents.push(event)
    return this
  }

  // ── Finalisation ─────────────────────────────────────────────────────────

  /**
   * Termine le span avec succès.
   * Émet automatiquement le timing Total.
   */
  end(opts: { rowCount: number }): Span {
    const totalMs = Date.now() - this.timestamp

    return {
      spanId:      this.spanId,
      traceId:     this.traceId,
      timestamp:   this.timestamp,
      trail:       this.trail,
      from:        this.from,
      to:          this.to,
      path:        this.path,
      filters:     this.filters,
      timings:     [
        ...this.timings,
        { step: 'Total', startedAt: this.timestamp, durationMs: totalMs },
      ],
      totalMs,
      cacheEvents: this.cacheEvents,
      rowCount:    opts.rowCount,
    }
  }

  /**
   * Termine le span avec une erreur.
   * Capture l'état du moteur au moment de l'erreur.
   */
  endWithError(err: Error, engineState: EngineState): Span {
    const totalMs = Date.now() - this.timestamp

    const spanError: SpanError = {
      message:     err.message,
      stack:       err.stack,
      type:        err.constructor.name,
      engineState,
    }

    return {
      spanId:      this.spanId,
      traceId:     this.traceId,
      timestamp:   this.timestamp,
      trail:       this.trail,
      from:        this.from,
      to:          this.to,
      path:        this.path,
      filters:     this.filters,
      timings:     [
        ...this.timings,
        { step: 'Total', startedAt: this.timestamp, durationMs: totalMs },
      ],
      totalMs,
      cacheEvents: this.cacheEvents,
      rowCount:    0,
      error:       spanError,
    }
  }

  // ── Getters utilitaires ───────────────────────────────────────────────────

  get id():      string { return this.spanId  }
  get tid():     string { return this.traceId }
  get routeKey(): string { return `${this.from}→${this.to}` }
}

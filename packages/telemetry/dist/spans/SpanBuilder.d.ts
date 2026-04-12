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
import type { Span, StepTiming, CacheEvent, EngineState } from '../types.js';
export declare class SpanBuilder {
    private readonly spanId;
    private readonly traceId;
    private readonly timestamp;
    private trail;
    private from;
    private to;
    private path;
    private filters;
    private timings;
    private cacheEvents;
    private stepStarts;
    private constructor();
    static start(opts: {
        trail: string;
        from: string;
        to: string;
        traceId?: string;
    }): SpanBuilder;
    withFilters(filters: Record<string, any>): this;
    withPath(path: string[]): this;
    stepStart(step: StepTiming['step']): this;
    stepEnd(step: StepTiming['step']): this;
    addCacheEvent(event: CacheEvent): this;
    /**
     * Termine le span avec succès.
     * Émet automatiquement le timing Total.
     */
    end(opts: {
        rowCount: number;
    }): Span;
    /**
     * Termine le span avec une erreur.
     * Capture l'état du moteur au moment de l'erreur.
     */
    endWithError(err: Error, engineState: EngineState): Span;
    get id(): string;
    get tid(): string;
    get routeKey(): string;
}
//# sourceMappingURL=SpanBuilder.d.ts.map
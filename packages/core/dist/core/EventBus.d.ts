/**
 * EventBus — Bus générique pour hooks, events et errors
 *
 * Trois bus distincts, trois contrats clairs :
 *
 *   HookBus    — awaitable, peut modifier/annuler le flux
 *   EventBus   — fire-and-forget, observationnel, ne bloque pas
 *   ErrorBus   — synchrone, jamais silencieux
 *
 * Usage :
 *   const bus = new EventBus<MyEvents>()
 *   bus.on('traversal.complete', handler)
 *   bus.emit('traversal.complete', data)
 *   bus.off('traversal.complete', handler)
 */
export type Handler<T = any> = (data: T) => void;
export type AsyncHandler<T = any, R = T | void> = (data: T) => Promise<R> | R;
export declare class EventBus<TEvents extends Record<string, any> = Record<string, any>> {
    private handlers;
    on<K extends keyof TEvents & string>(event: K, handler: Handler<TEvents[K]>): () => void;
    off<K extends keyof TEvents & string>(event: K, handler: Handler<TEvents[K]>): void;
    emit<K extends keyof TEvents & string>(event: K, data: TEvents[K]): void;
    clear(event?: string): void;
    listenerCount(event: string): number;
}
export interface HookResult<T> {
    value: T;
    cancelled?: boolean;
    reason?: string;
}
export declare class HookBus<THooks extends Record<string, any> = Record<string, any>> {
    private handlers;
    on<K extends keyof THooks & string>(hook: K, handler: AsyncHandler<THooks[K]>): () => void;
    off<K extends keyof THooks & string>(hook: K, handler: AsyncHandler<THooks[K]>): void;
    /**
     * Appelle les handlers en séquence.
     * Chaque handler peut retourner une valeur modifiée — elle est passée au suivant.
     * Si un handler retourne { cancelled: true }, la chaîne s'arrête.
     */
    call<K extends keyof THooks & string>(hook: K, data: THooks[K]): Promise<HookResult<THooks[K]>>;
    listenerCount(hook: string): number;
}
export declare class ErrorBus<TErrors extends Record<string, any> = Record<string, any>> {
    private handlers;
    private fallback?;
    /**
     * Handler de fallback si aucun handler n'est enregistré pour cette erreur.
     * Par défaut : console.error.
     */
    setFallback(fn: (event: string, data: any) => void): void;
    on<K extends keyof TErrors & string>(event: K, handler: Handler<TErrors[K]>): () => void;
    off<K extends keyof TErrors & string>(event: K, handler: Handler<TErrors[K]>): void;
    emit<K extends keyof TErrors & string>(event: K, data: TErrors[K]): void;
    listenerCount(event: string): number;
}
//# sourceMappingURL=EventBus.d.ts.map
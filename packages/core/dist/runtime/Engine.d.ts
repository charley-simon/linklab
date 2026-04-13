/**
 * Engine - Core runtime engine with LRU cache
 *
 * Bus exposés :
 *   engine.events  — cache.hit, cache.miss
 *   engine.errors  — (extensible)
 */
import type { Provider, EngineConfig, CacheStats } from '../types/index.js';
import { EventBus, ErrorBus } from '../core/EventBus.js';
import type { CacheHitPayload, CacheMissPayload, GraphErrors } from '../core/GraphEvents.js';
interface EngineEventMap {
    'cache.hit': CacheHitPayload;
    'cache.miss': CacheMissPayload;
}
export declare class Engine {
    private provider;
    maxSize: number;
    private cache;
    private hits;
    private misses;
    readonly events: EventBus<EngineEventMap>;
    readonly errors: ErrorBus<GraphErrors>;
    constructor(provider: Provider, config?: EngineConfig);
    get<T = any>(key: string, fetcher: () => Promise<T>): Promise<T>;
    set<T = any>(key: string, value: T): void;
    private evictIfNeeded;
    clearCache(): void;
    getStats(): CacheStats;
    private getCurrentSize;
    private estimateSize;
    private formatSize;
    query<T = any>(sql: string, params?: any[]): Promise<T[]>;
    close(): Promise<void>;
}
export {};
//# sourceMappingURL=Engine.d.ts.map
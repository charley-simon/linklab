/**
 * Engine - Core runtime engine with LRU cache
 *
 * Bus exposés :
 *   engine.events  — cache.hit, cache.miss
 *   engine.errors  — (extensible)
 */
import { EventBus, ErrorBus } from '../core/EventBus.js';
export class Engine {
    provider;
    maxSize;
    cache;
    hits;
    misses;
    // ── Bus ──────────────────────────────────────────────────────
    events;
    errors;
    constructor(provider, config = {}) {
        this.provider = provider;
        this.maxSize = config.cache?.maxSize ?? 10 * 1024 * 1024;
        this.cache = new Map();
        this.hits = 0;
        this.misses = 0;
        this.events = new EventBus();
        this.errors = new ErrorBus();
    }
    async get(key, fetcher) {
        const cached = this.cache.get(key);
        if (cached) {
            this.hits++;
            cached.accessCount++;
            cached.lastAccess = Date.now();
            // ── Event : cache.hit ──────────────────────────────────
            this.events.emit('cache.hit', {
                key,
                accessCount: cached.accessCount,
            });
            return cached.value;
        }
        this.misses++;
        // ── Event : cache.miss ─────────────────────────────────
        this.events.emit('cache.miss', {
            key,
            requestedAt: Date.now(),
        });
        const value = await fetcher();
        this.set(key, value);
        return value;
    }
    set(key, value) {
        const size = this.estimateSize(value);
        this.evictIfNeeded(size);
        this.cache.set(key, {
            key,
            value,
            size,
            accessCount: 1,
            lastAccess: Date.now(),
        });
        const formatted = this.formatSize(size);
        const maxFormatted = this.formatSize(this.maxSize);
        console.log(`💾 RAM CACHED: ${key} (${formatted}/${maxFormatted})`);
    }
    evictIfNeeded(neededSize) {
        const currentSize = this.getCurrentSize();
        if (currentSize + neededSize <= this.maxSize)
            return;
        const entries = Array.from(this.cache.values()).sort((a, b) => {
            const scoreA = a.accessCount * 1000 + a.lastAccess;
            const scoreB = b.accessCount * 1000 + b.lastAccess;
            return scoreA - scoreB;
        });
        let freedSize = 0;
        for (const entry of entries) {
            if (currentSize - freedSize + neededSize <= this.maxSize)
                break;
            this.cache.delete(entry.key);
            freedSize += entry.size;
            console.log(`🗑️  RAM EVICTED: ${entry.key}`);
        }
    }
    clearCache() {
        this.cache.clear();
        this.hits = 0;
        this.misses = 0;
        console.log('💾 RAM CLEARED');
    }
    getStats() {
        const size = this.getCurrentSize();
        const totalAccesses = this.hits + this.misses;
        const hitRate = totalAccesses > 0
            ? ((this.hits / totalAccesses) * 100).toFixed(1) + '%'
            : '0%';
        return {
            entries: this.cache.size,
            size,
            sizeFormatted: this.formatSize(size),
            maxSize: this.maxSize,
            usage: ((size / this.maxSize) * 100).toFixed(1) + '%',
            hits: this.hits,
            misses: this.misses,
            hitRate,
        };
    }
    getCurrentSize() {
        let total = 0;
        for (const entry of this.cache.values())
            total += entry.size;
        return total;
    }
    estimateSize(obj) {
        return JSON.stringify(obj).length;
    }
    formatSize(bytes) {
        if (bytes < 1024)
            return `${bytes} B`;
        if (bytes < 1024 * 1024)
            return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    }
    async query(sql, params = []) {
        return this.provider.query(sql, params);
    }
    async close() {
        await this.provider.close();
    }
}
//# sourceMappingURL=Engine.js.map
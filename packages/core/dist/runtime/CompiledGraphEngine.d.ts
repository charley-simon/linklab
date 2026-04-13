/**
 * CompiledGraphEngine - Production engine using precompiled graph
 *
 * - O(1) route lookup
 * - Automatic fallback
 * - Live metrics
 * - Hot reload support
 */
import type { CompiledGraph, Provider } from '../types/index.js';
interface LiveMetrics {
    path: string[];
    executions: number;
    successes: number;
    failures: number;
    totalTime: number;
    avgTime: number;
}
export declare class CompiledGraphEngine {
    private compiled;
    private provider;
    private liveMetrics;
    private routeCache;
    constructor(compiled: CompiledGraph, provider: Provider);
    /**
     * Build fast lookup cache
     */
    private buildRouteCache;
    /**
     * Execute query from -> to
     */
    query(from: string, to: string, data?: Record<string, any>): Promise<any[]>;
    /**
     * Execute path with JOINs
     */
    private executePath;
    /**
     * Find edge between nodes
     */
    private findEdge;
    /**
     * Fallback to alternative paths
     */
    private fallback;
    /**
     * Update live metrics
     */
    private updateMetrics;
    /**
     * Consider promoting a fallback to primary
     */
    private considerPromotion;
    /**
     * Get live statistics
     */
    getStats(): {
        totalExecutions: number;
        totalSuccesses: number;
        successRate: string;
        avgTime: string;
        uniquePaths: number;
        fastest?: LiveMetrics;
        slowest?: LiveMetrics;
    };
    /**
     * Export metrics for recompilation
     */
    exportMetrics(): Map<string, LiveMetrics>;
    /**
     * Hot reload compiled graph
     */
    reload(compiled: CompiledGraph): void;
}
export {};
//# sourceMappingURL=CompiledGraphEngine.d.ts.map
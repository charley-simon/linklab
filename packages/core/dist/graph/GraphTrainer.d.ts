/**
 * GraphTrainer - Trains graph with real use cases
 *
 * Benchmarks all paths and assigns weights based on actual performance
 */
import type { Graph, UseCase, MetricsMap, TrainingMetrics, Provider } from '../types/index.js';
export declare class GraphTrainer {
    private graph;
    private provider;
    private metrics;
    constructor(graph: Graph, provider: Provider);
    /**
     * Train graph with use cases
     */
    train(useCases: UseCase[]): Promise<MetricsMap>;
    /**
     * Train single use case
     */
    private trainUseCase;
    /**
     * Benchmark a specific path
     */
    private benchmarkPath;
    /**
     * Build SQL query for a path
     */
    private buildQuery;
    /**
     * Update graph weights based on metrics
     */
    updateWeights(): void;
    /**
     * Check if path uses edge
     */
    private pathUsesEdge;
    /**
     * Get training statistics
     */
    getStats(): {
        total: number;
        successful: number;
        failed: number;
        avgTime: number;
        fastest: TrainingMetrics | undefined;
        slowest: TrainingMetrics | undefined;
    };
    /**
     * Get metrics map
     */
    getMetrics(): MetricsMap;
}
//# sourceMappingURL=GraphTrainer.d.ts.map
/**
 * GraphTrainer - Trains graph with real use cases
 *
 * Benchmarks all paths and assigns weights based on actual performance
 */
import { PathFinder } from '../core/PathFinder.js';
export class GraphTrainer {
    graph;
    provider;
    metrics;
    constructor(graph, provider) {
        this.graph = graph;
        this.provider = provider;
        this.metrics = new Map();
    }
    /**
     * Train graph with use cases
     */
    async train(useCases) {
        console.log(`🎓 Training graph with ${useCases.length} use cases...\n`);
        for (const [index, useCase] of useCases.entries()) {
            console.log(`   [${index + 1}/${useCases.length}] ${useCase.description}`);
            await this.trainUseCase(useCase);
        }
        console.log('\n✅ Training complete');
        console.log(`   Tested ${this.metrics.size} unique paths`);
        return this.metrics;
    }
    /**
     * Train single use case
     */
    async trainUseCase(useCase) {
        const { from, to, sampleData } = useCase;
        // Find all paths
        const finder = new PathFinder(this.graph);
        const paths = finder.findAllPaths(from, to);
        console.log(`      Found ${paths.length} possible paths`);
        // Benchmark each path
        for (const path of paths) {
            await this.benchmarkPath(path, sampleData);
        }
    }
    /**
     * Benchmark a specific path
     */
    async benchmarkPath(path, sampleData) {
        const pathKey = path.join('→');
        try {
            // Build SQL query
            const query = this.buildQuery(path, sampleData);
            // Execute multiple times for average
            const iterations = 3;
            const times = [];
            for (let i = 0; i < iterations; i++) {
                const start = performance.now();
                await this.provider.query(query.sql, query.params);
                const duration = performance.now() - start;
                times.push(duration);
            }
            const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
            const minTime = Math.min(...times);
            const maxTime = Math.max(...times);
            // Store metrics
            if (!this.metrics.has(pathKey)) {
                this.metrics.set(pathKey, {
                    path,
                    executions: 0,
                    successes: 0,
                    failures: 0,
                    totalTime: 0,
                    avgTime: 0,
                    minTime: Infinity,
                    maxTime: 0,
                    used: true
                });
            }
            const metric = this.metrics.get(pathKey);
            metric.executions += iterations;
            metric.successes = (metric.successes || 0) + iterations;
            metric.totalTime += avgTime * iterations;
            metric.avgTime = metric.totalTime / metric.executions;
            metric.minTime = Math.min(metric.minTime, minTime);
            metric.maxTime = Math.max(metric.maxTime, maxTime);
            console.log(`      ✓ ${pathKey}: ${avgTime.toFixed(2)}ms avg`);
        }
        catch (err) {
            console.log(`      ✗ ${pathKey}: Failed - ${err.message}`);
            // Mark as failed
            this.metrics.set(pathKey, {
                path,
                executions: 0,
                totalTime: 0,
                avgTime: 0,
                minTime: 0,
                maxTime: 0,
                used: false,
                failed: true,
                error: err.message
            });
        }
    }
    /**
     * Build SQL query for a path
     */
    buildQuery(path, sampleData) {
        // Start with first table
        let sql = `SELECT * FROM ${path[0]}`;
        const params = [];
        // Add JOINs
        for (let i = 1; i < path.length; i++) {
            const from = path[i - 1];
            const to = path[i];
            // Find edge
            const edge = this.graph.edges.find(e => e.from === from && e.to === to);
            if (edge) {
                sql += ` JOIN ${to} ON ${from}.${edge.via} = ${to}.id`;
            }
        }
        // Add WHERE if sample data provided
        if (sampleData?.id) {
            sql += ` WHERE ${path[0]}.id = $${params.length + 1}`;
            params.push(sampleData.id);
        }
        // Limit for safety
        sql += ' LIMIT 100';
        return { sql, params };
    }
    /**
     * Update graph weights based on metrics
     */
    updateWeights() {
        console.log('📊 Updating graph weights based on metrics...');
        let updated = 0;
        for (const edge of this.graph.edges) {
            // Find all paths using this edge
            const pathsWithEdge = Array.from(this.metrics.values()).filter(m => !m.failed && this.pathUsesEdge(m.path, edge));
            if (pathsWithEdge.length === 0)
                continue;
            // Calculate new weight (average time)
            const avgTime = pathsWithEdge.reduce((sum, m) => sum + m.avgTime, 0) / pathsWithEdge.length;
            // Normalize to 0-100 scale
            const newWeight = Math.min(100, avgTime);
            if (edge.weight !== newWeight) {
                edge.weight = newWeight;
                updated++;
            }
        }
        console.log(`   Updated ${updated} edge weights`);
    }
    /**
     * Check if path uses edge
     */
    pathUsesEdge(path, edge) {
        for (let i = 0; i < path.length - 1; i++) {
            if (path[i] === edge.from && path[i + 1] === edge.to) {
                return true;
            }
        }
        return false;
    }
    /**
     * Get training statistics
     */
    getStats() {
        const successful = Array.from(this.metrics.values()).filter(m => !m.failed);
        const failed = Array.from(this.metrics.values()).filter(m => m.failed);
        const avgTime = successful.length > 0
            ? successful.reduce((sum, m) => sum + m.avgTime, 0) / successful.length
            : 0;
        const fastest = successful.reduce((min, m) => (!min || m.avgTime < min.avgTime ? m : min), undefined);
        const slowest = successful.reduce((max, m) => (!max || m.avgTime > max.avgTime ? m : max), undefined);
        return {
            total: this.metrics.size,
            successful: successful.length,
            failed: failed.length,
            avgTime,
            fastest,
            slowest
        };
    }
    /**
     * Get metrics map
     */
    getMetrics() {
        return this.metrics;
    }
}
//# sourceMappingURL=GraphTrainer.js.map
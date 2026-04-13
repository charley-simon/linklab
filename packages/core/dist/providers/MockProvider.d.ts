/**
 * MockProvider - In-memory provider for testing
 */
import type { Provider } from '../types/index.js';
export declare class MockProvider implements Provider {
    private data;
    constructor();
    /**
     * Set mock data for a table
     */
    setData(table: string, rows: any[]): void;
    /**
     * Execute query (simplified parsing)
     */
    query<T = any>(sql: string, params?: any[]): Promise<T[]>;
    /**
     * Close (no-op for mock)
     */
    close(): Promise<void>;
    /**
     * Clear all data
     */
    clear(): void;
    /**
     * Get data for a table
     */
    getData(table: string): any[] | undefined;
}
//# sourceMappingURL=MockProvider.d.ts.map
/**
 * PostgresProvider - PostgreSQL database provider with JSON fallback
 *
 * Dual-mode: real PostgreSQL or mock JSON files
 */
import type { Provider, ProviderConfig } from '../types/index.js';
interface PostgresConfig extends ProviderConfig {
    host?: string;
    port?: number;
    user?: string;
    password?: string;
    connectionString?: string;
}
export declare class PostgresProvider implements Provider {
    private useMock;
    private pool;
    private dbPath;
    private tables;
    constructor(config: PostgresConfig);
    /**
     * Load tables from JSON files (mock mode)
     */
    private loadTables;
    /**
     * Execute query
     */
    query<T = any>(sql: string, params?: any[]): Promise<T[]>;
    /**
     * Execute query in mock mode
     */
    private queryMock;
    /**
     * Close connection
     */
    close(): Promise<void>;
    /**
     * Save data (mock mode only)
     */
    save(tableName: string, data: any[]): Promise<void>;
    /**
     * Get table data (mock mode only)
     */
    getTable(tableName: string): any[] | undefined;
}
export {};
//# sourceMappingURL=PostgresProvider.d.ts.map
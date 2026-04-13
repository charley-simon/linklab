/**
 * PostgresProvider - PostgreSQL database provider with JSON fallback
 *
 * Dual-mode: real PostgreSQL or mock JSON files
 */
import { ProviderError } from '../types/index.js';
import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';
export class PostgresProvider {
    useMock;
    pool = null;
    dbPath;
    tables;
    constructor(config) {
        this.useMock = config.mock ?? false;
        console.log(' useMock: ', this.useMock);
        this.dbPath = config.database ? `./db/postgres/${config.database}` : './db/postgres';
        this.tables = new Map();
        if (!this.useMock) {
            try {
                // Try to load pg module
                // const { Pool } = require('pg')
                this.pool = new Pool({
                    host: config.host ?? 'localhost',
                    port: config.port ?? 5432,
                    database: config.database,
                    user: config.user ?? 'postgres',
                    password: config.password,
                    connectionString: config.connectionString
                });
                console.log(`🐘 Postgres connected: ${config.database}`);
            }
            catch (err) {
                console.warn('⚠️  pg module not found, falling back to mock mode');
                this.useMock = true;
            }
        }
        if (this.useMock) {
            console.log(`🐘 Postgres connected (MOCK mode): ${config.database}`);
            this.loadTables();
        }
    }
    /**
     * Load tables from JSON files (mock mode)
     */
    loadTables() {
        if (!fs.existsSync(this.dbPath)) {
            this.tables = new Map();
            return;
        }
        const files = fs.readdirSync(this.dbPath);
        for (const file of files) {
            if (file.endsWith('.json')) {
                const tableName = file.replace('.json', '');
                const content = fs.readFileSync(path.join(this.dbPath, file), 'utf-8');
                this.tables.set(tableName, JSON.parse(content));
            }
        }
    }
    /**
     * Execute query
     */
    async query(sql, params = []) {
        if (this.useMock) {
            return this.queryMock(sql, params);
        }
        if (!this.pool) {
            throw new ProviderError('PostgreSQL pool not initialized');
        }
        try {
            console.log('🐘 Postgres:', sql);
            if (params.length > 0) {
                console.log('   Params:', params);
            }
            const result = await this.pool.query(sql, params);
            console.log(`✅ Postgres result: ${result.rows.length} rows`);
            return result.rows;
        }
        catch (err) {
            throw new ProviderError(`PostgreSQL query failed: ${err.message}`, {
                sql,
                params,
                error: err
            });
        }
    }
    /**
     * Execute query in mock mode
     */
    async queryMock(sql, params) {
        console.log('🐘 Postgres:', sql);
        if (params.length > 0) {
            console.log('   Params:', params);
        }
        // Parse SQL (simplified)
        const selectMatch = sql.match(/SELECT .* FROM (\w+)/i);
        if (!selectMatch) {
            console.log('✅ Postgres result (MOCK): 0 rows');
            return [];
        }
        const tableName = selectMatch[1];
        const data = this.tables.get(tableName) || [];
        // Apply WHERE clause (simplified)
        let filtered = data;
        const whereMatch = sql.match(/WHERE (\w+)\.(\w+) = \$(\d+)/i);
        if (whereMatch && params.length > 0) {
            const column = whereMatch[2];
            const paramIndex = parseInt(whereMatch[3]) - 1;
            const value = params[paramIndex];
            filtered = data.filter((row) => row[column] === value);
        }
        console.log(`✅ Postgres result (MOCK): ${filtered.length} rows`);
        return filtered;
    }
    /**
     * Close connection
     */
    async close() {
        if (this.pool) {
            await this.pool.end();
            console.log('🐘 Postgres closed');
        }
        else {
            console.log('🐘 Postgres closed');
        }
    }
    /**
     * Save data (mock mode only)
     */
    async save(tableName, data) {
        if (!this.useMock) {
            throw new ProviderError('Save only available in mock mode');
        }
        if (!fs.existsSync(this.dbPath)) {
            fs.mkdirSync(this.dbPath, { recursive: true });
        }
        const filepath = path.join(this.dbPath, `${tableName}.json`);
        fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
        this.tables.set(tableName, data);
    }
    /**
     * Get table data (mock mode only)
     */
    getTable(tableName) {
        if (!this.useMock) {
            throw new ProviderError('getTable only available in mock mode');
        }
        return this.tables.get(tableName);
    }
}
//# sourceMappingURL=PostgresProvider.js.map
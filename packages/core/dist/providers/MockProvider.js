/**
 * MockProvider - In-memory provider for testing
 */
export class MockProvider {
    data;
    constructor() {
        this.data = new Map();
    }
    /**
     * Set mock data for a table
     */
    setData(table, rows) {
        this.data.set(table, rows);
    }
    /**
     * Execute query (simplified parsing)
     */
    async query(sql, params = []) {
        // Parse table name
        const selectMatch = sql.match(/SELECT .* FROM (\w+)/i);
        if (!selectMatch) {
            return [];
        }
        const tableName = selectMatch[1];
        const data = this.data.get(tableName) || [];
        // Apply WHERE clause (simplified)
        let filtered = data;
        const whereMatch = sql.match(/WHERE (\w+) = \?/i);
        if (whereMatch && params.length > 0) {
            const column = whereMatch[1];
            const value = params[0];
            filtered = data.filter((row) => row[column] === value);
        }
        return filtered;
    }
    /**
     * Close (no-op for mock)
     */
    async close() {
        // No-op
    }
    /**
     * Clear all data
     */
    clear() {
        this.data.clear();
    }
    /**
     * Get data for a table
     */
    getData(table) {
        return this.data.get(table);
    }
}
//# sourceMappingURL=MockProvider.js.map
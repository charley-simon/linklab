/**
 * MockProvider - In-memory provider for testing
 */

import type { Provider } from '../types/index.js'

export class MockProvider implements Provider {
  private data: Map<string, any[]>

  constructor() {
    this.data = new Map()
  }

  /**
   * Set mock data for a table
   */
  setData(table: string, rows: any[]): void {
    this.data.set(table, rows)
  }

  /**
   * Execute query (simplified parsing)
   */
  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    // Parse table name
    const selectMatch = sql.match(/SELECT .* FROM (\w+)/i)
    if (!selectMatch) {
      return []
    }

    const tableName = selectMatch[1]
    const data = this.data.get(tableName) || []

    // Apply WHERE clause (simplified)
    let filtered = data

    const whereMatch = sql.match(/WHERE (\w+) = \?/i)
    if (whereMatch && params.length > 0) {
      const column = whereMatch[1]
      const value = params[0]

      filtered = data.filter((row: any) => row[column] === value)
    }

    return filtered as T[]
  }

  /**
   * Close (no-op for mock)
   */
  async close(): Promise<void> {
    // No-op
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.data.clear()
  }

  /**
   * Get data for a table
   */
  getData(table: string): any[] | undefined {
    return this.data.get(table)
  }
}

import fs from 'fs'
import type { Provider, TechnicalSchema, TechEntity, TechProperty } from '../types/index.js'

export class SchemaExtractor {
  constructor(private provider: Provider) {}

  async extract(databaseName: string): Promise<TechnicalSchema> {
    console.log(`🔍 Extraction du schéma technique pour : ${databaseName}`)

    const tables = await this.getTables()
    const entities: TechEntity[] = []

    for (const tableName of tables) {
      const properties = await this.getProperties(tableName)
      const rowCount = await this.getRowCount(tableName)

      entities.push({
        name: tableName,
        properties,
        rowCount
      })
    }

    const schema: TechnicalSchema = {
      source: {
        type: 'postgresql',
        name: databaseName,
        generatedAt: new Date().toISOString()
      },
      entities
    }

    fs.writeFileSync('./schema.json', JSON.stringify(schema, null, 2))
    return schema
  }

  private async getTables(): Promise<string[]> {
    const query = `
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `
    const rows = await this.provider.query<{ table_name: string }>(query)
    return rows.map(r => r.table_name)
  }

  private async getProperties(tableName: string): Promise<TechProperty[]> {
    const query = `
      SELECT
        cols.column_name as name,
        cols.data_type as type,
        -- Détection Primary Key
        EXISTS (
          SELECT 1 FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
          WHERE tc.table_name = cols.table_name AND kcu.column_name = cols.column_name
          AND tc.constraint_type = 'PRIMARY KEY'
        ) as is_pk,
        -- Détection Foreign Key Target
        ccu.table_name as fk_target_table,
        ccu.column_name as fk_target_column,
        -- Détection Index
        EXISTS (
          SELECT 1 FROM pg_index i
          JOIN pg_class c ON c.oid = i.indrelid
          JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(i.indkey)
          WHERE c.relname = cols.table_name AND a.attname = cols.column_name
        ) as is_indexed
      FROM information_schema.columns cols
      LEFT JOIN information_schema.key_column_usage kcu
        ON cols.table_name = kcu.table_name AND cols.column_name = kcu.column_name
      LEFT JOIN information_schema.referential_constraints rc
        ON kcu.constraint_name = rc.constraint_name
      LEFT JOIN information_schema.constraint_column_usage ccu
        ON rc.unique_constraint_name = ccu.constraint_name
      WHERE cols.table_name = $1
    `

    const rows = await this.provider.query<any>(query, [tableName])

    return rows.map(r => ({
      name: r.name,
      type: r.type,
      isPK: r.is_pk,
      isFK: !!r.fk_target_table,
      references: r.fk_target_table
        ? {
            table: r.fk_target_table,
            column: r.fk_target_column
          }
        : undefined,
      isIndexed: r.is_indexed
    }))
  }

  private async getRowCount(tableName: string): Promise<number> {
    const res = await this.provider.query<{ count: string }>(
      `SELECT reltuples::bigint as count FROM pg_class WHERE relname = $1`,
      [tableName]
    )
    return parseInt(res[0]?.count || '0', 10)
  }
}

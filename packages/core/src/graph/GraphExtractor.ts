import fs from 'fs'
import type {
  Graph,
  GraphNode,
  GraphEdge,
  Provider,
  Column,
  ActionRegistry
} from '../types/index.js'

interface TableInfo {
  name: string
  columns: Column[]
  rowCount: number
  description?: string
}

interface ForeignKeyInfo {
  fromTable: string
  toTable: string
  column: string
}

export class GraphExtractor {
  private provider: Provider
  private actionRegistry?: ActionRegistry

  constructor(provider: Provider, actionRegistry?: ActionRegistry) {
    this.provider = provider
    this.actionRegistry = actionRegistry
  }

  /**
   * Extrait le graphe complet : Tables + Actions + Relations
   */
  async extract(): Promise<Graph> {
    console.log('📊 LinkLab : Extraction du graphe sémantique...')

    // 1. Extraction des tables et leurs métadonnées
    const tables = await this.getTables()
    console.log(`   Found ${tables.length} tables`)

    // 2. Extraction des clés étrangères (Relations natives)
    const foreignKeys = await this.getForeignKeys()
    console.log(`   Found ${foreignKeys.length} foreign keys`)

    // 3. Construction des Nœuds (Tables)
    const nodes: GraphNode[] = tables.map(t => ({
      id: t.name,
      type: 'table' as const,
      columns: t.columns,
      rowCount: t.rowCount,
      description: t.description || ''
    }))

    // 4. Injection des Nœuds (Actions) - Si présentes dans le registre
    if (this.actionRegistry) {
      const actions = this.actionRegistry.getAll()
      actions.forEach(action => {
        nodes.push({
          id: action.id,
          type: 'action' as const,
          description: action.description || 'Action système',
          params: action.requiredParams
        })
      })
    }

    // 5. Construction des Edges (Liaisons)
    const edges: GraphEdge[] = foreignKeys.map(fk => ({
      name: `rel_${fk.fromTable}_${fk.toTable}`,
      from: fk.fromTable,
      to: fk.toTable,
      via: fk.column,
      type: 'foreign_key' as const,
      weight: this.calculateInitialWeight(fk, tables)
    }))

    const graph: Graph = { nodes, edges }

    console.log('✅ Graphe LinkLab extrait avec succès')
    fs.writeFileSync('./graph.json', JSON.stringify(graph, null, 2))

    return graph
  }

  private async getTables(): Promise<TableInfo[]> {
    // On récupère aussi la description de la table (COMMENT ON TABLE)
    const query = `
      SELECT
        t.table_name as name,
        obj_description(pgc.oid, 'pg_class') as description
      FROM information_schema.tables t
      JOIN pg_class pgc ON t.table_name = pgc.relname
      JOIN pg_namespace pgn ON pgc.relnamespace = pgn.oid
      WHERE t.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
        AND pgn.nspname = 'public'
    `

    const result = await this.provider.query<{ name: string; description: string }>(query)
    const tables: TableInfo[] = []

    for (const table of result) {
      const columns = await this.getColumns(table.name)
      const rowCount = await this.getRowCount(table.name)

      tables.push({
        name: table.name,
        columns,
        rowCount,
        description: table.description
      })
    }

    return tables
  }

  private async getColumns(tableName: string): Promise<Column[]> {
    // Récupère les colonnes ET leurs descriptions (COMMENT ON COLUMN)
    const query = `
      SELECT
        cols.column_name,
        cols.data_type,
        (SELECT pg_catalog.col_description(c.oid, cols.ordinal_position::int)
         FROM pg_catalog.pg_class c
         WHERE c.relname = cols.table_name) as description
      FROM information_schema.columns cols
      WHERE table_name = $1
    `

    const result = await this.provider.query<{
      column_name: string
      data_type: string
      description: string
    }>(query, [tableName])

    return result.map(c => ({
      name: c.column_name,
      type: c.data_type,
      description: c.description || ''
    }))
  }

  private async getRowCount(tableName: string): Promise<number> {
    try {
      const query = `SELECT reltuples::bigint as count FROM pg_class WHERE relname = $1`
      const result = await this.provider.query<{ count: string }>(query, [tableName])
      return parseInt(result[0]?.count || '0', 10)
    } catch {
      return 0
    }
  }

  private async getForeignKeys(): Promise<any[]> {
    const query = `
      SELECT
        tc.table_name as from_table,
        kcu.column_name as column,
        ccu.table_name as to_table,
        -- Vérifie si la colonne est unique ou PK pour la cardinalité
        (SELECT COUNT(*)
         FROM information_schema.table_constraints i_tc
         JOIN information_schema.key_column_usage i_kcu
           ON i_tc.constraint_name = i_kcu.constraint_name
         WHERE i_tc.table_name = tc.table_name
           AND i_kcu.column_name = kcu.column_name
           AND (i_tc.constraint_type = 'PRIMARY KEY' OR i_tc.constraint_type = 'UNIQUE')
        ) > 0 as is_unique
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
    `

    return await this.provider.query(query)
  }

  /**
   * Calcul du poids initial (Physique de la donnée)
   * On utilise le logarithme de la taille pour ne pas pénaliser trop lourdement
   * les grosses tables, mais garder une notion de "frais de déplacement".
   */
  private calculateInitialWeight(fk: ForeignKeyInfo, tables: TableInfo[]): number {
    const targetTable = tables.find(t => t.name === fk.toTable)
    if (!targetTable || targetTable.rowCount <= 0) return 1

    // Formule : 1 + log10(n) -> 100 lignes = poids 3, 1M lignes = poids 7.
    return 1 + Math.log10(targetTable.rowCount)
  }
}

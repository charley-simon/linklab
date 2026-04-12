/**
 * GraphAssembler — Dictionary → Graph V3
 *
 * Transforme le Dictionary produit par GraphBuilder
 * en Graph V3 (nodes + edges) prêt pour PathFinder.
 *
 * Corrige le bug d'itération : dictionary.tables est une Table[]
 * (liste), pas un Record<string, Table> (dictionnaire).
 */

import type { Dictionary, Graph, GraphNode, GraphEdge } from '../types/index.js'

export class GraphAssembler {

  assemble(dictionary: Dictionary): Graph {
    const nodes: GraphNode[] = []
    const edges: GraphEdge[] = []

    // 1. Tables → Nodes
    // dictionary.tables est une Table[] — itération sur les éléments, pas les indices
    for (const table of dictionary.tables) {
      nodes.push({
        id: table.name,
        type: 'table',
        rowCount: table.rowCount,
        columns: table.columns.map(c => ({ name: c, type: 'string' }))
      })
    }

    // 2. Relations → Edges
    for (const rel of dictionary.relations) {
      edges.push({
        name: rel.label,
        from: rel.from,
        to: rel.to,
        via: rel.via,
        weight: typeof rel.weight === 'string'
          ? parseFloat(rel.weight)
          : (rel.weight ?? 1),
        metadata: {
          type: rel.type,
          condition: rel.condition,
          metadataField: rel.metadataField
        }
      })
    }

    return { nodes, edges }
  }
}

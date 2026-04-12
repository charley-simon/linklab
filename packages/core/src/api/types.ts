/**
 * api/types.ts — Types publics de l'API LinkLab niveau 2+
 *
 * Ces types sont la surface visible pour les utilisateurs du moteur.
 * Les types internes (CompiledGraph, RouteInfo, etc.) restent dans types/index.ts.
 */

import type { GraphEdge } from '../types/index.js'

// ── Stratégies de pathfinding ────────────────────────────────────────────────

/**
 * Strategy — comment Dijkstra pondère les chemins.
 *
 * Shortest      : poids brut des arêtes — temps pur, distance minimale
 * Comfort       : pénalité par correspondance (+8 unités) — moins de changements
 * LeastHops     : favorise les chemins avec peu d'étapes
 * Custom(n)     : pénalité explicite par correspondance
 */
export type Strategy =
  | { type: 'Shortest' }
  | { type: 'Comfort' }
  | { type: 'LeastHops' }
  | { type: 'Custom'; transferPenalty: number }

// Factories — évitent les objets littéraux à l'usage
export const Strategy = {
  Shortest:  (): Strategy => ({ type: 'Shortest' }),
  Comfort:   (): Strategy => ({ type: 'Comfort' }),
  LeastHops: (): Strategy => ({ type: 'LeastHops' }),
  Custom:    (transferPenalty: number): Strategy => ({ type: 'Custom', transferPenalty }),

  toPenalty(s: Strategy): number {
    switch (s.type) {
      case 'Shortest':  return 0
      case 'Comfort':   return 8
      case 'LeastHops': return 50
      case 'Custom':    return s.transferPenalty
    }
  }
} as const

// ── Résultats de pathfinding ─────────────────────────────────────────────────

export interface PathStep {
  node:   string       // ID du node
  label?: string       // label lisible si présent dans le graph
  via?:   GraphEdge    // arête empruntée pour arriver ici (absente pour le premier node)
}

export interface ResolvedPath {
  nodes:  string[]     // séquence d'IDs : ['Pigalle', 'Liège', 'Europe', ...]
  steps:  PathStep[]   // version enrichie avec labels et arêtes
  weight: number       // poids total selon la stratégie appliquée
  hops:   number       // nombre d'arêtes traversées
}

export interface PathResult {
  from:  string
  to:    string
  found: boolean
  paths: ResolvedPath[]
}

// ── Résultats de navigation avec données ─────────────────────────────────────

/**
 * QueryResult — retourné par PathBuilder.execute()
 * Uniquement en mode données (netflix, dvdrental) — pas pour metro/musicians.
 */
export interface QueryResult<T = Record<string, any>> {
  from:    string
  to:      string
  filters: Record<string, any>
  data:    T[]
  path:    string[]
  timing:  number
}

// ── Options du PathBuilder ───────────────────────────────────────────────────

export interface PathBuilderOptions {
  maxPaths?:  number
  minHops?:   number
  maxHops?:   number
  via?:       string[]
  strategy?:  Strategy
}

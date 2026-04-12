/**
 * queries.ts — Requêtes métro Paris
 *
 * Remplace les config*.json éparpillés.
 * Chaque requête a un nom, une description, et des paramètres typés.
 *
 * Usage :
 *   tsx cli/run-scenario.ts scenarios/test-metro-paris --query chatelet-opera
 *   tsx cli/run-scenario.ts scenarios/test-metro-paris --query all
 */

import type { PathQuery } from '../../types/index.js'

export interface NamedQuery {
  name: string
  description: string
  query: PathQuery
}

export const metroQueries: NamedQuery[] = [

  // ============================================================
  // TRAJETS SIMPLES — Une seule ligne, pas de correspondance
  // ============================================================

  {
    name: 'chatelet-opera',
    description: 'Châtelet → Opéra (Ligne 7, 2 stations, ~3 min)',
    query: {
      from: 'Station-chatelet',
      to: 'Station-opera',
      maxPaths: 3
    }
  },

  {
    name: 'ligne1-terminus',
    description: 'La Défense → Château de Vincennes (Ligne 1 complète, ~45 min)',
    query: {
      from: 'Station-la-defense-grande-arche',
      to: 'Station-chateau-de-vincennes',
      maxPaths: 1
    }
  },

  {
    name: 'ligne4-nord-sud',
    description: 'Porte de Clignancourt → Mairie de Montrouge (Ligne 4 complète)',
    query: {
      from: 'Station-porte-de-clignancourt',
      to: 'Station-mairie-de-montrouge',
      maxPaths: 1
    }
  },

  // ============================================================
  // TRAJETS AVEC CORRESPONDANCES — Teste le pathfinder
  // ============================================================

  {
    name: 'republique-bastille',
    description: 'République → Bastille (plusieurs chemins via L5, L8, L9)',
    query: {
      from: 'Station-republique',
      to: 'Station-bastille',
      maxPaths: 5
    }
  },

  {
    name: 'gare-du-nord-montparnasse',
    description: 'Gare du Nord → Montparnasse (correspondance obligatoire)',
    query: {
      from: 'Station-gare-du-nord',
      to: 'Station-montparnasse-bienvenue',
      maxPaths: 3
    }
  },

  {
    name: 'defense-nation',
    description: 'La Défense → Nation (traversée Est-Ouest, Ligne 1)',
    query: {
      from: 'Station-la-defense-grande-arche',
      to: 'Station-nation',
      maxPaths: 3
    }
  },

  // ============================================================
  // TRAJETS COMPLEXES — Hubs majeurs, longue distance
  // ============================================================

  {
    name: 'saint-denis-chatillon',
    description: 'Saint-Denis Université → Châtillon-Montrouge (Ligne 13 complète)',
    query: {
      from: 'Station-saint-denis-universite',
      to: 'Station-chatillon-montrouge',
      maxPaths: 2
    }
  },

  {
    name: 'vincennes-defense',
    description: 'Château de Vincennes → La Défense (traversée complète Ligne 1)',
    query: {
      from: 'Station-chateau-de-vincennes',
      to: 'Station-la-defense-grande-arche',
      maxPaths: 1
    }
  },

  {
    name: 'clignancourt-vincennes',
    description: 'Porte de Clignancourt → Château de Vincennes (diagonale NW→SE)',
    query: {
      from: 'Station-porte-de-clignancourt',
      to: 'Station-chateau-de-vincennes',
      maxPaths: 5
    }
  },

  // ============================================================
  // TOURISME — Stations emblématiques
  // ============================================================

  {
    name: 'louvre-tour-eiffel',
    description: 'Louvre-Rivoli → Trocadéro (musées)',
    query: {
      from: 'Station-louvre-rivoli',
      to: 'Station-trocadero',
      maxPaths: 3
    }
  },

  {
    name: 'notre-dame-sacre-coeur',
    description: 'Cité → Abbesses (Notre-Dame → Sacré-Cœur)',
    query: {
      from: 'Station-cite',
      to: 'Station-abbesses',
      maxPaths: 3
    }
  }
]

/**
 * Requête par défaut (utilisée sans --query)
 */
export const defaultQuery = metroQueries.find(q => q.name === 'chatelet-opera')!

/**
 * queries.ts — Requêtes scénario Netflix
 *
 * Démontre la navigation dans un graphe généré automatiquement par le pipeline.
 * Le graphe contient 7 nœuds et 66 arêtes dont 56 vues sémantiques issues de
 * credits.jobId → jobs (actor, director, writer, screenplay...).
 *
 * Usage :
 *   tsx cli/run-scenario.ts scenarios/test-netflix --query directors-of-movie
 *   tsx cli/run-scenario.ts scenarios/test-netflix --query all
 *
 * Graphe disponible :
 *   Nœuds  : movies, people, credits, jobs, departments, categories, users
 *   Arêtes physiques    : credits→movies, credits→people, credits→jobs, jobs→departments
 *   Arêtes sémantiques  : movies↔people via [actor | director | writer | screenplay ...]
 *   Arêtes virtuelles   : movies↔categories (array inline)
 */

import type { PathQuery } from '../../types/index.js'

export interface NamedQuery {
  name: string
  description: string
  query: PathQuery
}

export const netflixQueries: NamedQuery[] = [

  // ============================================================
  // NAVIGATION SÉMANTIQUE — Vues générées depuis credits.jobId
  // ============================================================

  {
    name: 'directors-of-movie',
    description: 'movies → people via vue sémantique "director"',
    query: {
      from: 'movies',
      to: 'people',
      via: ['director'],
      maxPaths: 3
    }
  },

  {
    name: 'actors-of-movie',
    description: 'movies → people via vue sémantique "actor"',
    query: {
      from: 'movies',
      to: 'people',
      via: ['actor'],
      maxPaths: 3
    }
  },

  {
    name: 'movies-of-director',
    description: 'people → movies via vue sémantique "director_in"',
    query: {
      from: 'people',
      to: 'movies',
      via: ['director_in'],
      maxPaths: 3
    }
  },

  {
    name: 'movies-of-actor',
    description: 'people → movies via vue sémantique "actor_in"',
    query: {
      from: 'people',
      to: 'movies',
      via: ['actor_in'],
      maxPaths: 3
    }
  },

  // ============================================================
  // NAVIGATION PHYSIQUE — Relations FK déclarées
  // ============================================================

  {
    name: 'credits-to-jobs',
    description: 'credits → jobs (FK physique credits.jobId → jobs.id)',
    query: {
      from: 'credits',
      to: 'jobs',
      maxPaths: 2
    }
  },

  {
    name: 'jobs-to-departments',
    description: 'jobs → departments (FK physique jobs.departmentId → departments.id)',
    query: {
      from: 'jobs',
      to: 'departments',
      maxPaths: 2
    }
  },

  // ============================================================
  // NAVIGATION VIRTUELLE — Array inline movies.categories
  // ============================================================

  {
    name: 'movies-to-categories',
    description: 'movies → categories (relation virtuelle depuis array inline)',
    query: {
      from: 'movies',
      to: 'categories',
      maxPaths: 2
    }
  },

  // ============================================================
  // CHEMINS LONGS — Traversées multi-sauts
  // ============================================================

  {
    name: 'movies-to-departments',
    description: 'movies → departments (2 sauts : movies→credits→jobs→departments)',
    query: {
      from: 'movies',
      to: 'departments',
      maxPaths: 2
    }
  },

  {
    name: 'people-to-departments',
    description: 'people → departments (via credits → jobs → departments)',
    query: {
      from: 'people',
      to: 'departments',
      maxPaths: 3
    }
  },

  // ============================================================
  // CHEMIN MINIMAL — minHops
  // ============================================================

  {
    name: 'people-to-movies-minhops',
    description: 'people → movies chemin le plus court (minHops)',
    query: {
      from: 'people',
      to: 'movies',
      minHops: 1,
      maxPaths: 5
    }
  }

]

/**
 * Requête par défaut (utilisée sans --query)
 */
export const defaultQuery = netflixQueries.find(q => q.name === 'directors-of-movie')!

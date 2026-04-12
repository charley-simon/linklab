/**
 * UC-D2 — DomainProxy : méthodes Array natives
 *
 * Teste que map, filter, find, forEach, etc. sont directement
 * chaînables sur un DomainNode sans await intermédiaire.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { loadGraph } from '../../src/api/loadGraph.js'
import type { CompiledGraph, RouteInfo } from '../../src/types/index.js'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function route(from: string, to: string, path: string[]): RouteInfo {
  return {
    from, to,
    primary: {
      path,
      edges: [{ fromCol: 'id', toCol: 'movieId' }],
      weight: path.length - 1, joins: path.length - 1, avgTime: 1
    },
    fallbacks: [], alternativesDiscarded: 0,
  } as RouteInfo
}

const COMPILED: CompiledGraph = {
  version: '2.0.0',
  compiledAt: new Date().toISOString(),
  config: { weightThreshold: 1000, keepFallbacks: true, maxFallbacks: 2 },
  nodes: [
    { id: 'movies', type: 'table', primaryKey: 'id' },
    { id: 'people', type: 'table', primaryKey: 'id' },
  ],
  routes: [ route('movies', 'people', ['movies', 'people']) ],
  stats: { totalPairs: 1, routesCompiled: 1, routesFiltered: 0, compressionRatio: '0%' },
}

const DATASET = {
  movies: [
    { id: 278, title: 'Shawshank',    rating: 'R',  year: 1994 },
    { id: 680, title: 'Pulp Fiction', rating: 'R',  year: 1994 },
    { id: 13,  title: 'Forrest Gump', rating: 'PG', year: 1994 },
  ],
  people: [{ id: 1, name: 'Tim Robbins' }],
}

// ── UC-D2 ─────────────────────────────────────────────────────────────────────

describe('UC-D2 — DomainProxy : méthodes Array natives', () => {

  let domain: any

  beforeEach(async () => {
    domain = await loadGraph({ compiled: COMPILED }, { dataset: DATASET })
  })

  it('[D2.1] forEach — exécute l\'effet de bord pour chaque élément', async () => {
    const titles: string[] = []
    await domain.movies.forEach((f: any) => titles.push(f.title))
    expect(titles).toHaveLength(3)
    expect(titles).toContain('Shawshank')
  })

  it('[D2.2] map — retourne un tableau transformé', async () => {
    const titles = await domain.movies.map((f: any) => f.title)
    expect(titles).toEqual(['Shawshank', 'Pulp Fiction', 'Forrest Gump'])
  })

  it('[D2.3] filter — retourne les éléments correspondants', async () => {
    const pg = await domain.movies.filter((f: any) => f.rating === 'PG')
    expect(pg).toHaveLength(1)
    expect(pg[0].title).toBe('Forrest Gump')
  })

  it('[D2.4] filter — retourne [] si aucun résultat', async () => {
    const none = await domain.movies.filter((f: any) => f.rating === 'G')
    expect(none).toEqual([])
  })

  it('[D2.5] find — retourne le premier élément correspondant', async () => {
    const film = await domain.movies.find((f: any) => f.id === 278)
    expect(film).toBeDefined()
    expect(film.title).toBe('Shawshank')
  })

  it('[D2.6] find — retourne undefined si non trouvé', async () => {
    const film = await domain.movies.find((f: any) => f.id === 999)
    expect(film).toBeUndefined()
  })

  it('[D2.7] findIndex — retourne l\'indice correct', async () => {
    const idx = await domain.movies.findIndex((f: any) => f.id === 680)
    expect(idx).toBe(1)
  })

  it('[D2.8] some — retourne true si un élément correspond', async () => {
    const has = await domain.movies.some((f: any) => f.id === 278)
    expect(has).toBe(true)
  })

  it('[D2.9] every — retourne true si tous les éléments ont un id', async () => {
    const all = await domain.movies.every((f: any) => f.id != null)
    expect(all).toBe(true)
  })

  it('[D2.10] reduce — accumule les ids correctement', async () => {
    const ids = await domain.movies.reduce(
      (acc: number[], f: any) => [...acc, f.id], []
    )
    expect(ids).toEqual([278, 680, 13])
  })

  it('[D2.11] slice — retourne le sous-tableau correct', async () => {
    const first = await domain.movies.slice(0, 1)
    expect(first).toHaveLength(1)
    expect(first[0].title).toBe('Shawshank')
  })

  it('[D2.12] flatMap — aplatit et transforme', async () => {
    const result = await domain.movies.flatMap((f: any) => [f.id, f.title])
    expect(result).toContain(278)
    expect(result).toContain('Shawshank')
    expect(result).toHaveLength(6) // 3 films × 2 valeurs
  })

  it('[D2.13] includes — sur résultat de map', async () => {
    const titles = await domain.movies.map((f: any) => f.title)
    expect(titles.includes('Shawshank')).toBe(true)
    expect(titles.includes('Unknown')).toBe(false)
  })

  it('[D2.14] méthode inconnue → undefined sans exception', async () => {
    expect(() => domain.movies.unknownMethod).not.toThrow()
    expect(domain.movies.unknownMethod).toBeUndefined()
  })
})

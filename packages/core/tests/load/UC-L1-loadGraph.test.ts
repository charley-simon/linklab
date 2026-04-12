/**
 * UC-L1 — loadGraph : usage minimal
 *
 * Teste que loadGraph() est le point d'entrée minimal de LinkLab :
 * une ligne pour obtenir un domain proxy opérationnel.
 *
 * Use cases couverts :
 *   UC-L1  loadGraph — factory universelle
 */

import { describe, it, expect } from 'vitest'
import { loadGraph } from '../../src/api/loadGraph.js'
import { Graph } from '../../src/api/Graph.js'
import type { CompiledGraph, RouteInfo } from '../../src/types/index.js'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function route(
  from: string,
  to: string,
  path: string[],
  edges: Array<{ fromCol: string; toCol: string; condition?: Record<string, any> }>,
  opts: { semantic?: boolean; label?: string } = {}
): RouteInfo {
  return {
    from,
    to,
    ...(opts.semantic !== undefined && { semantic: opts.semantic }),
    ...(opts.label !== undefined && { label: opts.label }),
    primary: { path, edges, weight: path.length - 1, joins: path.length - 1, avgTime: 1 },
    fallbacks: [],
    alternativesDiscarded: 0
  } as RouteInfo
}

const COMPILED: CompiledGraph = {
  version: '2.0.0',
  compiledAt: new Date().toISOString(),
  config: { weightThreshold: 1000, keepFallbacks: true, maxFallbacks: 2 },
  nodes: [
    { id: 'movies', type: 'table', primaryKey: 'id' },
    { id: 'credits', type: 'table', primaryKey: 'id' },
    { id: 'people', type: 'table', primaryKey: 'id' }
  ],
  routes: [
    route(
      'movies',
      'people',
      ['movies', 'credits', 'people'],
      [
        { fromCol: 'id', toCol: 'movieId' },
        { fromCol: 'personId', toCol: 'id' }
      ]
    ),
    route(
      'movies',
      'people',
      ['movies', 'credits', 'people'],
      [
        { fromCol: 'id', toCol: 'movieId', condition: { jobId: 1 } },
        { fromCol: 'personId', toCol: 'id' }
      ],
      { semantic: true, label: 'actor' }
    ),
    route(
      'people',
      'movies',
      ['people', 'credits', 'movies'],
      [
        { fromCol: 'id', toCol: 'personId' },
        { fromCol: 'movieId', toCol: 'id' }
      ]
    )
  ],
  stats: { totalPairs: 3, routesCompiled: 3, routesFiltered: 0, compressionRatio: '0%' }
}

const DATASET = {
  movies: [
    { id: 278, title: 'Shawshank' },
    { id: 680, title: 'Pulp Fiction' }
  ],
  credits: [
    { id: 1, movieId: 278, personId: 1, jobId: 1 },
    { id: 2, movieId: 278, personId: 2, jobId: 2 }
  ],
  people: [
    { id: 1, name: 'Tim Robbins' },
    { id: 2, name: 'Frank Darabont' }
  ]
}

// ── UC-L1 : loadGraph ─────────────────────────────────────────────────────────

describe('UC-L1 — loadGraph : usage minimal', () => {
  it('[L1.1] loadGraph({ compiled }, { dataset }) → proxy navigable directement', async () => {
    const domain = await loadGraph({ compiled: COMPILED }, { dataset: DATASET })
    expect(domain).toBeDefined()
    expect(typeof domain).toBe('object')
    // Proxy — pas une instance Graph directe
    expect(domain instanceof Graph).toBe(false)
  })

  it('[L1.2] domain.movies(278).people → résultats non vides', async () => {
    const domain = (await loadGraph({ compiled: COMPILED }, { dataset: DATASET })) as any
    const result = await domain.movies(278).people
    expect(result).toBeDefined()
    expect(result.length).toBeGreaterThan(0)
  })

  it('[L1.3] domain.graph → instance Graph', async () => {
    const domain = (await loadGraph({ compiled: COMPILED }, { dataset: DATASET })) as any
    expect(domain.graph).toBeDefined()
    expect(domain.graph instanceof Graph).toBe(true)
  })

  it('[L1.4] domain.graph.entities → nodes du graphe', async () => {
    const domain = (await loadGraph({ compiled: COMPILED }, { dataset: DATASET })) as any
    const entities = domain.graph.entities
    expect(entities.length).toBe(3)
    expect(entities.map((e: any) => e.id)).toContain('movies')
    expect(entities.map((e: any) => e.id)).toContain('people')
  })

  it('[L1.5] domain.graph.linksFrom("movies") → routes physiques présentes', async () => {
    const domain = (await loadGraph({ compiled: COMPILED }, { dataset: DATASET })) as any
    const links = domain.graph.linksFrom('movies')
    const physical = links.filter((l: any) => !l.semantic)
    expect(physical.length).toBeGreaterThan(0)
    expect(physical[0].to).toBe('people')
  })

  it('[L1.6] domain.graph.linksFrom("movies") → routes sémantiques présentes', async () => {
    const domain = (await loadGraph({ compiled: COMPILED }, { dataset: DATASET })) as any
    const links = domain.graph.linksFrom('movies')
    const semantic = links.filter((l: any) => l.semantic)
    expect(semantic.length).toBeGreaterThan(0)
    expect(semantic.map((l: any) => l.label)).toContain('actor')
  })

  it('[L1.7] NavigationLink.semantic=false pour route physique', async () => {
    const domain = (await loadGraph({ compiled: COMPILED }, { dataset: DATASET })) as any
    const links = domain.graph.linksFrom('movies')
    const physical = links.find((l: any) => l.label === 'people' || !l.semantic)
    expect(physical?.semantic).toBe(false)
  })

  it('[L1.8] NavigationLink.semantic=true pour route sémantique', async () => {
    const domain = (await loadGraph({ compiled: COMPILED }, { dataset: DATASET })) as any
    const links = domain.graph.linksFrom('movies')
    const actor = links.find((l: any) => l.label === 'actor')
    expect(actor?.semantic).toBe(true)
    expect(actor?.to).toBe('people')
  })

  it("[L1.9] loadGraph sans dataset → pas d'exception, data vide", async () => {
    const domain = (await loadGraph({ compiled: COMPILED })) as any
    // Pas d'exception à la création
    expect(domain).toBeDefined()
    // Navigation sans data → erreur ou data vide selon le mode
    // On vérifie juste que le proxy est créé
    expect(domain.graph).toBeDefined()
  })

  it('[L1.10] linksFrom entité inconnue → [] sans exception', async () => {
    const domain = (await loadGraph({ compiled: COMPILED }, { dataset: DATASET })) as any
    const links = domain.graph.linksFrom('unknown_entity')
    expect(Array.isArray(links)).toBe(true)
    expect(links.length).toBe(0)
  })
})

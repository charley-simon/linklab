/**
 * UC-I — Integration Tests
 *
 * Teste sur les données réelles des exemples.
 * Ces tests lisent les fichiers JSON produits — pas besoin de relancer les pipelines.
 *
 * Prérequis :
 *   npx tsx src/scripts/regenerate.ts netflix
 *   npx tsx src/scripts/regenerate.ts musicians  (après copy graph.json → raw-graph.json)
 *   npx tsx src/examples/dvdrental/pipeline.ts
 *
 * Use cases couverts :
 *   UC-I1  Netflix pipeline — 76 routes (20 physical + 56 semantic)
 *   UC-I2  Netflix QueryEngine — SQL et résultats sur données réelles
 *   UC-I3  Musicians — chaînes de sampling et cycles
 *   UC-I4  DVDRental — graphe compilé depuis PostgreSQL
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { existsSync } from 'fs'

import { QueryEngine }  from '../../src/runtime/QueryEngine.js'
import { PathFinder }   from '../../src/core/PathFinder.js'
import type { CompiledGraph, Graph } from '../../src/types/index.js'

const require   = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))
const EXAMPLES  = join(__dirname, '../../src/examples')

// ── Helpers ───────────────────────────────────────────────────────────────────

function loadJSON(filepath: string): any {
  if (!existsSync(filepath)) {
    throw new Error(`Fichier manquant : ${filepath}\nLancer le pipeline correspondant.`)
  }
  return require(filepath)
}

function skipIfMissing(filepath: string): boolean {
  return !existsSync(filepath)
}

// ── UC-I1 : Netflix pipeline ──────────────────────────────────────────────────

describe('UC-I1 — Netflix : pipeline complet v2', () => {
  const compiledPath = join(EXAMPLES, 'netflix/compiled-graph.json')
  let compiled: CompiledGraph

  beforeAll(() => {
    if (skipIfMissing(compiledPath)) return
    compiled = loadJSON(compiledPath)
  })

  it('[I1.1] compiled-graph.json existe et charge sans erreur', () => {
    if (skipIfMissing(compiledPath)) {
      console.warn('  ⚠️  netflix/compiled-graph.json absent — lancer regenerate.ts netflix')
      return
    }
    expect(compiled).toBeDefined()
    expect(compiled.routes).toBeDefined()
  })

  it('[I1.2] 7 nœuds dans compiled.nodes', () => {
    if (skipIfMissing(compiledPath)) return
    expect(compiled.nodes.length).toBe(7)
  })

  it('[I1.3] 76 routes au total', () => {
    if (skipIfMissing(compiledPath)) return
    expect(compiled.routes.length).toBe(76)
  })

  it('[I1.4] 20 routes physiques', () => {
    if (skipIfMissing(compiledPath)) return
    const physical = compiled.routes.filter(r => !(r as any).semantic)
    expect(physical.length).toBe(20)
  })

  it('[I1.5] 56 routes sémantiques', () => {
    if (skipIfMissing(compiledPath)) return
    const semantic = compiled.routes.filter(r => (r as any).semantic === true)
    expect(semantic.length).toBe(56)
  })

  it('[I1.6] route movies→people existe', () => {
    if (skipIfMissing(compiledPath)) return
    const route = compiled.routes.find(r => r.from === 'movies' && r.to === 'people' && !(r as any).semantic)
    expect(route).toBeDefined()
  })

  it('[I1.7] route departments→movies existe avec 3 joins', () => {
    if (skipIfMissing(compiledPath)) return
    const route = compiled.routes.find(r => r.from === 'departments' && r.to === 'movies')
    expect(route).toBeDefined()
    expect(route!.primary.joins).toBe(3)
  })

  it('[I1.8] route sémantique actor existe', () => {
    if (skipIfMissing(compiledPath)) return
    const actor = compiled.routes.find(
      r => r.from === 'movies' && r.to === 'people' && (r as any).label === 'actor'
    )
    expect(actor).toBeDefined()
  })

})

// ── UC-I2 : Netflix QueryEngine ───────────────────────────────────────────────

describe('UC-I2 — Netflix : QueryEngine sur données réelles', () => {
  const compiledPath = join(EXAMPLES, 'netflix/compiled-graph.json')
  const dataDir      = join(EXAMPLES, 'netflix/data')

  let engine:  QueryEngine
  let dataset: Record<string, any[]>

  beforeAll(() => {
    if (skipIfMissing(compiledPath) || skipIfMissing(dataDir)) return

    const compiled = loadJSON(compiledPath)
    engine = new QueryEngine(compiled)

    dataset = {
      movies:      loadJSON(join(dataDir, 'movies.json')),
      people:      loadJSON(join(dataDir, 'people.json')),
      credits:     loadJSON(join(dataDir, 'credits.json')),
      departments: loadJSON(join(dataDir, 'departments.json')),
      jobs:        loadJSON(join(dataDir, 'jobs.json')),
      categories:  loadJSON(join(dataDir, 'categories.json')),
    }
  })

  it('[I2.1] executeInMemory movies(278)→people : résultats > 0', () => {
    if (skipIfMissing(compiledPath)) return
    const results = engine.executeInMemory(
      { from: 'movies', to: 'people', filters: { id: 278 } },
      dataset
    )
    expect(results.length).toBeGreaterThan(0)
  })

  it('[I2.2] executeInMemory departments("Directing")→movies : résultats > 0', () => {
    if (skipIfMissing(compiledPath)) return
    const results = engine.executeInMemory(
      { from: 'departments', to: 'movies', filters: { name: 'Directing' } },
      dataset
    )
    expect(results.length).toBeGreaterThan(0)
  })

  it('[I2.3] generateSQL movies→people : contient 2 INNER JOIN', () => {
    if (skipIfMissing(compiledPath)) return
    const sql = engine.generateSQL({ from: 'movies', to: 'people' })
    const joinCount = (sql.match(/INNER JOIN/g) ?? []).length
    expect(joinCount).toBe(2)
  })

  it('[I2.4] generateSQL departments→movies : contient 3 INNER JOIN', () => {
    if (skipIfMissing(compiledPath)) return
    const sql = engine.generateSQL({ from: 'departments', to: 'movies' })
    const joinCount = (sql.match(/INNER JOIN/g) ?? []).length
    expect(joinCount).toBe(3)
  })

  it('[I2.5] résultats semantic actor ≤ résultats physiques pour film 278', () => {
    if (skipIfMissing(compiledPath)) return
    const physical = engine.executeInMemory(
      { from: 'movies', to: 'people', filters: { id: 278 } },
      dataset
    )
    const semantic = engine.executeInMemory(
      { from: 'movies', to: 'people', filters: { id: 278 }, semantic: 'actor' } as any,
      dataset
    )
    // semantic peut être ≤ physical (filtre par jobId)
    expect(semantic.length).toBeLessThanOrEqual(physical.length)
  })

})

// ── UC-I3 : Musicians ─────────────────────────────────────────────────────────

describe('UC-I3 — Musicians : chaînes de sampling et cycles', () => {
  const graphPath = join(EXAMPLES, 'musicians/graph.json')
  let finder: PathFinder

  beforeAll(() => {
    if (skipIfMissing(graphPath)) return
    const graph: Graph = loadJSON(graphPath)
    finder = new PathFinder(graph)
  })

  it('[I3.1] Will Smith → Manu Dibango : chemin en ≥ 4 nœuds', () => {
    if (skipIfMissing(graphPath)) return
    const result = finder.findShortestPath('artist-will-smith', 'artist-manu-dibango')
    expect(result).not.toBeNull()
    expect(result!.path.length).toBeGreaterThanOrEqual(4)
  })

  it('[I3.2] James Brown → Kanye West : chemin trouvé', () => {
    if (skipIfMissing(graphPath)) return
    const result = finder.findShortestPath('artist-james-brown', 'artist-kanye-west')
    expect(result).not.toBeNull()
  })

  it('[I3.3] Daft Punk → Kanye West : chemin trouvé', () => {
    if (skipIfMissing(graphPath)) return
    const result = finder.findShortestPath('artist-daft-punk', 'artist-kanye-west')
    expect(result).not.toBeNull()
  })

  it('[I3.4] Kanye West → Daft Punk : chemin trouvé (cycle géré sans boucle)', () => {
    if (skipIfMissing(graphPath)) return
    const result = finder.findShortestPath('artist-kanye-west', 'artist-daft-punk')
    expect(result).not.toBeNull()
  })

  it('[I3.5] via CREATED+SAMPLES+CREDITED : chaîne sampling Kanye→Daft', () => {
    if (skipIfMissing(graphPath)) return
    const paths = finder.findAllPaths(
      'artist-kanye-west', 'artist-daft-punk',
      3, 50, 0,
      ['CREATED', 'SAMPLES', 'CREDITED']
    )
    expect(paths.length).toBeGreaterThan(0)
    // Le chemin passe par les tracks
    expect(paths[0]).toContain('track-stronger')
  })

})

// ── UC-I4 : DVDRental ─────────────────────────────────────────────────────────

describe('UC-I4 — DVDRental : graphe compilé depuis PostgreSQL', () => {
  const compiledPath = join(EXAMPLES, 'dvdrental/compiled-graph.json')
  const graphPath    = join(EXAMPLES, 'dvdrental/graph.json')
  let compiled: CompiledGraph

  beforeAll(() => {
    if (skipIfMissing(compiledPath)) return
    compiled = loadJSON(compiledPath)
  })

  it('[I4.1] graph.json : 15 nœuds', () => {
    if (skipIfMissing(graphPath)) return
    const graph = loadJSON(graphPath)
    expect(graph.nodes.length).toBe(15)
  })

  it('[I4.2] compiled-graph.json : 210 routes', () => {
    if (skipIfMissing(compiledPath)) {
      console.warn('  ⚠️  dvdrental/compiled-graph.json absent — lancer pipeline.ts')
      return
    }
    expect(compiled.routes.length).toBe(210)
  })

  it('[I4.3] route customer→film existe', () => {
    if (skipIfMissing(compiledPath)) return
    const route = compiled.routes.find(r => r.from === 'customer' && r.to === 'film')
    expect(route).toBeDefined()
  })

  it('[I4.4] route film→actor existe', () => {
    if (skipIfMissing(compiledPath)) return
    const route = compiled.routes.find(r => r.from === 'film' && r.to === 'actor')
    expect(route).toBeDefined()
  })

  it('[I4.5] route store→customer existe', () => {
    if (skipIfMissing(compiledPath)) return
    const route = compiled.routes.find(r => r.from === 'store' && r.to === 'customer')
    expect(route).toBeDefined()
  })

})

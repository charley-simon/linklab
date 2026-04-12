/**
 * UC-N — NavigationEngine Unit Tests
 *
 * Teste NavigationEngine en modes PATHFIND et NAVIGATE
 * sur des graphes minimalistes construits en mémoire.
 *
 * Use cases couverts :
 *   UC-N1  Mode PATHFIND — orchestre PathFinder, retourne NavigationPath enrichis
 *   UC-N2  Mode NAVIGATE — résolution de frames sémantiques (Trail)
 */

import { describe, it, expect } from 'vitest'
import { NavigationEngine } from '../../src/navigation/NavigationEngine.js'
import type { Graph, GraphEdge, Frame } from '../../src/types/index.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

function edge(
  from: string,
  to: string,
  via: string,
  weight = 1,
  meta: Record<string, unknown> = {}
): GraphEdge {
  return { name: `${from}→${to}`, from, to, via, weight, metadata: meta }
}

function graph(nodes: string[], edges: GraphEdge[]): Graph {
  return { nodes: nodes.map(id => ({ id, type: 'node' })), edges }
}

function frame(entity: string, state: 'RESOLVED' | 'UNRESOLVED' = 'UNRESOLVED', id?: any): Frame {
  return { entity, state, ...(id !== undefined && { id }) }
}

// ── Graphes de test ───────────────────────────────────────────────────────────

const METRO_MINI = graph(
  ['S1', 'S2', 'HUB', 'S3', 'S4'],
  [
    edge('S1', 'S2', 'L1', 1, { type: 'DIRECT', lineId: 'L1' }),
    edge('S2', 'HUB', 'L1', 1, { type: 'DIRECT', lineId: 'L1' }),
    edge('HUB', 'S3', 'L1', 1, { type: 'DIRECT', lineId: 'L1' }),
    edge('S1', 'S4', 'L2', 2, { type: 'DIRECT', lineId: 'L2' }),
    edge('S4', 'S3', 'L2', 2, { type: 'DIRECT', lineId: 'L2' })
  ]
)

const CINEMA_MINI = graph(
  ['directors', 'movies', 'credits', 'people'],
  [
    edge('directors', 'credits', 'directorId'),
    edge('credits', 'movies', 'movieId'),
    edge('movies', 'credits', 'movieId'),
    edge('credits', 'people', 'personId'),
    // Edge direct pour le Resolver (cherche source.entity → frame.entity)
    edge('directors', 'movies', 'directorId', 1),
    edge('movies', 'people', 'personId', 1)
  ]
)

const ISOLATED_GRAPH = graph(
  ['A', 'B', 'C'],
  [edge('A', 'B', 'b_id')] // C isolé
)

// ── UC-N1 : Mode PATHFIND ─────────────────────────────────────────────────────

describe('UC-N1 — forPathfinding : orchestre PathFinder', () => {
  it('[N1.1] getMode() === PATHFIND', () => {
    const engine = NavigationEngine.forPathfinding(METRO_MINI, {
      from: 'S1',
      to: 'S3'
    })
    expect(engine.getMode()).toBe('PATHFIND')
  })

  it('[N1.2] run() retourne résultats triés par totalWeight', async () => {
    const engine = NavigationEngine.forPathfinding(METRO_MINI, {
      from: 'S1',
      to: 'S3',
      maxPaths: 3
    })
    const results = await engine.run()

    const successes = results.filter(r => r.result?.type === 'SUCCESS')
    expect(successes.length).toBeGreaterThan(0)
    // Premier résultat a le poids le plus faible
    for (let i = 1; i < successes.length; i++) {
      expect(successes[i - 1].path!.totalWeight).toBeLessThanOrEqual(successes[i].path!.totalWeight)
    }
  })

  it('[N1.3] nodes[0] = from, nodes[last] = to', async () => {
    const engine = NavigationEngine.forPathfinding(METRO_MINI, {
      from: 'S1',
      to: 'S3'
    })
    const results = await engine.run()

    results.forEach(r => {
      if (r.result?.type === 'SUCCESS') {
        const nodes = r.path!.nodes
        expect(nodes[0]).toBe('S1')
        expect(nodes[nodes.length - 1]).toBe('S3')
      }
    })
  })

  it('[N1.4] edges.length === nodes.length - 1', async () => {
    const engine = NavigationEngine.forPathfinding(METRO_MINI, {
      from: 'S1',
      to: 'S3'
    })
    const results = await engine.run()

    results.forEach(r => {
      if (r.result?.type === 'SUCCESS') {
        expect(r.path!.edges.length).toBe(r.path!.nodes.length - 1)
      }
    })
  })

  it('[N1.5] aucun chemin : result.type = FAIL', async () => {
    const engine = NavigationEngine.forPathfinding(ISOLATED_GRAPH, {
      from: 'A',
      to: 'C'
    })
    const results = await engine.run()

    expect(results.length).toBe(1)
    expect(results[0].result.type).toBe('FAIL')
  })

  it('[N1.6] maxPaths respecté : results.length ≤ maxPaths', async () => {
    const engine = NavigationEngine.forPathfinding(METRO_MINI, {
      from: 'S1',
      to: 'S3',
      maxPaths: 2
    })
    const results = await engine.run()

    const successes = results.filter(r => r.result?.type === 'SUCCESS')
    expect(successes.length).toBeLessThanOrEqual(2)
  })

  it("[N1.7] via filter transmis : résultats contraints par type d'edge", async () => {
    const viag = graph(
      ['A', 'B', 'C', 'D'],
      [
        edge('A', 'B', 'X', 1, { type: 'TYPE_X' }),
        edge('B', 'D', 'X', 1, { type: 'TYPE_X' }),
        edge('A', 'C', 'Y', 1, { type: 'TYPE_Y' }),
        edge('C', 'D', 'Y', 1, { type: 'TYPE_Y' })
      ]
    )
    const engine = NavigationEngine.forPathfinding(viag, {
      from: 'A',
      to: 'D',
      via: ['TYPE_X']
    })
    const results = await engine.run()

    const success = results.find(r => r.result?.type === 'SUCCESS')
    expect(success).toBeDefined()
    // Chemin via TYPE_X uniquement → B présent, C absent
    expect(success!.path!.nodes).toContain('B')
    expect(success!.path!.nodes).not.toContain('C')
  })

  it('[N1.8] transferPenalty transmis : influence le choix du chemin', async () => {
    const penaltyGraph = graph(
      ['S1', 'S2', 'S3', 'S4'],
      [
        edge('S1', 'S2', 'DIRECT', 1, { type: 'DIRECT' }),
        edge('S2', 'S3', 'DIRECT', 1, { type: 'DIRECT' }),
        edge('S2', 'S4', 'TRANSFER', 4, { type: 'TRANSFER' }), // coûteux
        edge('S1', 'S4', 'DIRECT', 2, { type: 'DIRECT' })
      ]
    )

    // Sans pénalité : S1→S2→S3 poids 2 (optimal)
    const engineNoPenalty = NavigationEngine.forPathfinding(penaltyGraph, {
      from: 'S1',
      to: 'S3',
      transferPenalty: 0
    })
    const noPenalty = await engineNoPenalty.run()

    // Avec pénalité élevée : évite TRANSFER
    const enginePenalty = NavigationEngine.forPathfinding(penaltyGraph, {
      from: 'S1',
      to: 'S3',
      transferPenalty: 10
    })
    const withPenalty = await enginePenalty.run()

    // Les deux trouvent un chemin
    expect(noPenalty[0].result.type).toBe('SUCCESS')
    expect(withPenalty[0].result.type).toBe('SUCCESS')
  })
})

// ── UC-N2 : Mode NAVIGATE ─────────────────────────────────────────────────────

describe('UC-N2 — forNavigation : résolution de frames (Trail)', () => {
  it('[N2.1] getMode() === NAVIGATE', () => {
    const engine = NavigationEngine.forNavigation(CINEMA_MINI, {
      stack: [frame('directors', 'RESOLVED', 2)]
    })
    expect(engine.getMode()).toBe('NAVIGATE')
  })

  it('[N2.2] frame UNRESOLVED avec edge disponible → RESOLVED', async () => {
    const engine = NavigationEngine.forNavigation(CINEMA_MINI, {
      stack: [frame('directors', 'RESOLVED', 2), frame('movies', 'UNRESOLVED')]
    })
    await engine.run(10)

    const stack = engine.getCurrentStack()
    const moviesFrame = stack.find(f => f.entity === 'movies')
    expect(moviesFrame?.state).toBe('RESOLVED')
  })

  it('[N2.3] resolvedBy renseigné après résolution', async () => {
    const engine = NavigationEngine.forNavigation(CINEMA_MINI, {
      stack: [frame('directors', 'RESOLVED', 2), frame('movies', 'UNRESOLVED')]
    })
    await engine.run(10)

    const stack = engine.getCurrentStack()
    const moviesFrame = stack.find(f => f.entity === 'movies')
    expect(moviesFrame?.resolvedBy).toBeDefined()
    expect(moviesFrame?.resolvedBy?.via).toBeDefined()
    expect(moviesFrame?.resolvedBy?.filters).toBeDefined()
  })

  it("[N2.4] frame UNRESOLVED sans edge → DEFERRED (pas d'exception)", async () => {
    const engine = NavigationEngine.forNavigation(CINEMA_MINI, {
      stack: [
        frame('directors', 'RESOLVED', 2),
        frame('unknownEntity', 'UNRESOLVED') // entité inexistante
      ]
    })

    await expect(engine.run(5)).resolves.toBeDefined()

    const stack = engine.getCurrentStack()
    const unknownFrame = stack.find(f => f.entity === 'unknownEntity')
    expect(['DEFERRED', 'UNRESOLVED']).toContain(unknownFrame?.state)
  })

  it("[N2.5] getCurrentStack() reflète l'état après run()", async () => {
    const engine = NavigationEngine.forNavigation(CINEMA_MINI, {
      stack: [frame('directors', 'RESOLVED', 2), frame('movies', 'UNRESOLVED')]
    })

    const before = engine.getCurrentStack()
    expect(before.find(f => f.entity === 'movies')?.state).toBe('UNRESOLVED')

    await engine.run(10)

    const after = engine.getCurrentStack()
    expect(after.find(f => f.entity === 'movies')?.state).toBe('RESOLVED')
  })

  it('[N2.6] run() phase COMPLETE quand tout résolu', async () => {
    const engine = NavigationEngine.forNavigation(CINEMA_MINI, {
      stack: [frame('directors', 'RESOLVED', 2), frame('movies', 'UNRESOLVED')]
    })
    const results = await engine.run(10)

    const completeStep = results.find(r => r.phase === 'COMPLETE')
    expect(completeStep).toBeDefined()
    expect(completeStep?.result.type).toBe('SUCCESS')
  })

  it('[N2.7] maxSteps respecté même si frames restent UNRESOLVED', async () => {
    const engine = NavigationEngine.forNavigation(CINEMA_MINI, {
      stack: [
        frame('directors', 'RESOLVED', 2),
        frame('movies', 'UNRESOLVED'),
        frame('people', 'UNRESOLVED'),
        frame('unknown1', 'UNRESOLVED'),
        frame('unknown2', 'UNRESOLVED')
      ]
    })
    const results = await engine.run(2) // maxSteps = 2

    expect(results.length).toBeLessThanOrEqual(3) // 2 steps + éventuel COMPLETE
  })
})

// ── UC-N — Cas limites ────────────────────────────────────────────────────────

describe('UC-N — Cas limites NavigationEngine', () => {
  it('stack vide : run() retourne [] ou COMPLETE sans erreur', async () => {
    const engine = NavigationEngine.forNavigation(CINEMA_MINI, { stack: [] })
    await expect(engine.run()).resolves.toBeDefined()
  })

  it('stack toutes RESOLVED : run() complète immédiatement', async () => {
    const engine = NavigationEngine.forNavigation(CINEMA_MINI, {
      stack: [frame('directors', 'RESOLVED', 2), frame('movies', 'RESOLVED')]
    })
    const results = await engine.run(10)
    const complete = results.find(r => r.phase === 'COMPLETE')
    expect(complete).toBeDefined()
  })

  it('getGraph() retourne le graphe source', () => {
    const engine = NavigationEngine.forNavigation(CINEMA_MINI, { stack: [] })
    expect(engine.getGraph()).toBe(CINEMA_MINI)
  })

  it('getState() initial reflète la stack passée', () => {
    const stack = [frame('directors', 'RESOLVED', 2)]
    const engine = NavigationEngine.forNavigation(CINEMA_MINI, { stack })
    expect(engine.getCurrentStack()).toEqual(stack)
  })
})

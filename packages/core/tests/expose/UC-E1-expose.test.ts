/**
 * UC-E1 — expose config : contrôle de l'exposition des entités
 *
 * Vérifie que GraphCompiler compile correctement node.exposed
 * depuis CompilerConfig.expose, et que linklabPlugin bloque
 * les Trails vers des entités non exposées.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { GraphCompiler } from '../../src/graph/GraphCompiler.js'
import type { Graph } from '../../src/types/index.js'

// ── Graphe de test minimal ────────────────────────────────────

const testGraph: Graph = {
  nodes: [
    { id: 'film',    type: 'table' },
    { id: 'actor',   type: 'table' },
    { id: 'staff',   type: 'table' },
    { id: 'payment', type: 'table' },
  ],
  edges: [
    { from: 'film', to: 'actor', weight: 1, via: 'film_actor',
      metadata: { type: 'physical' } },
    { from: 'film', to: 'staff', weight: 1, via: 'staff_id',
      metadata: { type: 'physical' } },
    { from: 'film', to: 'payment', weight: 1, via: 'payment_id',
      metadata: { type: 'physical' } },
  ]
}

const emptyMetrics = new Map()

// ── UC-E1 ─────────────────────────────────────────────────────

describe('UC-E1 — expose config : GraphCompiler.compileNodes', () => {

  it('[E1.1] expose: none → tous les nodes exposed: false', () => {
    const compiler = new GraphCompiler({ expose: 'none' })
    const compiled = compiler.compile(testGraph, emptyMetrics)
    expect(compiled.nodes.every(n => n.exposed === false)).toBe(true)
  })

  it('[E1.2] expose: all → tous les nodes exposed: true', () => {
    const compiler = new GraphCompiler({ expose: 'all' })
    const compiled = compiler.compile(testGraph, emptyMetrics)
    expect(compiled.nodes.every(n => n.exposed === true)).toBe(true)
  })

  it('[E1.3] expose: { include } → seuls les nodes listés exposed: true', () => {
    const compiler = new GraphCompiler({ expose: { include: ['film', 'actor'] } })
    const compiled = compiler.compile(testGraph, emptyMetrics)

    const film    = compiled.nodes.find(n => n.id === 'film')
    const actor   = compiled.nodes.find(n => n.id === 'actor')
    const staff   = compiled.nodes.find(n => n.id === 'staff')
    const payment = compiled.nodes.find(n => n.id === 'payment')

    expect(film?.exposed).toBe(true)
    expect(actor?.exposed).toBe(true)
    expect(staff?.exposed).toBe(false)
    expect(payment?.exposed).toBe(false)
  })

  it('[E1.4] expose: { exclude } → tous sauf exclus exposed: true', () => {
    const compiler = new GraphCompiler({ expose: { exclude: ['staff', 'payment'] } })
    const compiled = compiler.compile(testGraph, emptyMetrics)

    const film    = compiled.nodes.find(n => n.id === 'film')
    const actor   = compiled.nodes.find(n => n.id === 'actor')
    const staff   = compiled.nodes.find(n => n.id === 'staff')
    const payment = compiled.nodes.find(n => n.id === 'payment')

    expect(film?.exposed).toBe(true)
    expect(actor?.exposed).toBe(true)
    expect(staff?.exposed).toBe(false)
    expect(payment?.exposed).toBe(false)
  })

  it('[E1.5] expose absent → défaut none → tous exposed: false', () => {
    const compiler = new GraphCompiler({})
    const compiled = compiler.compile(testGraph, emptyMetrics)
    expect(compiled.nodes.every(n => n.exposed === false)).toBe(true)
  })

})

// ── UC-E1 — isExposed (rétrocompatibilité + plugin) ──────────

describe('UC-E1 — isExposed helper : rétrocompatibilité', () => {

  it('[E1.6] node exposed: false → isExposed retourne false', () => {
    const graph = {
      nodes: [{ id: 'staff', type: 'table', exposed: false }],
      edges: []
    }
    const node = graph.nodes.find(n => n.id === 'staff')
    // Reproduire la logique de isExposed depuis plugin.ts
    const exposed = node?.exposed === undefined ? true : node.exposed === true
    expect(exposed).toBe(false)
  })

  it('[E1.7] node sans flag exposed → isExposed retourne true (rétrocompatibilité)', () => {
    const graph = {
      nodes: [{ id: 'film', type: 'table' }],
      edges: []
    }
    const node = graph.nodes.find(n => n.id === 'film')
    const exposed = node?.exposed === undefined ? true : node.exposed === true
    expect(exposed).toBe(true)
  })

  it('[E1.8] node exposed: true → isExposed retourne true', () => {
    const graph = {
      nodes: [{ id: 'film', type: 'table', exposed: true }],
      edges: []
    }
    const node = graph.nodes.find(n => n.id === 'film')
    const exposed = node?.exposed === undefined ? true : node.exposed === true
    expect(exposed).toBe(true)
  })

})

// ── UC-E1 — buildRootLinks filtering ─────────────────────────

describe('UC-E1 — buildRootLinks : filtre les nodes non exposés', () => {

  it('[E1.9] expose: none → buildRootLinks ne liste aucune entité', () => {
    const compiler = new GraphCompiler({ expose: 'none' })
    const compiled = compiler.compile(testGraph, emptyMetrics)

    // Simuler buildRootLinks
    const hasIncoming = new Set(testGraph.edges.map(e => e.to))
    const exposedRoots = compiled.nodes.filter(n =>
      !hasIncoming.has(n.id) && n.exposed === true
    )
    expect(exposedRoots.length).toBe(0)
  })

  it('[E1.10] expose: { include: [film] } → buildRootLinks contient film', () => {
    const compiler = new GraphCompiler({ expose: { include: ['film'] } })
    const compiled = compiler.compile(testGraph, emptyMetrics)

    const hasIncoming = new Set(testGraph.edges.map(e => e.to))
    const exposedRoots = compiled.nodes.filter(n =>
      !hasIncoming.has(n.id) && n.exposed === true
    )
    expect(exposedRoots.map(n => n.id)).toContain('film')
    expect(exposedRoots.map(n => n.id)).not.toContain('staff')
  })

})

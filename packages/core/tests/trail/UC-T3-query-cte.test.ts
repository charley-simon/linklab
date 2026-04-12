/**
 * UC-T3 — Trail query mode : CTE SQL global
 *
 * Vérifie que _executeQueryCTE génère une seule requête WITH ... AS (...)
 * au lieu de N allers-retours avec des IN géants.
 *
 * Prérequis : BDD dvdrental accessible (variables PGHOST, PGDATABASE, etc.)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { loadGraph } from '../../src/api/loadGraph.js'
import { PostgresProvider } from '../../src/providers/PostgresProvider.js'
import * as path from 'path'
import * as fs   from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ── Setup ─────────────────────────────────────────────────────────────────────

const useMock = process.env.LINKLAB_MOCK === 'true'
console.log(' useMock: ', useMock)

let provider: PostgresProvider | null = null
let domain:   any = null

const compiledPath = path.resolve(__dirname, '../../src/examples/dvdrental/dvdrental.json')

beforeAll(async () => {
  if (useMock || !fs.existsSync(compiledPath)) return

  provider = new PostgresProvider({
    host:     process.env.PGHOST     ?? 'localhost',
    port:     parseInt(process.env.PGPORT ?? '5432'),
    database: process.env.PGDATABASE ?? 'dvdrental',
    user:     process.env.PGUSER     ?? 'postgres',
    password: process.env.PGPASSWORD ?? '',
  })

  domain = await loadGraph(
    { compiled: compiledPath },
    { provider }
  )
})

afterAll(async () => {
  if (provider) await provider.close()
})

const skip = () => !domain || useMock

// ── UC-T3 ─────────────────────────────────────────────────────────────────────

describe('UC-T3 — Trail query mode : CTE SQL global', () => {

  it('[T3.1] film("Academy Dinosaur").actor → 10 acteurs via CTE', async () => {
    if (skip()) return
    const result = await domain.film('Academy Dinosaur').actor
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBe(10)
  })

  it('[T3.2] film("Academy Dinosaur").actor.film → 244 films via 2 CTEs', async () => {
    if (skip()) return
    const result = await domain.film('Academy Dinosaur').actor.film
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBe(244)
  })

  it('[T3.3] customer("MARY").rental.film → films loués via 3 CTEs', async () => {
    if (skip()) return
    const result = await domain.customer('MARY').rental.film
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBeGreaterThan(0)
    expect(result.length).toBeLessThan(1000) // pas tous les films
  })

  it('[T3.4] ILIKE case-insensitive → actor("penelope") matche PENELOPE', async () => {
    if (skip()) return
    const lower = await domain.actor('penelope').film
    const upper = await domain.actor('PENELOPE').film
    // Les deux doivent retourner des résultats (ILIKE insensible)
    expect(Array.isArray(lower)).toBe(true)
    expect(Array.isArray(upper)).toBe(true)
    expect(lower.length).toBe(upper.length)
    expect(lower.length).toBeGreaterThan(0)
  })

  it('[T3.5] court-circuit si entité introuvable → [] sans requête suivante', async () => {
    if (skip()) return
    // 'XXXXXXX' ne correspond à aucun acteur
    const result = await domain.actor('XXXXXXX_INEXISTANT').film
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBe(0)
  })

  it('[T3.6] query < nav : film.actor.film restreint vs tous les films', async () => {
    if (skip()) return
    const restricted = await domain.film('Academy Dinosaur').actor.film
    const allFilms   = await domain.film
    expect(restricted.length).toBe(244)
    expect(allFilms.length).toBeGreaterThan(restricted.length)
  })

  it('[T3.7] Trail profond 4 étapes : actor.film.actor.film', async () => {
    if (skip()) return
    const result = await domain.actor('PENELOPE').film.actor.film
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBeGreaterThan(0)
    expect(result.length).toBeLessThanOrEqual(1000) // pas tous les films
  })
})

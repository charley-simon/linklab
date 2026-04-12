/**
 * UC-T2 — Trail query mode : SQL (dvdrental PostgreSQL)
 *
 * Valide que le mode query cumulatif fonctionne en SQL réel.
 * Nécessite une connexion PostgreSQL dvdrental active.
 *
 * Skip automatique si PGDATABASE !== 'dvdrental' ou connexion absente.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { loadGraph } from '../../src/api/loadGraph.js'
import { PostgresProvider } from '../../src/providers/PostgresProvider.js'
import path from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Charger .env depuis packages/linklab/
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

const COMPILED = path.resolve(__dirname, '../../src/examples/simple/dvdrental.json')

function skipIfMissing(): boolean {
  return !existsSync(COMPILED) || process.env.PGDATABASE !== 'dvdrental'
}

// ── UC-T2 ─────────────────────────────────────────────────────────────────────

describe('UC-T2 — Trail query mode : SQL dvdrental', () => {
  let dvd: any
  let provider: PostgresProvider

  beforeAll(async () => {
    if (skipIfMissing()) return
    provider = new PostgresProvider({
      host: process.env.PGHOST ?? 'localhost',
      port: parseInt(process.env.PGPORT ?? '5432'),
      database: process.env.PGDATABASE ?? 'dvdrental',
      user: process.env.PGUSER ?? 'postgres',
      password: process.env.PGPASSWORD ?? ''
    })
    dvd = await loadGraph(COMPILED, { provider })
  })

  afterAll(async () => {
    if (provider) await provider.close?.()
  })

  it('[T2.1] film("Academy Dinosaur").actor → acteurs non vides', async () => {
    if (skipIfMissing()) {
      console.warn('⚠️  dvdrental absent ou non configuré — skip')
      return
    }
    const actors = await dvd.film('Academy Dinosaur').actor
    expect(actors.length).toBeGreaterThan(0)
    expect(actors[0]).toHaveProperty('first_name')
    expect(actors[0]).toHaveProperty('last_name')
  })

  it('[T2.2] film("Academy Dinosaur").actor.film → contexte cumulatif SQL', async () => {
    if (skipIfMissing()) return
    const films = await dvd.film('Academy Dinosaur').actor.film
    expect(films.length).toBeGreaterThan(0)
    // Academy Dinosaur lui-même doit être dans les résultats (ses acteurs jouent dedans)
    const titles = films.map((f: any) => f.title)
    expect(titles).toContain('Academy Dinosaur')
  })

  it('[T2.3] customer("MARY").rental.film → films loués', async () => {
    if (skipIfMissing()) return
    // Filtrer par first_name pour éviter le conflit avec customer_id integer
    const films = await dvd.customer({ first_name: 'MARY' }).rental.film
    expect(films.length).toBeGreaterThan(0)
    expect(films[0]).toHaveProperty('title')
  })

  it('[T2.4] nav perd le contexte — retourne plus de films que query', async () => {
    if (skipIfMissing()) return
    const queryFilms = await dvd.film('Academy Dinosaur').actor.film
    const navFilms = await dvd.nav.film('Academy Dinosaur').actor.film
    // En nav, le contexte 'Academy Dinosaur' est perdu après .actor
    // → retourne tous les films de tous les acteurs (sans contrainte film source)
    expect(navFilms.length).toBeGreaterThan(queryFilms.length)
    // Query est restreint aux acteurs d'Academy Dinosaur
    expect(queryFilms.length).toBeGreaterThan(0)
    expect(queryFilms.length).toBeLessThan(navFilms.length)
  })

  it('[T2.5] actor.film restreint par contexte (< total films)', async () => {
    if (skipIfMissing()) return
    const films = await dvd.film('Academy Dinosaur').actor.film
    const allFilms = await dvd.film
    // Les films des acteurs d'Academy Dinosaur < tous les films
    expect(films.length).toBeLessThan(allFilms.length)
    expect(films.length).toBeGreaterThan(0)
  })
})

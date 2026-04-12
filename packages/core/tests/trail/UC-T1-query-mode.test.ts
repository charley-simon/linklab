/**
 * UC-T1 — Trail query mode : déclaratif et cumulatif
 *
 * Teste sur les données Netflix réelles (compiled-graph.json + data/).
 * Vérifie que le mode query préserve le contexte entre pivots,
 * que les égalités sémantiques tiennent, et que le mode nav
 * préserve l'ancien comportement.
 *
 * Prérequis :
 *   linklab build --alias cinema (génère cinema.json dans src/examples/simple/)
 *   données dans src/examples/netflix/data/
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { loadGraph } from '../../src/api/loadGraph.js'
import path from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const COMPILED = path.resolve(__dirname, '../../src/examples/simple/cinema.json')
const DATA_DIR = path.resolve(__dirname, '../../src/examples/netflix/data')

// ── Skip si fichiers absents ───────────────────────────────────────────────────

function skipIfMissing(): boolean {
  return !existsSync(COMPILED) || !existsSync(DATA_DIR)
}

// ── UC-T1 ─────────────────────────────────────────────────────────────────────

describe('UC-T1 — Trail query mode : déclaratif et cumulatif', () => {
  let cinema: any

  beforeAll(async () => {
    if (skipIfMissing()) return
    cinema = await loadGraph(COMPILED, { dataDir: DATA_DIR })
  })

  it('[T1.1] movies("Inception").director → Nolan uniquement (jobId=2)', async () => {
    if (skipIfMissing()) {
      console.warn('⚠️  cinema.json absent — lancer linklab build --alias cinema')
      return
    }
    const directors = await cinema.movies('Inception').director
    expect(directors.length).toBeGreaterThan(0)
    const names = directors.map((p: any) => p.name)
    expect(names).toContain('Christopher Nolan')
    // Ne doit pas contenir des acteurs ou autres credits
    // Nolan est le seul director d'Inception (jobId=2)
    expect(directors.length).toBe(1)
  })

  it('[T1.2] movies("Inception").director.movies → films de Nolan director (contexte cumulatif)', async () => {
    if (skipIfMissing()) return
    const films = await cinema.movies('Inception').director.movies
    // Nolan a dirigé 6 films — le contexte director (jobId=2) doit être préservé
    expect(films.length).toBe(6)
    // Inception lui-même doit être dans les résultats
    const titles = films.map((m: any) => m.title)
    expect(titles).toContain('Inception')
  })

  it('[T1.3] égalité A=B : director.movies = directors("Nolan").movies', async () => {
    if (skipIfMissing()) return
    const fromInception = await cinema.movies('Inception').director.movies
    const fromDirectors = await cinema.directors('Christopher Nolan').movies
    expect(fromInception.length).toBe(fromDirectors.length)
    // Mêmes IDs de films
    const ids1 = new Set(fromInception.map((m: any) => m.id))
    const ids2 = new Set(fromDirectors.map((m: any) => m.id))
    expect(ids1.size).toBe(ids2.size)
    for (const id of ids1) expect(ids2.has(id)).toBe(true)
  })

  it('[T1.4] égalité A=C : director.movies = people("Nolan").director.movies', async () => {
    if (skipIfMissing()) return
    const fromInception = await cinema.movies('Inception').director.movies
    const fromPeople = await cinema.people('Christopher Nolan').director.movies
    expect(fromInception.length).toBe(fromPeople.length)
    const ids1 = new Set(fromInception.map((m: any) => m.id))
    const ids2 = new Set(fromPeople.map((m: any) => m.id))
    for (const id of ids1) expect(ids2.has(id)).toBe(true)
  })

  it('[T1.5] people("Nolan").movies ≥ directors("Nolan").movies (people inclut directors)', async () => {
    if (skipIfMissing()) return
    const allMovies = await cinema.people('Christopher Nolan').movies
    const directedMovies = await cinema.directors('Christopher Nolan').movies
    // Nolan a 12 crédits mais seulement 6 films distincts (il cumule director+writer sur les mêmes films)
    // Donc people.movies = directors.movies = 6
    // L'invariant est : directors ⊆ people (tous les films dirigés sont aussi dans people)
    expect(directedMovies.length).toBe(6)
    expect(allMovies.length).toBeGreaterThanOrEqual(directedMovies.length)
    // Vérifier l'inclusion : tous les films dirigés sont dans people.movies
    const allIds = new Set(allMovies.map((m: any) => m.id))
    const directedIds = new Set(directedMovies.map((m: any) => m.id))
    for (const id of directedIds) expect(allIds.has(id)).toBe(true)
  })

  it('[T1.6] nav.movies("Inception").director.movies ≠ query (nav perd le contexte)', async () => {
    if (skipIfMissing()) return
    const queryFilms = await cinema.movies('Inception').director.movies
    const navFilms = await cinema.nav.movies('Inception').director.movies
    // En nav, le contexte 'Inception' est perdu — on obtient TOUS les films de Nolan (tous jobs)
    expect(navFilms.length).toBeGreaterThan(queryFilms.length)
  })

  it('[T1.7] nav.directors("Nolan").movies = directors("Nolan").movies (1 seul pivot = identique)', async () => {
    if (skipIfMissing()) return
    const queryFilms = await cinema.directors('Christopher Nolan').movies
    const navFilms = await cinema.nav.directors('Christopher Nolan').movies
    // Sur un seul pivot, query et nav donnent le même résultat
    expect(queryFilms.length).toBe(navFilms.length)
  })
})

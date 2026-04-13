/**
 * UC-CLI12 — linklab build cinema : expose config
 *
 * Vérifie que linklab build lit l'option `expose` depuis
 * {alias}.linklab.ts et compile node.exposed dans {alias}.json.
 *
 * Prérequis : linklab build cinema doit avoir été lancé au moins une fois.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as fs   from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __dirname  = dirname(fileURLToPath(import.meta.url))
const CLI_ROOT   = path.resolve(__dirname, '..')
const ALIAS      = 'cinema'
const ALIAS_DIR  = path.join(CLI_ROOT, 'linklab', ALIAS)
const CLI_ENTRY  = path.join(CLI_ROOT, 'src/index.ts')
const CONFIG_PATH = path.join(CLI_ROOT, `${ALIAS}.linklab.ts`)
const COMPILED_PATH = path.join(ALIAS_DIR, `${ALIAS}.json`)

function cli(cmd: string, cwd = CLI_ROOT): string {
  return execSync(`npx tsx "${CLI_ENTRY}" ${cmd}`, {
    cwd,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe']
  })
}

function loadJSON(filepath: string): any {
  return JSON.parse(fs.readFileSync(filepath, 'utf-8'))
}

function skipIfMissing(filepath: string): boolean {
  if (!fs.existsSync(filepath)) {
    console.warn(`  ⚠️  Fichier absent : ${path.relative(CLI_ROOT, filepath)}`)
    return true
  }
  return false
}

// Sauvegarde et restauration de cinema.linklab.ts
let configBackup: string | null = null

function saveConfig() {
  if (fs.existsSync(CONFIG_PATH)) {
    configBackup = fs.readFileSync(CONFIG_PATH, 'utf-8')
  }
}

function restoreConfig() {
  if (configBackup !== null) {
    fs.writeFileSync(CONFIG_PATH, configBackup, 'utf-8')
  }
}

function setExpose(expose: string) {
  if (!configBackup) return
  // Injecter expose dans la config existante
  // On remplace le defineConfig({ ... }) en ajoutant expose avant la dernière }
  const withExpose = configBackup.replace(
    /(\s*}\s*\)\s*)$/,
    `,\n  expose: ${expose}\n})\n`
  )
  fs.writeFileSync(CONFIG_PATH, withExpose, 'utf-8')
}

// ── UC-CLI12 ──────────────────────────────────────────────────

describe('UC-CLI12 — linklab build cinema : expose config', () => {

  beforeAll(() => {
    saveConfig()
  })

  afterAll(() => {
    restoreConfig()
    // Rebuild propre pour ne pas laisser le graphe en état expose
    try { cli(`build ${ALIAS}`) } catch {}
  })

  it('[CLI12.1] expose absent → tous nodes exposed: false dans cinema.json', () => {
    if (skipIfMissing(COMPILED_PATH)) return

    // Config sans expose → rebuild
    restoreConfig()
    try { cli(`build ${ALIAS}`) } catch {}
    if (skipIfMissing(COMPILED_PATH)) return

    const compiled = loadJSON(COMPILED_PATH)
    expect(compiled.nodes.length).toBeGreaterThan(0)
    expect(compiled.nodes.every((n: any) => n.exposed === false)).toBe(true)
  })

  it('[CLI12.2] expose: all → tous nodes exposed: true dans cinema.json', () => {
    if (!configBackup) return

    setExpose("'all'")
    try { cli(`build ${ALIAS}`) } catch {}
    if (skipIfMissing(COMPILED_PATH)) return

    const compiled = loadJSON(COMPILED_PATH)
    expect(compiled.nodes.every((n: any) => n.exposed === true)).toBe(true)
  })

  it("[CLI12.3] expose: { include } → movies et people exposed: true, autres false", () => {
    if (!configBackup) return

    setExpose("{ include: ['movies', 'people'] }")
    try { cli(`build ${ALIAS}`) } catch {}
    if (skipIfMissing(COMPILED_PATH)) return

    const compiled = loadJSON(COMPILED_PATH)
    const movies = compiled.nodes.find((n: any) => n.id === 'movies')
    const people = compiled.nodes.find((n: any) => n.id === 'people')
    const others = compiled.nodes.filter((n: any) => n.id !== 'movies' && n.id !== 'people')

    expect(movies?.exposed).toBe(true)
    expect(people?.exposed).toBe(true)
    expect(others.every((n: any) => n.exposed === false)).toBe(true)
  })

  it('[CLI12.4] expose: { exclude } → exclus exposed: false, autres true', () => {
    if (!configBackup) return

    setExpose("{ exclude: ['categories'] }")
    try { cli(`build ${ALIAS}`) } catch {}
    if (skipIfMissing(COMPILED_PATH)) return

    const compiled = loadJSON(COMPILED_PATH)
    const categories = compiled.nodes.find((n: any) => n.id === 'categories')
    const others = compiled.nodes.filter((n: any) => n.id !== 'categories')

    expect(categories?.exposed).toBe(false)
    expect(others.every((n: any) => n.exposed === true)).toBe(true)
  })

  it('[CLI12.5] cinema.linklab.ts non modifié après build avec expose', () => {
    if (!configBackup) return

    restoreConfig()
    const before = fs.readFileSync(CONFIG_PATH, 'utf-8')
    try { cli(`build ${ALIAS}`) } catch {}
    const after = fs.readFileSync(CONFIG_PATH, 'utf-8')

    expect(after).toBe(before)
  })

})

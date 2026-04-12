/**
 * generate.ts — linklab generate <alias>
 *
 * Génère use-cases.gen.json depuis le graphe compilé.
 * Exhaustif : physiques + sémantiques + composées (people→people).
 *
 * Usage :
 *   linklab generate cinema
 *   linklab generate dvdrental
 */

import * as fs from 'fs'
import * as path from 'path'
import * as log from '../ui/logger.js'
import { loadConfig, resolveAlias } from '../config.js'
import type { ReplOptions } from '../types.js'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GeneratedUseCase {
  id: string
  from: string
  to: string
  semantic?: string // label sémantique si route sémantique
  via?: string[] // entités intermédiaires composées
  description: string
  path: string[]
  weight: number
  type: 'physical' | 'semantic' | 'composed'
}

// ── Commande ──────────────────────────────────────────────────────────────────

export async function generate(options: { alias?: string } = {}): Promise<void> {
  const cwd = process.cwd()

  // ── Config ──────────────────────────────────────────────────────────────────

  let alias: string
  let outDir: string
  let config: any

  try {
    const resolved = resolveAlias(cwd, options.alias)
    alias = resolved ?? 'graph'
    ;({ config, outDir } = await loadConfig(cwd, alias))
  } catch (e) {
    log.error('Impossible de charger la config', (e as Error).message)
    process.exit(1)
  }

  const compiledPath = path.join(outDir, `${alias}.json`)
  if (!fs.existsSync(compiledPath)) {
    log.error(`Graph introuvable`, `Lance d'abord : linklab build ${alias}`)
    process.exit(1)
  }

  const { createRequire } = await import('module')
  const req = createRequire(import.meta.url)
  const compiled = req(compiledPath)
  const routes = compiled.routes ?? []
  const nodes = compiled.nodes ?? []

  log.header('0.1.0', alias)
  console.log(`  Génération des use cases...\n`)

  const useCases: GeneratedUseCase[] = []
  let idCounter = 0
  const makeId = (from: string, to: string, suffix = '') =>
    `UC-${alias}-${from}-${to}${suffix ? '-' + suffix : ''}-${++idCounter}`

  // ── 1. Routes physiques ───────────────────────────────────────────────────

  const physical = routes.filter((r: any) => !r.semantic)
  for (const r of physical) {
    useCases.push({
      id: makeId(r.from, r.to),
      from: r.from,
      to: r.to,
      description: `${r.from} → ${r.to}`,
      path: r.primary.path,
      weight: r.primary.weight,
      type: 'physical'
    })
  }

  // ── 2. Routes sémantiques ─────────────────────────────────────────────────

  const semantic = routes.filter((r: any) => r.semantic && !r.composed)
  const preComposed = routes.filter((r: any) => r.composed)
  for (const r of semantic) {
    useCases.push({
      id: makeId(r.from, r.to, r.label),
      from: r.from,
      to: r.to,
      semantic: r.label,
      description: `${r.from} → ${r.to} (${r.label})`,
      path: r.primary.path,
      weight: r.primary.weight,
      type: 'semantic'
    })
  }

  // ── 3. Routes composées pré-compilées ────────────────────────────────────
  // Utiliser les routes composées déjà dans le compilé (évite re-composition)
  for (const r of preComposed) {
    useCases.push({
      id: makeId(r.from, r.to, r.label),
      from: r.from,
      to: r.to,
      semantic: r.label,
      via: r.primary.path.slice(1, -1),
      description: r.label ?? `${r.from} → ${r.to} (composed)`,
      path: r.primary.path,
      weight: r.primary.weight,
      type: 'composed' as const
    })
  }

  // ── Sauvegarder ───────────────────────────────────────────────────────────

  const outFile = path.join(outDir, `${alias}.use-cases.gen.json`)
  fs.writeFileSync(outFile, JSON.stringify(useCases, null, 2))

  const physical_count = useCases.filter(u => u.type === 'physical').length
  const semantic_count = useCases.filter(u => u.type === 'semantic').length
  const composed_count = useCases.filter(u => u.type === 'composed').length

  console.log(`  ✔  ${useCases.length} use cases générés`)
  console.log(
    `     ${physical_count} physiques · ${semantic_count} sémantiques · ${composed_count} composés`
  )
  console.log()
  console.log(`  ✔  ${path.relative(cwd, outFile).replace(/\\/g, '/')}`)
  console.log()
  console.log(`     → Lance : linklab test ${alias}`)
  console.log()
}

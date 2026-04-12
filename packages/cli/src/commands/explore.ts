/**
 * explore.ts — linklab explore
 *
 * Wrapper autour du TUI générique (src/examples/tui/tui.tsx).
 * Lance le TUI avec le compiled-graph du projet courant.
 *
 * Usage :
 *   linklab explore
 *   linklab explore --roots movies,people
 *   linklab explore --label "Netflix Explorer"
 *   linklab explore --compiled path/to/compiled-graph.json
 *   linklab explore --pg database=dvdrental host=localhost
 */

import * as fs from 'fs'
import * as path from 'path'
import * as cp from 'child_process'
import chalk from 'chalk'
import { loadConfig } from '../config.js'

export interface ExploreOptions {
  compiled?: string // --compiled path/to/compiled-graph.json
  roots?: string // --roots movies,people
  label?: string // --label "Netflix Explorer"
  data?: string // --data ./data
  pg?: string // --pg database=dvdrental host=localhost
  mock?: boolean // --mock
}

export async function explore(options: ExploreOptions = {}): Promise<void> {
  const cwd = process.cwd()

  // ── Résoudre le compiled-graph ─────────────────────────────────────────────

  let compiledPath = options.compiled

  if (!compiledPath) {
    // Chercher dans linklab/generated/ (projet init)
    let config
    try {
      config = await loadConfig(cwd)
    } catch {
      config = null
    }

    const outDir = path.resolve(cwd, config?.output?.dir ?? './linklab', 'generated')
    const candidate = path.join(outDir, 'compiled-graph.json')

    if (fs.existsSync(candidate)) {
      compiledPath = candidate
    }
  }

  if (!compiledPath || !fs.existsSync(compiledPath)) {
    console.log()
    console.log(`  ${chalk.red('✖')}  compiled-graph.json introuvable`)
    console.log(`     ${chalk.dim('Lance "linklab build" d\'abord')}`)
    console.log()
    process.exit(1)
  }

  // ── Résoudre le TUI ────────────────────────────────────────────────────────

  // Chercher tui.tsx dans @linklab/core
  const tuiCandidates = [
    path.resolve(cwd, '../../packages/linklab/src/examples/tui/tui.tsx'),
    path.resolve(cwd, '../linklab/src/examples/tui/tui.tsx')
  ]

  const tuiPath = tuiCandidates.find(p => fs.existsSync(p))

  if (!tuiPath) {
    console.log()
    console.log(`  ${chalk.red('✖')}  TUI introuvable`)
    console.log(`     ${chalk.dim('Vérifie que @linklab/core est installé')}`)
    console.log()
    process.exit(1)
  }

  // ── Construire les args pour tui.tsx ───────────────────────────────────────

  const args: string[] = ['--compiled', compiledPath]

  // Roots : depuis options, config, ou tous les nodes du compiled-graph
  let roots = options.roots
  if (!roots) {
    let config
    try {
      config = await loadConfig(cwd)
    } catch {
      config = null
    }
    if (config?.roots?.length) {
      roots = config.roots.join(',')
    } else {
      // Fallback : tous les nodes du compiled-graph comme racines potentielles
      try {
        const c = JSON.parse(fs.readFileSync(compiledPath, 'utf-8'))
        // Exclure les tables de jonction (credits, film_actor...) — celles sans label propre
        const pivotPattern = /credit|junction|pivot|film_actor|film_category/i
        const allRoots = c.nodes
          .map((n: any) => n.id as string)
          .filter((id: string) => !pivotPattern.test(id))
        if (allRoots.length) roots = allRoots.join(',')
      } catch {}
    }
  }
  if (roots) args.push('--roots', roots)
  if (options.label) args.push('--label', options.label)
  if (options.data) args.push('--data', options.data)
  if (options.mock) args.push('--mock')

  // Mode postgres
  if (options.pg) {
    args.push('--pg', ...options.pg.split(' '))
  } else if (!options.data && !options.mock) {
    // Mode memory : chercher data/ depuis config.source.dataDir en priorité
    // puis à côté du compiled-graph
    let config
    try {
      config = await loadConfig(cwd)
    } catch {
      config = null
    }

    const dataCandidates = [
      // 1. config.source.dataDir (linklab.config.ts)
      config?.source?.dataDir ? path.resolve(cwd, config.source.dataDir) : null,
      // 2. data/ à côté du compiled-graph (2 niveaux au-dessus de generated/)
      path.join(path.dirname(compiledPath), '..', 'data'),
      path.join(path.dirname(compiledPath), '..', '..', 'data')
    ].filter(Boolean) as string[]

    const dataDir = dataCandidates.find(d => fs.existsSync(d))
    if (dataDir) {
      args.push('--data', dataDir)
    }
  }

  // Lire le label depuis compiled-graph si pas fourni
  if (!options.label) {
    try {
      const c = JSON.parse(fs.readFileSync(compiledPath, 'utf-8'))
      if (c.scenario) args.push('--label', c.scenario)
    } catch {}
  }

  // ── Lancer le TUI ─────────────────────────────────────────────────────────

  console.log()
  console.log(
    `  ${chalk.bold.white('linklab explore')}  ·  ${chalk.gray(path.relative(cwd, compiledPath))}`
  )
  console.log()

  const result = cp.spawnSync('tsx', [tuiPath, ...args], {
    stdio: 'inherit',
    shell: true
  })

  // Restaurer le terminal après fermeture du TUI
  // Ink + @zenobius/ink-mouse ne restaurent pas le mode souris à la sortie
  process.stdout.write('\x1b[?1003l') // désactiver mouse any-event tracking
  process.stdout.write('\x1b[?1006l') // désactiver SGR mouse mode
  process.stdout.write('\x1b[?1000l') // désactiver mouse button tracking
  process.stdout.write('\x1b[?25h') // réafficher le curseur

  process.exit(result.status ?? 0)
}

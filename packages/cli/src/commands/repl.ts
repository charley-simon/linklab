/**
 * repl.ts — linklab repl <alias>
 *
 * REPL interactif pour naviguer un graphe LinkLab.
 * Lit la config {alias}.linklab.ts pour résoudre les chemins.
 *
 * Usage :
 *   linklab repl cinema
 *   linklab repl dvdrental
 */

import readline from 'readline'
import * as path from 'path'
import * as fs from 'fs'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import { loadConfig, resolveAlias } from '../config.js'
import type { ReplOptions } from '../types.js'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ── Couleurs ANSI ─────────────────────────────────────────────────────────────

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m'
}
const c = (color: string, s: string) => `${color}${s}${C.reset}`

// ── Breadcrumb sémantique ─────────────────────────────────────────────────────

/**
 * resolveBreadcrumb — traduit un chemin structurel en label humain.
 *
 * Cherche dans le dictionnaire la route dont le path correspond,
 * ou reconstruit un label depuis les étapes sémantiques.
 *
 * ['people','credits','movies','credits','people'] + dict
 * → "Acteurs des films dirigés par"   (si label dans dict)
 * → "director_in → actor"             (si label brut dans compilé)
 * → "people → credits → movies → credits → people"  (fallback)
 */
function resolveBreadcrumb(
  rpath: string[],
  semLabel: string | undefined,
  compiled: any,
  dictionary: any
): string {
  if (!rpath || rpath.length <= 1) return ''

  const dictRoutes = dictionary?.routes ?? {}
  const routes = compiled?.routes ?? []

  // Si on a un semanticLabel du Trail (ex: "director_in→actor")
  // chercher d'abord dans le dictionnaire par label
  if (semLabel) {
    // Chercher une route compilée avec ce label
    const match = routes.find((r: any) => r.label === semLabel)
    if (match) {
      const from = match.from,
        to = match.to
      const dictKey = `${from}→${to}[${semLabel}]`
      const dictEntry = dictRoutes[dictKey]
      if (dictEntry?.label) return dictEntry.label
    }
    // Pas dans le dict — retourner le label brut
    return semLabel
  }

  // Fallback : chercher par primary.path
  const pathKey = rpath.join('→')
  const matchByPath = routes.find(
    (r: any) => r.primary?.path && r.primary.path.join('→') === pathKey
  )
  if (matchByPath?.label && typeof matchByPath.label === 'string') {
    const from = matchByPath.from,
      to = matchByPath.to,
      label = matchByPath.label
    const dictKey = matchByPath.semantic ? `${from}→${to}[${label}]` : `${from}→${to}`
    const dictEntry = dictRoutes[dictKey]
    if (dictEntry?.label) return dictEntry.label
    return label
  }

  // Fallback structurel
  return rpath.join(' → ')
}

// ── Commande principale ───────────────────────────────────────────────────────

export async function repl(options: ReplOptions = {}): Promise<void> {
  const cwd = process.cwd()

  // ── Résoudre l'alias et la config ─────────────────────────────────────────

  let alias: string
  let config: any
  let outDir: string

  try {
    const resolved = resolveAlias(cwd, options.alias)
    alias = resolved ?? 'graph'
    ;({ config, outDir } = await loadConfig(cwd, alias))
  } catch (e) {
    console.error('\n  ✖', (e as Error).message)
    process.exit(1)
  }

  // Chemin du graphe compilé — convention {alias}.json
  const compiledPath = path.join(outDir, `${alias}.json`)

  if (!fs.existsSync(compiledPath)) {
    console.error(
      `\n  ✖  Graph introuvable : ${path.relative(cwd, compiledPath).replace(/\\/g, '/')}`
    )
    console.error(`     Lance d'abord : linklab build ${alias}\n`)
    process.exit(1)
  }

  // ── Charger le graphe ─────────────────────────────────────────────────────

  const { Graph, PostgresProvider } = await import('@linklab/core')

  // Dotenv — via require (pas de dépendance de type)
  try {
    const dotenvMod = require('dotenv')
    let dir = cwd
    for (let i = 0; i < 4; i++) {
      const candidate = path.join(dir, '.env')
      if (fs.existsSync(candidate)) {
        dotenvMod.config({ path: candidate })
        break
      }
      const parent = path.dirname(dir)
      if (parent === dir) break
      dir = parent
    }
  } catch {
    /* dotenv optionnel */
  }

  const compiled = require(compiledPath)
  const rawGraph = { nodes: compiled.nodes, edges: [] }

  // Charger le dictionnaire résolu (labels humains)
  const dictPath = path.join(outDir, `${alias}.dictionary.gen.json`)
  const dictionary = fs.existsSync(dictPath) ? require(dictPath) : null

  let graph: any
  let domain: any
  let mode: string

  // Mode JSON depuis config.source.dataDir
  if (config.source?.type === 'json' && config.source?.dataDir) {
    const dataDirAbs = path.resolve(cwd, config.source.dataDir)
    const dataset: Record<string, any[]> = {}
    for (const node of compiled.nodes) {
      const file = path.join(dataDirAbs, `${node.id}.json`)
      if (fs.existsSync(file)) dataset[node.id] = require(file)
    }
    graph = new Graph(rawGraph, { compiled, dataset, dictionary })
    domain = graph.domain()
    mode = `json:${path.relative(cwd, dataDirAbs)}`
  }
  // Mode Postgres
  else if (config.source?.type === 'postgres' || process.env.PGDATABASE) {
    const provider = new PostgresProvider({
      host: config.source?.host ?? process.env.PGHOST ?? 'localhost',
      port: parseInt(config.source?.port ?? process.env.PGPORT ?? '5432'),
      database: config.source?.database ?? process.env.PGDATABASE ?? 'postgres',
      user: config.source?.user ?? process.env.PGUSER ?? 'postgres',
      password: config.source?.password ?? process.env.PGPASSWORD ?? ''
    })
    graph = new Graph(rawGraph, { compiled, provider, dictionary })
    domain = graph.domain()
    mode = `postgres:${config.source?.database ?? process.env.PGDATABASE}`
  } else {
    console.error(c(C.red, '\n  ✖  Impossible de déterminer le mode de données'))
    console.error(c(C.dim, `     Définis source.type dans ${alias}.linklab.ts\n`))
    process.exit(1)
  }

  const entities = graph.entities.map((e: any) => e.id)

  console.log(c(C.bold + C.cyan, `\n  LinkLab REPL  ·  ${mode}  ·  ${entities.length} entités`))
  console.log(c(C.dim, `  Entités : ${entities.join(', ')}`))
  console.log(c(C.dim, `  Tapez "help" pour l'aide, ".exit" pour quitter\n`))

  // Pré-calculer tous les labels disponibles au niveau root (domain proxy)
  // = entités physiques + labels sémantiques (ex: director, directors, actor, actors...)
  const rootLabels: string[] = (() => {
    const labels = new Set<string>([...entities])
    const routes = (compiled.routes ?? []) as any[]
    for (const r of routes) {
      if (!r.semantic || !r.label) continue
      const label = r.label as string
      // label sans _in : ex 'actor', 'director' → point d'entrée valide
      if (!label.endsWith('_in')) labels.add(label)
      // Pluriel : 'actors', 'directors'
      const plural = label.endsWith('s') ? label : `${label}s`
      labels.add(plural)
      // label _in → singulier sans _in : 'director_in' → 'director'
      if (label.endsWith('_in')) {
        labels.add(label.slice(0, -3))
        labels.add(`${label.slice(0, -3)}s`)
      }
    }
    return [...labels]
  })()

  function completer(line: string): [string[], string] {
    const builtins = ['graph', 'links ', 'routes ', 'help', '.exit']

    if (line.startsWith('links ')) {
      const partial = line.slice(6)
      const hits = entities.filter((e: string) => e.startsWith(partial))
      return [hits.map((e: string) => `links ${e}`), line]
    }

    if (line.startsWith('graph.')) {
      const partial = line.slice(6)
      const methods = ['from(', 'entities', 'relations', 'weights', 'schema', 'linksFrom(']
      const hits = methods.filter(m => m.startsWith(partial))
      return [hits.map(m => `graph.${m}`), line]
    }

    const chainMatch = line.match(
      new RegExp(`^${alias}\\.([a-zA-Z_][a-zA-Z0-9_]*)\\([^)]*\\)\\.(.*)$`)
    )
    if (chainMatch) {
      const entity = chainMatch[1]
      const partial = chainMatch[2]
      const links = graph.linksFrom(entity)
      // Labels depuis linksFrom + labels sémantiques applicables depuis cet entity
      const fromLinks = links.map((l: any) => l.label)
      // Ajouter les filtres sémantiques (singular) : director, actor...
      const semFilters = (compiled.routes ?? ([] as any[]))
        .filter((r: any) => r.semantic && r.from === entity && !r.composed)
        .map((r: any) => {
          const lbl = r.label as string
          return lbl.endsWith('_in') ? lbl.slice(0, -3) : lbl
        })
      const allLabels = [...new Set([...fromLinks, ...semFilters])]
      const hits = allLabels.filter((l: string) => l.startsWith(partial))
      const prefix = `${alias}.${entity}(${chainMatch[0].match(/\(([^)]*)\)/)?.[1] ?? ''}).`
      return [hits.map((l: string) => `${prefix}${l}`), line]
    }

    const domainMatch = line.match(new RegExp(`^${alias}\\.(.*)$`))
    if (domainMatch) {
      const partial = domainMatch[1]
      const hits = rootLabels.filter((s: string) => s.startsWith(partial))
      return [hits.map((s: string) => `${alias}.${s}`), line]
    }

    const topLevel = [`${alias}.`, 'graph.', ...builtins]
    const hits = topLevel.filter(s => s.startsWith(line))
    return [hits.length ? hits : topLevel, line]
  }

  // ── REPL readline ─────────────────────────────────────────────────────────

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    historySize: 100,
    completer
  })

  const ctx = { graph, [alias]: domain }
  rl.setPrompt(c(C.cyan + C.bold, '▸ ') + C.reset)
  rl.prompt()

  rl.on('line', async line => {
    const input = line.trim()
    if (!input) {
      rl.prompt()
      return
    }

    if (input === '.exit' || input === 'exit' || input === 'quit') {
      console.log(c(C.dim, 'Au revoir !'))
      rl.close()
      process.exit(0)
    }
    if (input === 'help') {
      console.log(`
${c(C.bold + C.cyan, 'Commandes REPL :')}
  ${c(C.green, `${alias}.movies`)}                Films
  ${c(C.green, `${alias}.directors('Nolan').movies`)}  Films de Nolan
  ${c(C.green, 'graph')}                     Infos sur le graphe
  ${c(C.green, 'links <entity>')}            Liens depuis une entité
  ${c(C.green, 'routes <a> <b>')}           Chemin entre deux entités
  ${c(C.green, '.exit')}                    Quitter
`)
      rl.prompt()
      return
    }

    if (input === 'graph') {
      console.log(`\n  Mode     : ${c(C.cyan, mode)}`)
      console.log(`  Entités  : ${c(C.green, String(entities.length))} (${entities.join(', ')})`)
      console.log(`  Routes   : ${c(C.green, String(compiled.routes?.length ?? '?'))}\n`)
      rl.prompt()
      return
    }

    const linksMatch = input.match(/^links\s+(\S+)$/)
    if (linksMatch) {
      const links = graph.linksFrom(linksMatch[1])
      if (!links.length) {
        console.log(c(C.dim, '  (aucun lien)'))
        rl.prompt()
        return
      }
      console.log(`\n  ${c(C.bold, linksMatch[1])} →`)
      links
        .filter((l: any) => !l.semantic)
        .forEach((l: any) => console.log(`  ${c(C.cyan, l.label)}`))
      links
        .filter((l: any) => l.semantic)
        .forEach((l: any) => console.log(`  ${c(C.magenta, `${l.label} → ${l.to}`)}`))
      console.log()
      rl.prompt()
      return
    }

    const routesMatch = input.match(/^routes\s+(\S+)\s+(\S+)$/)
    if (routesMatch) {
      try {
        const result = graph.from(routesMatch[1]).to(routesMatch[2]).paths()
        console.log(`\n  ${result.paths?.length ?? 0} chemin(s) trouvé(s)\n`)
      } catch (e) {
        console.log(c(C.red, `  Erreur : ${(e as Error).message}`))
      }
      rl.prompt()
      return
    }

    try {
      const start = Date.now()
      const paramNames = Object.keys(ctx)
      const paramVals = Object.values(ctx)

      // Compiler séparément pour distinguer SyntaxError vs erreur d'exécution
      let fn: Function
      try {
        // eslint-disable-next-line no-new-func
        fn = new Function(...paramNames, `return (${input})`)
      } catch (syntaxErr) {
        const msg = (syntaxErr as Error).message
        // Sur Windows, readline peut envoyer des lignes incomplètes — ignorer silencieusement
        if (msg.includes('Unexpected end') || msg.includes('Unterminated')) {
          rl.prompt()
          return
        }
        console.log(c(C.red, `  ✖  Syntaxe invalide : ${msg}`))
        rl.prompt()
        return
      }

      const raw = fn(...paramVals)
      const result = await Promise.resolve(raw)
      const ms = Date.now() - start

      if (result === undefined || result === null) {
        console.log(c(C.dim, '  undefined'))
      } else if (Array.isArray(result)) {
        // Breadcrumb — chemin réel parcouru par le Trail
        const rpath = (result as any).path as string[] | undefined
        const semLabel = (result as any).semanticLabel as string | undefined
        const breadcrumb =
          rpath && rpath.length > 1
            ? `\n  ${c(C.dim + C.cyan, '↳ ' + resolveBreadcrumb(rpath, semLabel, compiled, dictionary))}`
            : ''
        console.log(c(C.dim, `\n  ${result.length} résultat(s) — ${ms}ms`) + breadcrumb)
        result.slice(0, 10).forEach((row: any, i: number) => {
          console.log(`  ${c(C.dim, String(i + 1) + '.')} ${JSON.stringify(row)}`)
        })
        if (result.length > 10) console.log(c(C.dim, `  … et ${result.length - 10} de plus`))
        console.log()
      } else {
        console.log(`  ${JSON.stringify(result, null, 2)}`)
      }
    } catch (e) {
      console.log(c(C.red, `  ✖  ${(e as Error).message}`))
    }

    rl.prompt()
  })

  rl.on('close', () => process.exit(0))
}

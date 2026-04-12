/**
 * regenerate.ts — Script de régénération des graphes compilés
 *
 * Usage :
 *   npx tsx regenerate.ts netflix
 *   npx tsx regenerate.ts dvdrental --pg host=localhost user=postgres password=secret
 *   npx tsx regenerate.ts all
 *
 * Régénère compiled-graph.json pour chaque scénario.
 * Bumpe automatiquement la version dans le fichier produit.
 *
 * Versioning :
 *   - Graphes générés (netflix, dvdrental) : version dans compiled-graph.json
 *     format : MAJOR.MINOR.PATCH  ex: 2.0.0
 *     MAJOR = version du GraphCompiler (structure breaking)
 *     MINOR = changement de schéma (nouvelles tables/relations)
 *     PATCH = recompilation (nouveaux poids, métriques)
 *
 *   - Graphes manuels (metro, musicians) : version dans raw-graph.json + compiled
 *     Patch manuel dans raw-graph.json, puis npx tsx regenerate.ts metro
 */

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

import { JsonSchemaExtractor } from '../schema/JsonSchemaExtractor.js'
import { SchemaAnalyzer } from '../schema/SchemaAnalyzer.js'
import { GraphBuilder } from '../schema/GraphBuilder.js'
import { GraphAssembler } from '../graph/GraphAssembler.js'
import { GraphCompiler } from '../graph/GraphCompiler.js'
import { PathFinder } from '../core/PathFinder.js'
import type { MetricsMap, TrainingMetrics, UseCase } from '../types/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT = path.join(__dirname, '..', 'examples')
const CONFIG_DIR = path.join(__dirname, '..', '..', 'config')

// ── Helpers ───────────────────────────────────────────────────────────────────

function save(filepath: string, data: unknown) {
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2))
  const kb = (fs.statSync(filepath).size / 1024).toFixed(1)
  console.log(`   💾 ${path.basename(filepath).padEnd(25)} ${kb} KB`)
}

function bumpPatch(current: string): string {
  const parts = current.split('.').map(Number)
  if (parts.length !== 3 || parts.some(isNaN)) return '2.0.0'
  parts[2]++
  return parts.join('.')
}

function readCurrentVersion(compiledPath: string): string {
  try {
    const c = JSON.parse(fs.readFileSync(compiledPath, 'utf-8'))
    return c.version ?? '2.0.0'
  } catch {
    return '2.0.0'
  }
}

// ── Entraînement local (sans provider externe) ────────────────────────────────

function trainLocal(graph: any, useCases: UseCase[]): MetricsMap {
  const metrics: MetricsMap = new Map<string, TrainingMetrics>()
  const finder = new PathFinder(graph)

  for (const uc of useCases) {
    const paths = finder.findAllPaths(uc.from, uc.to)
    for (const p of paths) {
      metrics.set(p.join('→'), {
        path: p,
        executions: 10,
        successes: 10,
        totalTime: 100,
        avgTime: 10,
        minTime: 8,
        maxTime: 12,
        used: true,
        failed: false
      })
    }
  }
  return metrics
}

// ── Pipeline JSON (netflix, cinema, etc.) ─────────────────────────────────────

async function regenerateFromJSON(scenario: string) {
  const dir = path.join(ROOT, scenario)
  const dataDir = path.join(dir, 'data')
  const compiledOut = path.join(dir, 'compiled-graph.json')

  if (!fs.existsSync(dataDir)) {
    console.error(`  ❌ data/ not found: ${dataDir}`)
    return
  }

  console.log(`\n🔄 ${scenario} — pipeline JSON`)
  console.log('─'.repeat(50))

  // Step 1 : Extraction
  const extractor = new JsonSchemaExtractor(dataDir)
  const techSchema = await extractor.extract()
  save(path.join(dir, 'schema.json'), techSchema)

  // Step 2 : Analyse
  const analyzer = new SchemaAnalyzer(CONFIG_DIR, dataDir)
  const analyzedSchema = analyzer.analyze(techSchema)
  save(path.join(dir, 'analyzed-schema.json'), analyzedSchema)

  // Step 3 : Dictionnaire
  const builder = new GraphBuilder()
  const dictionary = builder.build(analyzedSchema, dataDir)
  save(path.join(dir, 'dictionary.json'), dictionary)

  // Step 4 : Graphe brut
  const assembler = new GraphAssembler()
  const rawGraph = assembler.assemble(dictionary)
  save(path.join(dir, 'raw-graph.json'), rawGraph)
  console.log(`   📊 ${rawGraph.nodes.length} nœuds · ${rawGraph.edges.length} arêtes`)

  // Step 5 : Use cases (lire depuis use-cases.json si présent, sinon défaut)
  const ucFile = path.join(dir, 'use-cases.json')
  const useCases: UseCase[] = fs.existsSync(ucFile)
    ? JSON.parse(fs.readFileSync(ucFile, 'utf-8'))
    : buildDefaultUseCases(rawGraph)

  const metrics = trainLocal(rawGraph, useCases)
  save(path.join(dir, 'metrics.json'), Object.fromEntries(metrics))

  // Step 6 : Compilation
  const prevVersion = readCurrentVersion(compiledOut)
  const newVersion = bumpPatch(prevVersion)

  const compiler = new GraphCompiler({ weightThreshold: 1000, keepFallbacks: true })
  const compiledGraph = compiler.compile(rawGraph, metrics)
  ;(compiledGraph as any).version = newVersion
  ;(compiledGraph as any).scenario = scenario

  save(compiledOut, compiledGraph)

  const stats = GraphCompiler.getStats(compiledGraph)
  console.log(
    `\n   ✅ ${stats.totalRoutes} routes  (${stats.physical} physical · ${stats.semantic} semantic)`
  )
  console.log(`   📌 version: ${prevVersion} → ${newVersion}`)
}

// ── Pipeline manuel (metro, musicians) ───────────────────────────────────────
// raw-graph.json édité à la main → on recompile seulement

async function recompileManual(scenario: string) {
  const dir = path.join(ROOT, scenario)
  const rawPath = path.join(dir, 'raw-graph.json')
  const compiledOut = path.join(dir, 'compiled-graph.json')

  if (!fs.existsSync(rawPath)) {
    console.error(`  ❌ raw-graph.json not found: ${rawPath}`)
    return
  }

  console.log(`\n🔄 ${scenario} — recompile manual graph`)
  console.log('─'.repeat(50))

  const rawGraph = JSON.parse(fs.readFileSync(rawPath, 'utf-8'))

  const ucFile = path.join(dir, 'use-cases.json')
  const useCases: UseCase[] = fs.existsSync(ucFile)
    ? JSON.parse(fs.readFileSync(ucFile, 'utf-8'))
    : buildDefaultUseCases(rawGraph)

  const metrics = trainLocal(rawGraph, useCases)

  const prevVersion = readCurrentVersion(compiledOut)
  const newVersion = bumpPatch(prevVersion)

  const compiler = new GraphCompiler({ weightThreshold: 1000, keepFallbacks: true })
  const compiledGraph = compiler.compile(rawGraph, metrics)
  ;(compiledGraph as any).version = newVersion
  ;(compiledGraph as any).scenario = scenario

  save(compiledOut, compiledGraph)

  const stats = GraphCompiler.getStats(compiledGraph)
  console.log(
    `   ✅ ${stats.totalRoutes} routes  (${stats.physical} physical · ${stats.semantic} semantic)`
  )
  console.log(`   📌 version: ${prevVersion} → ${newVersion}`)
}

// ── Déterminer le type de scénario ────────────────────────────────────────────

function scenarioType(scenario: string): 'json' | 'manual' | 'unknown' {
  const dir = path.join(ROOT, scenario)
  if (fs.existsSync(path.join(dir, 'data'))) return 'json'
  if (fs.existsSync(path.join(dir, 'raw-graph.json'))) return 'manual'
  return 'unknown'
}

function buildDefaultUseCases(graph: any): UseCase[] {
  // Générer des use cases par défaut depuis les nœuds du graphe
  const nodes = graph.nodes.map((n: any) => n.id as string)
  const cases: UseCase[] = []
  for (let i = 0; i < Math.min(nodes.length, 4); i++) {
    for (let j = 0; j < Math.min(nodes.length, 4); j++) {
      if (i !== j)
        cases.push({ from: nodes[i], to: nodes[j], description: `${nodes[i]}→${nodes[j]}` })
    }
  }
  return cases
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  const scenarios =
    args[0] === 'all'
      ? fs.readdirSync(ROOT).filter(d => fs.statSync(path.join(ROOT, d)).isDirectory())
      : args.filter(a => !a.startsWith('--'))

  if (!scenarios.length) {
    console.log('Usage: npx tsx regenerate.ts <scenario|all> [--pg ...]')
    console.log('Examples:')
    console.log('  npx tsx regenerate.ts netflix')
    console.log('  npx tsx regenerate.ts metro musicians')
    console.log('  npx tsx regenerate.ts all')
    process.exit(0)
  }

  for (const scenario of scenarios) {
    const type = scenarioType(scenario)
    if (type === 'json') await regenerateFromJSON(scenario)
    else if (type === 'manual') await recompileManual(scenario)
    else console.warn(`  ⚠️  ${scenario}: unknown scenario type (no data/ nor raw-graph.json)`)
  }

  console.log('\n✅ Done\n')
}

main().catch(err => {
  console.error('❌', err)
  process.exit(1)
})

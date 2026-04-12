/**
 * stress.ts — linklab stress <alias>
 *
 * Test de performance et de charge sur les routes compilées.
 *
 * Modes :
 *   linklab stress cinema                     → séquentiel (1 passe)
 *   linklab stress cinema --runs 10           → séquentiel N passes
 *   linklab stress cinema --load              → charge (p95, p99, seuils)
 *   linklab stress cinema --concurrent --vu 5 --think 1000  → VU avec think time
 *   linklab stress cinema --watch             → boucle infinie (Esc/Ctrl+C)
 *
 * Métriques :
 *   - Temps par route : avg, p50, p95, p99, min, max
 *   - Mémoire : heap used par passe, détection de fuite
 *   - Throughput : routes/sec
 */

import * as fs from 'fs'
import * as path from 'path'
import chalk from 'chalk'
import { loadConfig, resolveAlias } from '../config.js'
import type { GeneratedUseCase } from './generate.js'

// ── Types ─────────────────────────────────────────────────────────────────────

interface RouteMetrics {
  id: string
  from: string
  to: string
  type: string
  semantic?: string
  description: string
  runs: number
  avg: number
  min: number
  max: number
  p50: number
  p95: number
  p99: number
  errors: number
}

interface PassMetrics {
  passIndex: number
  durationMs: number
  heapMB: number
  ok: number
  errors: number
}

interface StressReport {
  alias: string
  mode: 'sequential' | 'load' | 'concurrent'
  runs: number
  vu?: number
  thinkMs?: number
  totalDurationMs: number
  routes: RouteMetrics[]
  passes: PassMetrics[]
  memory: {
    startMB: number
    endMB: number
    peakMB: number
    trend: 'stable' | 'increasing' | 'decreasing'
    leakSuspected: boolean
  }
  thresholds: {
    slowMs: number
    criticalMs: number
    slow: number
    critical: number
    ok: number
  }
}

// ── Helpers stats ─────────────────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, idx)]
}

function heapMB(): number {
  return Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 10) / 10
}

function memTrend(passes: PassMetrics[]): 'stable' | 'increasing' | 'decreasing' {
  if (passes.length < 3) return 'stable'
  const heaps = passes.map(p => p.heapMB)
  const first = heaps.slice(0, Math.floor(heaps.length / 2))
  const last = heaps.slice(Math.floor(heaps.length / 2))
  const avgFirst = first.reduce((a, b) => a + b, 0) / first.length
  const avgLast = last.reduce((a, b) => a + b, 0) / last.length
  if (avgLast - avgFirst > 5) return 'increasing'
  if (avgFirst - avgLast > 5) return 'decreasing'
  return 'stable'
}

// ── Exécution d'un use case ───────────────────────────────────────────────────

async function runUseCase(
  uc: GeneratedUseCase,
  engine: any,
  compiled: any,
  dataset: Record<string, any[]> | null,
  provider: any
): Promise<{ ok: boolean; durationMs: number; error?: string }> {
  const start = Date.now()
  try {
    if (dataset) {
      engine.executeInMemory(
        {
          from: uc.from,
          to: uc.to,
          filters: {},
          ...(uc.semantic ? { semantic: uc.semantic } : {})
        },
        dataset
      )
    } else if (provider) {
      const sql = engine.generateSQL({
        from: uc.from,
        to: uc.to,
        filters: {},
        ...(uc.semantic ? { semantic: uc.semantic } : {})
      })
      await provider.query(`SELECT COUNT(*) as cnt FROM (${sql}) sub`)
    }
    return { ok: true, durationMs: Date.now() - start }
  } catch (e) {
    return { ok: false, durationMs: Date.now() - start, error: (e as Error).message }
  }
}

// ── Affichage dashboard ───────────────────────────────────────────────────────

function clearLines(n: number): void {
  for (let i = 0; i < n; i++) process.stdout.write('\x1B[1A\x1B[2K')
}

function renderDashboard(
  passIdx: number,
  totalRuns: number,
  passes: PassMetrics[],
  routeMap: Map<string, number[]>,
  useCases: GeneratedUseCase[],
  mode: string,
  vu: number,
  thinkMs: number,
  slowMs: number,
  critMs: number,
  watch: boolean,
  dashLines: number
): number {
  if (dashLines > 0) clearLines(dashLines)

  const lines: string[] = []
  const lastPass = passes[passes.length - 1]

  // En-tête
  const runStr = watch ? `Passe ${passIdx}/∞` : `Passe ${passIdx}/${totalRuns}`
  const modeStr = mode === 'concurrent' ? `VU: ${vu}  Think: ${thinkMs}ms` : mode
  lines.push(`  ${chalk.dim(runStr)}  ${chalk.dim('·')}  ${chalk.dim(modeStr)}`)
  lines.push('')

  // Bloc mémoire + perf
  const heapStr = passes
    .map(p => `${p.heapMB}`)
    .slice(-5)
    .join(' → ')
  const trend = memTrend(passes)
  const trendIcon =
    trend === 'increasing'
      ? chalk.yellow('↑')
      : trend === 'decreasing'
        ? chalk.green('↓')
        : chalk.green('→')
  const leakWarn = trend === 'increasing' && passes.length >= 5 ? chalk.yellow(' ⚠ fuite ?') : ''

  const allTimes = [...routeMap.values()].flat()
  const sortedAll = [...allTimes].sort((a, b) => a - b)
  const avgAll = allTimes.length
    ? Math.round(allTimes.reduce((a, b) => a + b, 0) / allTimes.length)
    : 0
  const p95All = percentile(sortedAll, 95)
  const p99All = percentile(sortedAll, 99)

  let slow = 0,
    crit = 0,
    ok = 0
  for (const times of routeMap.values()) {
    const avg = times.reduce((a, b) => a + b, 0) / times.length
    if (avg >= critMs) crit++
    else if (avg >= slowMs) slow++
    else ok++
  }

  lines.push(`  ${chalk.dim('┌' + '─'.repeat(57) + '┐')}`)
  lines.push(
    `  ${chalk.dim('│')} Heap    : ${chalk.cyan(heapStr + ' MB')}  ${trendIcon}${leakWarn}`.padEnd(
      70
    ) + chalk.dim('│')
  )
  lines.push(
    `  ${chalk.dim('│')} Routes  : ${chalk.green(`✔ ${ok}`)}  ${chalk.yellow(`⚠ ${slow}`)}  ${chalk.red(`✖ ${crit}`)}  Err: ${lastPass?.errors ?? 0}`.padEnd(
      70
    ) + chalk.dim('│')
  )
  lines.push(
    `  ${chalk.dim('│')} Avg     : ${chalk.white(avgAll + 'ms')}   P95: ${chalk.yellow(p95All + 'ms')}   P99: ${chalk.red(p99All + 'ms')}`.padEnd(
      70
    ) + chalk.dim('│')
  )
  lines.push(`  ${chalk.dim('└' + '─'.repeat(57) + '┘')}`)
  lines.push('')

  // Top 5 routes lentes
  const routeAvgs = [...routeMap.entries()]
    .map(([id, times]) => ({
      id,
      avg: Math.round(times.reduce((a, b) => a + b, 0) / times.length),
      uc: useCases.find(u => u.id === id)
    }))
    .filter(r => r.uc)
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 5)

  if (routeAvgs.length > 0) {
    lines.push(`  ${chalk.dim('Top routes lentes :')}`)
    for (const r of routeAvgs) {
      const icon =
        r.avg >= critMs ? chalk.red('✖') : r.avg >= slowMs ? chalk.yellow('⚠') : chalk.green('✔')
      const desc = r.uc?.description ?? r.id
      lines.push(
        `    ${icon}  ${chalk.dim(desc.slice(0, 45).padEnd(45))}  ${chalk.white(r.avg + 'ms')}`
      )
    }
  }

  lines.push('')
  lines.push(`  ${chalk.dim('Ctrl+C ou Esc pour arrêter')}`)

  console.log(lines.join('\n'))
  return lines.length
}

// ── Commande principale ───────────────────────────────────────────────────────

export async function stress(
  options: {
    alias?: string
    runs?: number
    load?: boolean
    concurrent?: boolean
    vu?: number
    think?: number
    watch?: boolean
    slowMs?: number
    criticalMs?: number
  } = {}
): Promise<void> {
  const cwd = process.cwd()

  let alias: string
  let outDir: string
  let config: any

  try {
    const resolved = resolveAlias(cwd, options.alias)
    if (!resolved) {
      console.error('\n  ✖  Alias requis : linklab stress <alias>\n')
      process.exit(1)
    }
    alias = resolved
    ;({ config, outDir } = await loadConfig(cwd, alias))
  } catch (e) {
    console.error(`\n  ✖  ${(e as Error).message}\n`)
    process.exit(1)
  }

  const compiledPath = path.join(outDir, `${alias}.json`)
  const ucGenPath = path.join(outDir, `${alias}.use-cases.gen.json`)

  if (!fs.existsSync(compiledPath)) {
    console.error(`\n  ✖  ${alias}.json introuvable — linklab build ${alias}\n`)
    process.exit(1)
  }
  if (!fs.existsSync(ucGenPath)) {
    console.error(`\n  ✖  use-cases.gen.json introuvable — linklab generate ${alias}\n`)
    process.exit(1)
  }

  const { createRequire } = await import('module')
  const req = createRequire(import.meta.url)
  const compiled = req(compiledPath)

  // Charger les use cases OK uniquement (d'après le test report)
  const testGenPath = path.join(outDir, `${alias}.test.gen.json`)
  let useCases: GeneratedUseCase[] = JSON.parse(fs.readFileSync(ucGenPath, 'utf-8'))

  if (fs.existsSync(testGenPath)) {
    const report = JSON.parse(fs.readFileSync(testGenPath, 'utf-8'))
    const okIds = new Set(
      report.results.filter((r: any) => r.status === 'ok').map((r: any) => r.id)
    )
    const filtered = useCases.filter(uc => okIds.has(uc.id))
    if (filtered.length > 0) useCases = filtered
  }

  // Charger le moteur
  const { Graph, QueryEngine } = await import('@linklab/core')
  const rawGraph = { nodes: compiled.nodes, edges: [] }
  let dataset: Record<string, any[]> | null = null
  let provider: any = null

  if (config.source?.type === 'json' && config.source?.dataDir) {
    const dataDirAbs = path.resolve(cwd, config.source.dataDir)
    dataset = {}
    for (const node of compiled.nodes) {
      const file = path.join(dataDirAbs, `${node.id}.json`)
      if (fs.existsSync(file)) dataset[node.id] = req(file)
    }
  } else if (config.source?.type === 'postgres' || process.env.PGDATABASE) {
    const { PostgresProvider } = await import('@linklab/core')
    provider = new PostgresProvider({
      host: config.source?.host ?? process.env.PGHOST ?? 'localhost',
      port: parseInt(config.source?.port ?? process.env.PGPORT ?? '5432'),
      database: config.source?.database ?? process.env.PGDATABASE ?? 'postgres',
      user: config.source?.user ?? process.env.PGUSER ?? 'postgres',
      password: config.source?.password ?? process.env.PGPASSWORD ?? ''
    })
  }

  // Paramètres
  const SLOW_MS = options.slowMs ?? 50
  const CRIT_MS = options.criticalMs ?? 200
  const TOTAL_RUNS = options.watch ? Infinity : (options.runs ?? 1)
  const VU = options.concurrent ? (options.vu ?? 3) : 1
  const THINK_MS = options.concurrent ? (options.think ?? 1000) : 0
  const MODE: 'sequential' | 'load' | 'concurrent' = options.concurrent
    ? 'concurrent'
    : options.load
      ? 'load'
      : 'sequential'

  // Affichage header
  console.log()
  console.log(`  ${chalk.bold.white('linklab stress')}  ·  ${chalk.cyan(alias)}`)
  console.log()
  console.log(
    `  ${chalk.dim(`${useCases.length} routes · mode: ${MODE}${options.watch ? ' · watch' : ''}${VU > 1 ? ` · ${VU} VU · think: ${THINK_MS}ms` : ''}`)}\n`
  )

  // State
  const routeMap = new Map<string, number[]>() // id → [durations]
  const passes: PassMetrics[] = []
  const startHeap = heapMB()
  let peakHeap = startHeap
  let passIdx = 0
  let dashLines = 0
  let running = true

  // Gestion arrêt — compatible Windows PowerShell
  // Ctrl+C ou Entrée pour arrêter
  process.on('SIGINT', () => {
    running = false
  })

  if (options.watch) {
    // Afficher l'instruction d'arrêt
    console.log(`  ${chalk.dim('Ctrl+C pour arrêter')}`)
    console.log()
    // Lire stdin en mode normal (compatible Windows)
    process.stdin.resume()
    process.stdin.setEncoding('utf8')
    process.stdin.once('data', () => {
      running = false
    })
  }

  const engine = new QueryEngine(compiled)
  const globalStart = Date.now()

  // ── Boucle principale ──────────────────────────────────────────────────────

  while (running && passIdx < TOTAL_RUNS) {
    passIdx++
    const passStart = Date.now()
    let passOk = 0,
      passErrors = 0
    let ucDone = 0

    if (MODE === 'concurrent') {
      // ── Mode concurrent : VU en parallèle avec think time ──────────────────
      const vuPromises = Array.from({ length: VU }, async (_, vuIdx) => {
        await new Promise(r => setTimeout(r, vuIdx * Math.floor(THINK_MS / VU)))

        for (const uc of useCases) {
          if (!running) break
          const result = await runUseCase(uc, engine, compiled, dataset, provider)
          if (!routeMap.has(uc.id)) routeMap.set(uc.id, [])
          routeMap.get(uc.id)!.push(result.durationMs)
          if (result.ok) passOk++
          else passErrors++
          ucDone++

          // Progression intra-passe
          const pct = Math.floor((ucDone / (useCases.length * VU)) * 20)
          const bar = '█'.repeat(pct) + '░'.repeat(20 - pct)
          process.stdout.write(
            `\r  ${chalk.dim(`[${bar}]`)} ${ucDone}/${useCases.length * VU}  heap: ${heapMB()}MB  `
          )

          if (THINK_MS > 0) {
            const jitter = Math.floor(THINK_MS * 0.3 * (Math.random() * 2 - 1))
            await new Promise(r => setTimeout(r, Math.max(0, THINK_MS + jitter)))
          }
        }
      })
      await Promise.all(vuPromises)
    } else {
      // ── Mode séquentiel / load : une route à la fois ──────────────────────
      for (const uc of useCases) {
        if (!running) break
        const result = await runUseCase(uc, engine, compiled, dataset, provider)
        if (!routeMap.has(uc.id)) routeMap.set(uc.id, [])
        routeMap.get(uc.id)!.push(result.durationMs)
        if (result.ok) passOk++
        else passErrors++
        ucDone++

        // Progression intra-passe
        const pct = Math.floor((ucDone / useCases.length) * 20)
        const bar = '█'.repeat(pct) + '░'.repeat(20 - pct)
        const passStr =
          TOTAL_RUNS === Infinity ? `passe ${passIdx}` : `passe ${passIdx}/${TOTAL_RUNS}`
        process.stdout.write(
          `\r  ${chalk.dim(`[${bar}]`)} ${ucDone}/${useCases.length}  ${chalk.dim(passStr)}  heap: ${heapMB()}MB  `
        )
      }
    }

    // Effacer la barre de progression
    process.stdout.write('\r' + ' '.repeat(70) + '\r')

    const heap = heapMB()
    if (heap > peakHeap) peakHeap = heap

    passes.push({
      passIndex: passIdx,
      durationMs: Date.now() - passStart,
      heapMB: heap,
      ok: passOk,
      errors: passErrors
    })

    // Dashboard après chaque passe (watch / load / concurrent)
    if (options.watch || options.load || options.concurrent) {
      dashLines = renderDashboard(
        passIdx,
        TOTAL_RUNS,
        passes,
        routeMap,
        useCases,
        MODE,
        VU,
        THINK_MS,
        SLOW_MS,
        CRIT_MS,
        options.watch ?? false,
        dashLines
      )
    }
  }

  if (options.watch) {
    process.stdin.pause()
  }

  // ── Rapport final ──────────────────────────────────────────────────────────

  process.stdout.write('\n')
  console.log()

  const endHeap = heapMB()
  const trend = memTrend(passes)
  const leakSusp = trend === 'increasing' && passes.length >= 5

  // Calculer les métriques par route
  const routeMetrics: RouteMetrics[] = []
  for (const [id, times] of routeMap.entries()) {
    const uc = useCases.find(u => u.id === id)
    if (!uc) continue
    const sorted = [...times].sort((a, b) => a - b)
    routeMetrics.push({
      id,
      from: uc.from,
      to: uc.to,
      type: uc.type,
      semantic: (uc as any).semantic,
      description: uc.description,
      runs: times.length,
      avg: Math.round(times.reduce((a, b) => a + b, 0) / times.length),
      min: sorted[0],
      max: sorted[sorted.length - 1],
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      p99: percentile(sorted, 99),
      errors: passes.reduce((acc, p) => acc + p.errors, 0)
    })
  }
  routeMetrics.sort((a, b) => b.avg - a.avg)

  const slow = routeMetrics.filter(r => r.avg >= SLOW_MS && r.avg < CRIT_MS).length
  const critical = routeMetrics.filter(r => r.avg >= CRIT_MS).length
  const ok = routeMetrics.filter(r => r.avg < SLOW_MS).length

  const report: StressReport = {
    alias,
    mode: MODE,
    runs: passIdx,
    ...(VU > 1 ? { vu: VU, thinkMs: THINK_MS } : {}),
    totalDurationMs: Date.now() - globalStart,
    routes: routeMetrics,
    passes,
    memory: {
      startMB: startHeap,
      endMB: endHeap,
      peakMB: peakHeap,
      trend,
      leakSuspected: leakSusp
    },
    thresholds: { slowMs: SLOW_MS, criticalMs: CRIT_MS, slow, critical, ok }
  }

  const outFile = path.join(outDir, `${alias}.stress.gen.json`)
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2))

  // ── Résumé terminal ────────────────────────────────────────────────────────

  console.log(
    `  ${chalk.bold.white('Résultats')}  ·  ${passIdx} passes  ·  ${Math.round((Date.now() - globalStart) / 1000)}s`
  )
  console.log()
  console.log(
    `  ${chalk.green('✔')}  Rapides    (< ${SLOW_MS}ms)   : ${chalk.green(String(ok).padStart(5))}` +
      chalk.dim(` (${Math.round((ok / routeMetrics.length) * 100)}%)`)
  )
  console.log(
    `  ${chalk.yellow('⚠')}  Lentes     (${SLOW_MS}-${CRIT_MS}ms) : ${chalk.yellow(String(slow).padStart(5))}` +
      chalk.dim(` (${Math.round((slow / routeMetrics.length) * 100)}%)`)
  )
  console.log(
    `  ${chalk.red('✖')}  Critiques  (> ${CRIT_MS}ms)  : ${chalk.red(String(critical).padStart(5))}` +
      chalk.dim(` (${Math.round((critical / routeMetrics.length) * 100)}%)`)
  )
  console.log()
  console.log(
    `  Mémoire : ${chalk.cyan(startHeap + ' MB')} → ${chalk.cyan(endHeap + ' MB')}` +
      (leakSusp ? chalk.yellow('  ⚠ fuite mémoire possible') : chalk.green('  ✔ stable'))
  )
  console.log()

  if (routeMetrics.length > 0 && (slow > 0 || critical > 0)) {
    console.log(`  ${chalk.dim('Top 5 routes lentes :')}`)
    for (const r of routeMetrics.slice(0, 5)) {
      const icon = r.avg >= CRIT_MS ? chalk.red('✖') : chalk.yellow('⚠')
      console.log(
        `    ${icon}  ${chalk.dim(r.description.slice(0, 48).padEnd(48))}` +
          `  avg=${chalk.white(r.avg + 'ms')}  p95=${chalk.yellow(r.p95 + 'ms')}`
      )
    }
    console.log()
  }

  console.log(`  ${chalk.green('✔')}  ${path.relative(cwd, outFile).replace(/\\/g, '/')}`)
  console.log()

  if (provider?.close) await provider.close()
}

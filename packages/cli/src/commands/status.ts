/**
 * status.ts — linklab status [alias]
 *
 * Affiche l'état du projet LinkLab :
 *   - Versions et dates des artefacts générés
 *   - Nombre de routes compilées (physical + semantic + composed)
 *   - Drift BDD (si source postgres)
 */

import * as fs from 'fs'
import * as path from 'path'
import chalk from 'chalk'
import { loadConfig, resolveAlias } from '../config.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(isoDate: string): string {
  try {
    return new Date(isoDate).toISOString().replace('T', ' ').slice(0, 16)
  } catch {
    return isoDate
  }
}

function fileStatus(filepath: string) {
  if (!fs.existsSync(filepath)) return { exists: false }
  const stat = fs.statSync(filepath)
  const size =
    stat.size > 1024 * 1024
      ? `${(stat.size / 1024 / 1024).toFixed(1)} MB`
      : `${(stat.size / 1024).toFixed(1)} KB`
  try {
    const json = JSON.parse(fs.readFileSync(filepath, 'utf-8'))
    return {
      exists: true,
      version: json.version,
      date: json.compiledAt ? formatDate(json.compiledAt) : undefined,
      size
    }
  } catch {
    return { exists: true, size }
  }
}

function statusLine(label: string, value: string, extra?: string, ok = true) {
  const C = ok ? chalk.green : chalk.yellow
  console.log(
    `  ${chalk.dim(label.padEnd(36))} ${C(value.padEnd(10))} ${extra ? chalk.dim(extra) : ''}`
  )
}

// ── Commande ──────────────────────────────────────────────────────────────────

export async function status(options: { alias?: string } = {}): Promise<void> {
  const cwd = process.cwd()

  // Résoudre l'alias
  let alias: string | undefined
  let outDir: string
  let config: any

  // Sans alias — lister tous les *.linklab.ts et afficher chacun
  if (!options.alias) {
    const aliases = fs
      .readdirSync(cwd)
      .filter(f => f.endsWith('.linklab.ts'))
      .map(f => f.replace('.linklab.ts', ''))

    if (aliases.length === 0) {
      console.log(`\n  ${chalk.yellow('⚠')}  Aucun fichier *.linklab.ts trouvé\n`)
      return
    }
    if (aliases.length > 1) {
      for (const a of aliases) await status({ alias: a })
      return
    }
    // Un seul alias — continuer normalement
    options = { alias: aliases[0] }
  }

  try {
    const resolved = resolveAlias(cwd, options.alias)
    alias = resolved ?? undefined
    if (alias) {
      ;({ config, outDir } = await loadConfig(cwd, alias))
    } else {
      console.log(`\n  ${chalk.yellow('⚠')}  Aucun fichier *.linklab.ts trouvé\n`)
      return
    }
  } catch {
    config = null
    outDir = path.resolve(cwd, `./linklab/${options.alias}`)
    alias = options.alias
  }

  // ── Chemins convention {alias}.* ─────────────────────────────────────────────

  const compiledPath = path.join(outDir, `${alias}.json`)
  const rawPath = path.join(outDir, `${alias}.reference.gen.json`)
  const schemaPath = path.join(outDir, '.linklab', `${alias}.schema.gen.json`)
  const ucGenPath = path.join(outDir, `${alias}.use-cases.gen.json`)
  const testGenPath = path.join(outDir, `${alias}.test.gen.json`)

  const compiled = fileStatus(compiledPath)
  const raw = fileStatus(rawPath)
  const schema = fileStatus(schemaPath)

  console.log()
  console.log(`  ${chalk.bold.white('linklab status')}  ·  ${chalk.cyan(alias)}`)
  console.log()

  // ── Artefacts ────────────────────────────────────────────────────────────────

  if (compiled.exists) {
    statusLine(`${alias}.json`, compiled.version ?? '?', compiled.date ?? '', true)
  } else {
    statusLine(`${alias}.json`, 'missing', `← linklab build ${alias}`, false)
  }

  if (raw.exists) {
    statusLine(`${alias}.reference.gen.json`, '✔', '', true)
  } else {
    statusLine(`${alias}.reference.gen.json`, 'missing', '', false)
  }

  if (schema.exists) {
    statusLine(`.linklab/${alias}.schema.gen.json`, '✔', '', true)
  } else {
    statusLine(`.linklab/${alias}.schema.gen.json`, 'missing', '', false)
  }

  console.log()

  // ── Routes ────────────────────────────────────────────────────────────────────

  if (compiled.exists) {
    try {
      const data = JSON.parse(fs.readFileSync(compiledPath, 'utf-8'))
      const routes = data.routes ?? []
      const physical = routes.filter((r: any) => !r.semantic).length
      const semantic = routes.filter((r: any) => r.semantic && !r.composed).length
      const composed = routes.filter((r: any) => r.composed).length
      console.log(
        `  ${chalk.green('✔')}  ${routes.length} routes compiled` +
          chalk.dim(` (${physical} physical · ${semantic} semantic · ${composed} composed)`)
      )
    } catch {
      console.log(`  ${chalk.yellow('⚠')}  ${alias}.json illisible`)
    }
  }

  // ── Use cases + test ──────────────────────────────────────────────────────────

  if (fs.existsSync(ucGenPath)) {
    const ucs = JSON.parse(fs.readFileSync(ucGenPath, 'utf-8'))
    console.log(`  ${chalk.green('✔')}  ${ucs.length} use cases générés`)
  } else {
    console.log(`  ${chalk.dim('·')}  Use cases : ${chalk.dim(`linklab generate ${alias}`)}`)
  }

  if (fs.existsSync(testGenPath)) {
    const report = JSON.parse(fs.readFileSync(testGenPath, 'utf-8'))
    const pct = Math.round((report.ok / report.total) * 100)
    console.log(
      `  ${chalk.green('✔')}  Test : ${report.ok}/${report.total} OK (${pct}%) — ${report.durationMs}ms`
    )
  } else {
    console.log(`  ${chalk.dim('·')}  Test : ${chalk.dim(`linklab test ${alias}`)}`)
  }

  // ── Drift (postgres) ──────────────────────────────────────────────────────────

  if (config?.source?.type === 'postgres' && schema.exists) {
    console.log(`  ${chalk.dim('·')}  Drift : ${chalk.dim(`linklab diff ${alias}`)}`)
  }

  console.log()
}

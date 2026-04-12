/**
 * logger.ts — Output coloré + progress pour @linklab/cli
 */

import chalk from 'chalk'
import type { Warning } from '../types.js'

// ── Couleurs ──────────────────────────────────────────────────────────────────

const C = {
  step: chalk.cyan,
  ok: chalk.green,
  warn: chalk.yellow,
  error: chalk.red,
  dim: chalk.gray,
  accent: chalk.bold.white,
  version: chalk.magenta
}

// ── Header ────────────────────────────────────────────────────────────────────

export function header(version: string, scenario: string) {
  console.log()
  console.log(`  ${C.accent('linklab')} ${C.version(`v${version}`)}  ·  ${C.dim(scenario)}`)
  console.log()
}

// ── Step progress ─────────────────────────────────────────────────────────────

const STEP_ICONS = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧']

export function step(index: number, name: string, summary: string, durationMs: number) {
  const icon = STEP_ICONS[index] ?? `${index + 1}.`
  const bar = C.step('████████████')
  const nameStr = name.padEnd(12)
  const sumStr = C.dim(summary.padEnd(50))
  const durStr = C.dim(`${durationMs}ms`)

  console.log(`  ${icon} ${nameStr} ${bar}  ${sumStr} ${durStr}`)
}

// ── Success ───────────────────────────────────────────────────────────────────

export function success(outputPath: string, version: string, alias?: string) {
  console.log()
  console.log(`  ${C.ok('✔')}  ${C.dim(outputPath)}  ${C.version(version)}`)
  const replCmd = alias ? `linklab repl ${alias}` : 'linklab repl'
  console.log(`     ${C.dim(`Run "${replCmd}" to navigate your graph`)}`)
  console.log()
}

// ── Init success ──────────────────────────────────────────────────────────────

export function initCreated(path: string) {
  console.log(`  ${C.ok('✔')}  ${path}`)
}

export function initSkipped(path: string) {
  console.log(`  ${C.warn('⚠')}  ${C.dim(path + ' — already exists, skipped')}`)
}

export function initDone(alias?: string) {
  console.log()
  const aliasStr = alias ? `${alias}` : 'your-alias'
  console.log(
    `  ${C.dim('→ Edit')} ${C.accent(`${aliasStr}.linklab.ts`)} ${C.dim('then run')} ${C.accent(`"linklab build ${aliasStr}"`)}`
  )
  console.log()
}

// ── Warnings ──────────────────────────────────────────────────────────────────

export function warnings(list: Warning[]) {
  if (!list.length) return
  console.log()
  console.log(`  ${C.warn('⚠')}  ${list.length} warning${list.length > 1 ? 's' : ''} :`)
  console.log()
  for (const w of list) {
    console.log(`     ${C.warn(w.message)}`)
    if (w.hint) console.log(`     ${C.dim('Fix : ' + w.hint)}`)
    console.log()
  }
}

// ── Error ─────────────────────────────────────────────────────────────────────

export function error(msg: string, detail?: string) {
  console.log()
  console.log(`  ${C.error('✖')}  ${msg}`)
  if (detail) console.log(`     ${C.dim(detail)}`)
  console.log()
}

/**
 * config.ts — Chargement de {alias}.linklab.ts
 *
 * Résolution de l'alias :
 *   1. --alias <name> (CLI)
 *   2. Argument positionnel : linklab build cinema
 *   3. Auto-detect : glob *.linklab.ts dans le cwd (si unique)
 *   4. Fallback legacy : linklab.config.ts
 *
 * Fichier de config : {alias}.linklab.ts
 * Répertoire de sortie : ./linklab/{alias}/
 */

import * as path from 'path'
import * as fs   from 'fs'
import { pathToFileURL } from 'url'
import type { LinklabConfig } from './types.js'

export { defineConfig } from './types.js'

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULTS: Partial<LinklabConfig> = {
  compiler: {
    weightThreshold: 1000,
    keepFallbacks:   true,
    maxFallbacks:    2
  }
}

// ── Résolution de l'alias ─────────────────────────────────────────────────────

/**
 * Résout l'alias depuis le cwd.
 * Auto-detect si un seul *.linklab.ts est présent.
 */
export function resolveAlias(cwd: string, alias?: string): string | null {
  if (alias) return alias

  // Auto-detect : chercher *.linklab.ts dans le cwd
  const files = fs.readdirSync(cwd).filter(f => f.endsWith('.linklab.ts'))
  if (files.length === 1) {
    return files[0].replace('.linklab.ts', '')
  }
  if (files.length > 1) {
    throw new Error(
      `Plusieurs fichiers *.linklab.ts trouvés — précise l'alias :\n` +
      files.map(f => `  linklab build ${f.replace('.linklab.ts', '')}`).join('\n')
    )
  }

  // Fallback legacy : linklab.config.ts
  if (fs.existsSync(path.join(cwd, 'linklab.config.ts'))) {
    return null  // null = mode legacy sans alias
  }

  return null
}

// ── Chargement ────────────────────────────────────────────────────────────────

export async function loadConfig(
  cwd:       string,
  alias?:    string,
  configPath?: string
): Promise<{ config: LinklabConfig; alias: string; outDir: string }> {

  const resolvedAlias = resolveAlias(cwd, alias)

  // Candidats de config
  const candidates = configPath
    ? [path.resolve(cwd, configPath)]
    : resolvedAlias
      ? [
          path.join(cwd, `${resolvedAlias}.linklab.ts`),
          path.join(cwd, `${resolvedAlias}.linklab.js`),
        ]
      : [
          path.join(cwd, 'linklab.config.ts'),
          path.join(cwd, 'linklab.config.js'),
        ]

  let userConfig: Partial<LinklabConfig> = {}

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      try {
        const mod = await import(pathToFileURL(candidate).href)
        userConfig = mod.default ?? mod
        break
      } catch (e) {
        throw new Error(`Impossible de charger ${candidate} : ${(e as Error).message}`)
      }
    }
  }

  // Merge avec defaults
  const merged = deepMerge(DEFAULTS, userConfig) as LinklabConfig

  // Variables d'environnement
  if (process.env.DATABASE_URL && !merged.source?.connectionString) {
    merged.source = merged.source ?? { type: 'postgres' }
    merged.source.connectionString = process.env.DATABASE_URL
  }
  if (process.env.PGHOST)     (merged.source as any).host     ??= process.env.PGHOST
  if (process.env.PGPORT)     (merged.source as any).port     ??= parseInt(process.env.PGPORT)
  if (process.env.PGDATABASE) (merged.source as any).database ??= process.env.PGDATABASE
  if (process.env.PGUSER)     (merged.source as any).user     ??= process.env.PGUSER
  if (process.env.PGPASSWORD) (merged.source as any).password ??= process.env.PGPASSWORD

  // Alias final : CLI > config > auto-detect
  const finalAlias = resolvedAlias ?? merged.alias ?? 'graph'

  // Répertoire de sortie : output.dir > ./linklab/{alias}
  const outDir = path.resolve(
    cwd,
    merged.output?.dir ?? `./linklab/${finalAlias}`
  )

  return { config: merged, alias: finalAlias, outDir }
}

// ── Validation ────────────────────────────────────────────────────────────────

export function validateConfig(config: LinklabConfig): string[] {
  const errors: string[] = []

  if (!config.source) {
    errors.push('source manquant — définis source.type dans {alias}.linklab.ts')
    return errors
  }

  if (config.source.type === 'postgres') {
    if (!config.source.connectionString && !config.source.database) {
      errors.push('source.type=postgres : connectionString ou database requis')
    }
  }

  if (config.source.type === 'json' && !config.source.dataDir) {
    errors.push('source.type=json : dataDir requis')
  }

  return errors
}

// ── Deep merge ────────────────────────────────────────────────────────────────

function deepMerge(base: any, override: any): any {
  if (!override) return base
  if (!base) return override
  const result = { ...base }
  for (const key of Object.keys(override)) {
    if (
      override[key] !== null &&
      typeof override[key] === 'object' &&
      !Array.isArray(override[key]) &&
      typeof base[key] === 'object'
    ) {
      result[key] = deepMerge(base[key], override[key])
    } else {
      result[key] = override[key]
    }
  }
  return result
}

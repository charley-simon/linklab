/**
 * types.ts — Types publics de @linklab/cli
 */

import type { UseCase } from '@linklab/core'

// ── Config ────────────────────────────────────────────────────────────────────

export interface LinklabConfig {
  alias?: string             // nom du graphe — détermine les noms de fichiers
  source: {
    type: 'postgres' | 'json'
    connectionString?: string
    host?:             string
    port?:             number
    database?:         string
    user?:             string
    password?:         string
    dataDir?:          string
  }
  output?: {
    dir?: string             // défaut: './linklab/{alias}'
  }
  compiler?: {
    weightThreshold?: number
    keepFallbacks?:   boolean
    maxFallbacks?:    number
  }
  roots?:    string[]
  labels?:   Record<string, string>
  icons?:    Record<string, string>
  useCases?: UseCase[]
}

export function defineConfig(config: LinklabConfig): LinklabConfig {
  return config
}

// ── CLI options ───────────────────────────────────────────────────────────────

export interface InitOptions {
  alias?:  string
  source?: string
  type?:   'postgres' | 'json'
  force?:  boolean
}

export interface BuildOptions {
  alias?:  string
  dryRun?: boolean
  config?: string
}

export interface ReplOptions {
  alias?:  string
}

// ── Build result ──────────────────────────────────────────────────────────────

export interface StepResult {
  name:       string
  durationMs: number
  summary:    string
}

export interface BuildResult {
  alias:    string
  version:  string
  steps:    StepResult[]
  warnings: Warning[]
  routes: {
    total:    number
    physical: number
    semantic: number
  }
}

export interface Warning {
  level:   'warn' | 'error'
  message: string
  hint?:   string
  field?:  string
}

export interface ServerOptions {
  alias?:  string
  port?:   number
  host?:   string
  prefix?: string
}

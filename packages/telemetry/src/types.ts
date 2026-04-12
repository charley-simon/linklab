/**
 * types.ts — Types partagés de @linklab/telemetry
 *
 * Trois familles de types :
 *   Span     — unité atomique d'observation (une exécution)
 *   Metrics  — métriques sémantiques calculées (Tension, Pression, Confort)
 *   Baseline — valeurs de référence pour le calcul des métriques
 */

// ══════════════════════════════════════════════════════════════
//  SPAN — unité atomique d'observation
// ══════════════════════════════════════════════════════════════

/** Niveaux de cache — L1 = RAM, L2 = Disque */
export type CacheLevel = 'L1' | 'L2' | 'MISS'

/** Résultat d'un accès cache */
export interface CacheEvent {
  level: CacheLevel
  hit: boolean
  entity?: string // ex: "movies:278"
  promoted: boolean // disque → RAM
  yoyo?: boolean // upgrade → downgrade détecté
}

/** Timing détaillé par étape d'exécution */
export interface StepTiming {
  step: 'PathFinder' | 'Resolver' | 'Scheduler' | 'QueryEngine' | 'Provider' | 'Cache' | 'Total'
  startedAt: number // timestamp ms
  durationMs: number
}

/**
 * Span — contexte complet d'une exécution LinkLab.
 *
 * Auto-suffisant pour le rejeu :
 *   spanId + trail + filters → tout ce qu'il faut pour réexécuter.
 */
export interface Span {
  // Identité
  spanId: string // uuid v4
  traceId: string // regroupe les spans d'une même requête HTTP
  timestamp: number // Date.now() au démarrage

  // Trail — contexte de navigation
  trail: string // "movies(278).people"
  from: string // "movies"
  to: string // "people"
  path: string[] // ["movies", "credits", "people"]
  filters: Record<string, any> // { id: 278 }

  // Timings
  timings: StepTiming[]
  totalMs: number

  // Cache
  cacheEvents: CacheEvent[]

  // Résultat
  rowCount: number
  error?: SpanError

  // Métriques calculées au moment du span (enrichissement)
  metrics?: SpanMetrics

  // Rejeu — réservé pour la snapshot des données de l'époque
  dataset?: string // référence snapshot — vide pour l'instant
}

/** Erreur capturée dans un span */
export interface SpanError {
  message: string
  stack?: string
  type: string // ex: "RouteNotFound", "ProviderError"
  engineState: EngineState // état du moteur au moment de l'erreur
}

/** Snapshot minimal de l'état du moteur au moment d'une erreur */
export interface EngineState {
  compiledGraphHash: string // hash du compiled-graph utilisé
  weights: Record<string, number> // poids des edges au moment de l'erreur
  cacheState: {
    l1HitRate: number
    l2HitRate: number
    globalHitRate: number
    yoyoEvents: number
  }
}

// ══════════════════════════════════════════════════════════════
//  METRICS — métriques sémantiques
// ══════════════════════════════════════════════════════════════

/**
 * Métriques sémantiques enrichissant un span.
 *
 * Tension  = latence_réelle / latence_attendue
 *            > 1 → le système souffre
 *
 * Pression = (upgrades_en_attente + cache_misses) / capacité
 *            proche de 1 → risque de saturation
 *
 * Confort  = cache_hit_rate × (1 - tension) × (1 - pression)
 *            métrique composite — celui qu'on regarde en premier
 */
export interface SpanMetrics {
  tension: number // [0..∞]  idéal < 1
  pression: number // [0..1]  idéal < 0.5
  confort: number // [0..1]  idéal > 0.7
}

/**
 * Métriques globales du système sur une fenêtre glissante.
 * Calculées par MetricsCalculator, exposées via le bus.
 */
export interface SystemMetrics {
  window: number // fenêtre en ms (ex: 60_000 = 1 min)
  timestamp: number

  // Composites
  tension: number
  pression: number
  confort: number

  // Primitives
  throughput: number // requêtes/seconde
  errorRate: number // [0..1]
  cacheHitRate: number // [0..1] global L1+L2
  yoyoRate: number // yoyo events / total sur la fenêtre
  pathStability: number // [0..1] — même trail = même path ?

  // Compteurs bruts sur la fenêtre
  totalSpans: number
  errorSpans: number
  cacheHits: number
  cacheMisses: number
  yoyoEvents: number
}

// ══════════════════════════════════════════════════════════════
//  BASELINE — valeurs de référence recalibrables
// ══════════════════════════════════════════════════════════════

/**
 * Baseline de latence pour une route donnée.
 * Calculée par BenchmarkRunner, recalibrée par CalibrationJob.
 */
export interface LatencyBaseline {
  route: string // "movies→people"
  p50Ms: number // médiane
  p90Ms: number // percentile 90 — valeur de référence
  p99Ms: number // percentile 99 — seuil d'alerte
  sampleCount: number // nombre de mesures
  lastUpdated: number // timestamp de dernière calibration
}

/**
 * Baseline de capacité du système.
 * Calculée par BenchmarkRunner à partir de tests de charge.
 */
export interface CapacityBaseline {
  nominalRps: number // requêtes/sec nominales (70% du max)
  maxRps: number // point de rupture mesuré
  breakingPoint: number // latence au point de rupture (ms)
  lastUpdated: number
}

// ══════════════════════════════════════════════════════════════
//  BUS — événements émis par TraceBus
// ══════════════════════════════════════════════════════════════

export type TelemetryEventType =
  | 'span:start'
  | 'span:end'
  | 'span:error'
  | 'metrics:update'
  | 'calibration:done'
  | 'yoyo:detected'

export interface TelemetryEvent {
  type: TelemetryEventType
  timestamp: number
  payload: Span | SystemMetrics | LatencyBaseline | CapacityBaseline | SpanError
}

// ══════════════════════════════════════════════════════════════
//  DRIVER — interface pour les backends de stockage
// ══════════════════════════════════════════════════════════════

export interface TelemetryDriver {
  /** Persiste un span terminé */
  write(span: Span): Promise<void>

  /** Charge les N derniers spans (pour replay, analyse) */
  readRecent(limit: number): Promise<Span[]>

  /** Charge les spans en erreur */
  readErrors(limit: number): Promise<Span[]>

  /** Charge les spans correspondant à un trail donné */
  readByTrail(trail: string, limit: number): Promise<Span[]>

  /** Statistiques agrégées sur une fenêtre temporelle */
  aggregate(windowMs: number): Promise<SystemMetrics>
}

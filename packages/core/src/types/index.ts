/**
 * LinkLab Core Types
 * * Base type definitions for the entire system
 */

// ============================================================
// Graph Types
// ============================================================

export type NodeType = 'table' | 'view' | 'entity' | 'action'

export interface Column {
  name: string
  type: string
  nullable?: boolean
  primaryKey?: boolean
  foreignKey?: boolean
  defaultValue?: any
  description?: string
}

export interface GraphNode {
  id: string
  type: string
  name?: string
  exposed?: boolean
  [key: string]: any
}

export interface GraphEdge {
  from: string
  to: string
  weight: number
  name?: string // Ajouté pour rel.label
  via?: string // Ajouté pour stocker la colonne de jointure
  fromCol?: string // Utilisé par le compilateur
  toCol?: string // Utilisé par le compilateur
  metadata?: {
    condition?: string | Record<string, any>
    semanticType?: string
    [key: string]: any
  }
}

export interface Graph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

// Pour le CompiledGraph (ce que le QueryEngine lira)
export interface RouteStep {
  fromCol: string
  toCol: string
}

export interface RouteInfo {
  from: string
  to: string
  primary: {
    path: string[]
    edges: RouteStep[] // 🌟 Ajouté ici
    weight: number
    joins: number
    avgTime: number
  }
  fallbacks: Array<{
    path: string[]
    edges: RouteStep[] // 🌟 Ajouté ici
    weight: number
    joins: number
    avgTime: number
  }>
  alternativesDiscarded: number
}

export interface GraphMetadata {
  version?: string
  generatedAt?: string
  database?: DatabaseInfo
  [key: string]: any
}

export interface DatabaseInfo {
  name: string
  type: 'postgresql' | 'mysql' | 'sqlite' | 'mongodb'
  version?: string
}

// ============================================================
// Action & Registry Types
// ============================================================

export interface ActionDefinition {
  id: string
  description?: string
  requiredParams: Column[] // Ce que l'action attend de la pile
  provides?: string[] // Ce que l'action injecte après coup
  handler: (context: any) => Promise<any>
}

export interface ActionRegistry {
  register(action: ActionDefinition): void
  get(id: string): ActionDefinition | undefined
  getAll(): ActionDefinition[]
}

// ============================================================
// Context & Engine Types
// ============================================================

export interface ContextLayer {
  nodeId: string
  timestamp: number
  data: Record<string, any>
  type: 'navigation' | 'action' | 'system'
}

export interface EngineConfig {
  cache?: CacheConfig
  debug?: boolean
  // Hooks pour l'intervention du développeur
  onResolveContext?: (currentContext: any) => Awaitable<any>
  onValidatePath?: (node: GraphNode, context: any) => Awaitable<boolean>
}

// ============================================================
// Path Types
// ============================================================

export type Path = string[]

export interface PathDetails {
  path: Path
  length: number
  joins: number
  weight: number
  edges: GraphEdge[]
  indirect?: boolean
}

export interface PathMetrics {
  path: Path
  weight: number
  joins: number
  avgTime?: number
  executions?: number
  minTime?: number
  maxTime?: number
}

export type MetricsMap = Map<string, TrainingMetrics>

// ============================================================
// Provider Types
// ============================================================

export interface ProviderConfig {
  host?: string
  port?: number
  database: string
  user?: string
  password?: string
  connectionString?: string
  mock?: boolean
  [key: string]: any
}

export interface Provider {
  query<T = any>(sql: string, params?: any[]): Promise<T[]>
  close(): Promise<void>
}

// ============================================================
// Compiled Graph Types
// ============================================================

export interface CompiledGraph {
  version: string
  compiledAt: string
  config: CompilerConfig
  nodes: GraphNode[]
  routes: RouteInfo[]
  stats: CompilationStats
}

export interface CompilerConfig {
  weightThreshold: number
  minUsage?: number
  keepFallbacks: boolean
  maxFallbacks: number
  expose?: ExposeConfig
}

export interface CompilationStats {
  totalPairs: number
  routesCompiled: number
  routesFiltered: number
  compressionRatio: string
}

// ============================================================
// Training & Cache Types
// ============================================================

export interface UseCase {
  description: string
  from: string
  to: string
  sampleData?: Record<string, any>
  expectedPath?: Path // Pour tes tests sémantiques
}

export interface TrainingMetrics {
  path: Path
  executions: number
  successes?: number
  failures?: number
  totalTime: number
  avgTime: number
  minTime: number
  maxTime: number
  used: boolean
  failed?: boolean
  error?: string
}

export interface CacheConfig {
  maxSize?: number
  ttl?: number
}

// ============================================================
// Utility & Error Types
// ============================================================

export type Awaitable<T> = T | Promise<T>

export type ExposeConfig =
  | 'all'
  | 'none'
  | { include: string[] }
  | { exclude: string[] }

export class LinkLabError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message)
    this.name = 'LinkLabError'
  }
}

export class ProviderError extends LinkLabError {
  constructor(message: string, details?: any) {
    super(message, 'PROVIDER_ERROR', details)
    this.name = 'ProviderError'
  }
}

// --- Types pour la couche technique ---

export interface TechProperty {
  name: string
  type: string
  isPK: boolean
  isFK: boolean
  references?: {
    table: string
    column: string
  }
  isIndexed: boolean
}

export interface TechEntity {
  name: string
  properties: TechProperty[]
  rowCount: number
}

export interface TechnicalSchema {
  source: {
    type: string
    name: string
    generatedAt: string
  }
  entities: TechEntity[]
}

// --- Types pour la couche d'Analyse ---

export interface AnalysisAdvice {
  type: 'PERFORMANCE' | 'STRUCTURE' | 'VIRTUAL_RELATION'
  level: 'INFO' | 'WARNING' | 'CRITICAL'
  message: string
  target: string // Le nom de la table ou table.colonne
  action?: string // Commande suggérée ou flag pour le Builder
}

export interface ImplicitRelation {
  fromTable:    string  // Table source
  column:       string  // Colonne *_id sans FK déclarée
  guessedTable: string  // Table cible résolue par SynonymResolver
}

export interface AnalyzedSchema extends TechnicalSchema {
  advices:           AnalysisAdvice[]
  weights:           Record<string, number>  // "table.colonne" -> poids numérique
  implicitRelations: ImplicitRelation[]      // FK implicites détectées par SchemaAnalyzer
}

// --- Structure du Dictionnaire Final ---

export interface Dictionary {
  tables: Table[]
  relations: Relation[]
}

export interface Table {
  name: string
  columns: string[]
  rowCount: number
}

export interface Relation {
  from: string // Table source
  to: string // Table destination
  via: string // La clé technique (nom de la colonne ou table pivot)
  type: 'physical' | 'physical_reverse' | 'semantic_view' | 'virtual'
  weight: number // Calculé par l'Analyzer
  label: string // Nom lisible (ex: "acting", "directing")

  // Pour les vues sémantiques (le filtrage dynamique)
  condition?: {
    [column: string]: any // ex: { jobId: 2 }
  }

  // Pour le transport de données additionnelles (ex: nom du rôle dans 'options')
  metadataField?: string
}

/**
 * Schema definitions for physical data discovery
 */
export interface ColumnSchema {
  name: string
  type: 'string' | 'number' | 'boolean' | 'date' | 'object' | 'array'
  isNullable?: boolean
  isPrimaryKey?: boolean
  isForeignKey?: boolean
  references?: {
    table: string
    column: string
  }
}

export interface TableSchema {
  name: string
  columns: ColumnSchema[]
  rowCount?: number
  fileSize?: number
  filePath?: string // Chemin vers le JSON ou la table SQL
}

export interface DatabaseSchema {
  tables: TableSchema[]
  relationships: SchemaRelationship[]
}

export interface SchemaRelationship {
  fromTable: string
  fromColumn: string
  toTable: string
  toColumn: string
  type: 'one-to-one' | 'one-to-many' | 'many-to-many'
}

// ============================================================
// Navigation Engine Types (PATHFIND / NAVIGATE / SCHEDULE)
// ============================================================

export type EngineMode = 'PATHFIND' | 'NAVIGATE' | 'SCHEDULE'

/**
 * Frame : unité de navigation sur la stack.
 * Représente un pointeur sémantique vers une entité,
 * avec son état de résolution.
 */
export interface Frame {
  entity: string
  id?: any
  state?: 'RESOLVED' | 'UNRESOLVED' | 'DEFERRED'
  purpose?: string
  intent?: Record<string, any>
  data?: any
  resolvedBy?: {
    relation: string
    via: string
    filters?: FrameFilter[]
  }
}

export interface FrameFilter {
  field: string
  operator: 'equals' | 'contains' | 'gt' | 'lt' | 'exists'
  value: any
}

/**
 * PathQuery : paramètres pour le mode PATHFIND
 */
export interface PathQuery {
  from: string
  to: string
  maxPaths?: number
  minHops?: number           // Nombre minimum d'étapes (ignore les chemins trop directs)
  maxHops?: number
  transferPenalty?: number   // Pénalité en minutes par correspondance (0 = temps pur, 5 = confort)
  via?: string[]             // Types de relations autorisés ex: ['CREATED', 'SAMPLES', 'CREDITED']
  preferences?: {
    minimizeTransfers?: boolean
    avoidEdges?: string[]
    [key: string]: any
  }
}

/**
 * ScheduleAction : action pour le mode SCHEDULE.
 * Différenciée de ActionDefinition (infrastructure) pour éviter
 * tout conflit avec le registre d'actions techniques de V3.
 */
export interface ScheduleAction {
  name: string
  weight: number
  when?: (stack: Frame[]) => boolean
  execute: (stack: Frame[], graph: Graph) => Promise<Frame[]>
  cooldown?: number
  maxExecutions?: number
  terminal?: boolean
  onUse?: (stack: Frame[], result: NavigationResult) => void
}

export interface ActionState {
  cooldownUntil: number
  executionCount: number
  executed?: boolean
  lastResult?: NavigationResult
}

/**
 * Config du NavigationEngine
 */
export interface NavigationEngineConfig {
  mode: EngineMode
  graph: Graph
  trail?: import('../navigation/Trail.js').Trail  // Trail existant à réutiliser
  initialStack?: Frame[]                          // Ignoré si trail fourni
  actions?: ScheduleAction[]
  pathQuery?: PathQuery
}

/**
 * Résultat d'un step d'exécution
 */
export interface EngineStepResult {
  time: number
  mode: EngineMode
  phase?: 'RESOLVE' | 'EXECUTE' | 'COMPLETE'
  selectedAction?: string
  resolvedCount?: number
  unresolvedCount?: number
  path?: NavigationPath
  result?: NavigationResult
}

/**
 * Chemin trouvé par PATHFIND — riche en métadonnées
 * pour les formatters (ligne, direction, correspondance)
 */
export interface NavigationPath {
  nodes: string[]
  edges: GraphEdge[]
  totalWeight: number
}

export interface NavigationResult {
  type: 'SUCCESS' | 'FAIL' | 'DEFER'
  reason?: string
  data?: any
}

// ============================================================
// Cache Stats (used by Engine LRU)
// ============================================================

export interface CacheStats {
  entries: number
  size: number
  sizeFormatted: string
  maxSize: number
  usage: string
  hits: number
  misses: number
  hitRate: string
}

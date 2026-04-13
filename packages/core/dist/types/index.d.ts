/**
 * LinkLab Core Types
 * * Base type definitions for the entire system
 */
export type NodeType = 'table' | 'view' | 'entity' | 'action';
export interface Column {
    name: string;
    type: string;
    nullable?: boolean;
    primaryKey?: boolean;
    foreignKey?: boolean;
    defaultValue?: any;
    description?: string;
}
export interface GraphNode {
    id: string;
    type: string;
    name?: string;
    exposed?: boolean;
    [key: string]: any;
}
export interface GraphEdge {
    from: string;
    to: string;
    weight: number;
    name?: string;
    via?: string;
    fromCol?: string;
    toCol?: string;
    metadata?: {
        condition?: string | Record<string, any>;
        semanticType?: string;
        [key: string]: any;
    };
}
export interface Graph {
    nodes: GraphNode[];
    edges: GraphEdge[];
}
export interface RouteStep {
    fromCol: string;
    toCol: string;
}
export interface RouteInfo {
    from: string;
    to: string;
    primary: {
        path: string[];
        edges: RouteStep[];
        weight: number;
        joins: number;
        avgTime: number;
    };
    fallbacks: Array<{
        path: string[];
        edges: RouteStep[];
        weight: number;
        joins: number;
        avgTime: number;
    }>;
    alternativesDiscarded: number;
}
export interface GraphMetadata {
    version?: string;
    generatedAt?: string;
    database?: DatabaseInfo;
    [key: string]: any;
}
export interface DatabaseInfo {
    name: string;
    type: 'postgresql' | 'mysql' | 'sqlite' | 'mongodb';
    version?: string;
}
export interface ActionDefinition {
    id: string;
    description?: string;
    requiredParams: Column[];
    provides?: string[];
    handler: (context: any) => Promise<any>;
}
export interface ActionRegistry {
    register(action: ActionDefinition): void;
    get(id: string): ActionDefinition | undefined;
    getAll(): ActionDefinition[];
}
export interface ContextLayer {
    nodeId: string;
    timestamp: number;
    data: Record<string, any>;
    type: 'navigation' | 'action' | 'system';
}
export interface EngineConfig {
    cache?: CacheConfig;
    debug?: boolean;
    onResolveContext?: (currentContext: any) => Awaitable<any>;
    onValidatePath?: (node: GraphNode, context: any) => Awaitable<boolean>;
}
export type Path = string[];
export interface PathDetails {
    path: Path;
    length: number;
    joins: number;
    weight: number;
    edges: GraphEdge[];
    indirect?: boolean;
}
export interface PathMetrics {
    path: Path;
    weight: number;
    joins: number;
    avgTime?: number;
    executions?: number;
    minTime?: number;
    maxTime?: number;
}
export type MetricsMap = Map<string, TrainingMetrics>;
export interface ProviderConfig {
    host?: string;
    port?: number;
    database: string;
    user?: string;
    password?: string;
    connectionString?: string;
    mock?: boolean;
    [key: string]: any;
}
export interface Provider {
    query<T = any>(sql: string, params?: any[]): Promise<T[]>;
    close(): Promise<void>;
}
export interface CompiledGraph {
    version: string;
    compiledAt: string;
    config: CompilerConfig;
    nodes: GraphNode[];
    routes: RouteInfo[];
    stats: CompilationStats;
}
export interface CompilerConfig {
    weightThreshold: number;
    minUsage?: number;
    keepFallbacks: boolean;
    maxFallbacks: number;
    expose?: ExposeConfig;
}
export interface CompilationStats {
    totalPairs: number;
    routesCompiled: number;
    routesFiltered: number;
    compressionRatio: string;
}
export interface UseCase {
    description: string;
    from: string;
    to: string;
    sampleData?: Record<string, any>;
    expectedPath?: Path;
}
export interface TrainingMetrics {
    path: Path;
    executions: number;
    successes?: number;
    failures?: number;
    totalTime: number;
    avgTime: number;
    minTime: number;
    maxTime: number;
    used: boolean;
    failed?: boolean;
    error?: string;
}
export interface CacheConfig {
    maxSize?: number;
    ttl?: number;
}
export type Awaitable<T> = T | Promise<T>;
export type ExposeConfig = 'all' | 'none' | {
    include: string[];
} | {
    exclude: string[];
};
export declare class LinkLabError extends Error {
    code: string;
    details?: any | undefined;
    constructor(message: string, code: string, details?: any | undefined);
}
export declare class ProviderError extends LinkLabError {
    constructor(message: string, details?: any);
}
export interface TechProperty {
    name: string;
    type: string;
    isPK: boolean;
    isFK: boolean;
    references?: {
        table: string;
        column: string;
    };
    isIndexed: boolean;
}
export interface TechEntity {
    name: string;
    properties: TechProperty[];
    rowCount: number;
}
export interface TechnicalSchema {
    source: {
        type: string;
        name: string;
        generatedAt: string;
    };
    entities: TechEntity[];
}
export interface AnalysisAdvice {
    type: 'PERFORMANCE' | 'STRUCTURE' | 'VIRTUAL_RELATION';
    level: 'INFO' | 'WARNING' | 'CRITICAL';
    message: string;
    target: string;
    action?: string;
}
export interface ImplicitRelation {
    fromTable: string;
    column: string;
    guessedTable: string;
}
export interface AnalyzedSchema extends TechnicalSchema {
    advices: AnalysisAdvice[];
    weights: Record<string, number>;
    implicitRelations: ImplicitRelation[];
}
export interface Dictionary {
    tables: Table[];
    relations: Relation[];
}
export interface Table {
    name: string;
    columns: string[];
    rowCount: number;
}
export interface Relation {
    from: string;
    to: string;
    via: string;
    type: 'physical' | 'physical_reverse' | 'semantic_view' | 'virtual';
    weight: number;
    label: string;
    condition?: {
        [column: string]: any;
    };
    metadataField?: string;
}
/**
 * Schema definitions for physical data discovery
 */
export interface ColumnSchema {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'date' | 'object' | 'array';
    isNullable?: boolean;
    isPrimaryKey?: boolean;
    isForeignKey?: boolean;
    references?: {
        table: string;
        column: string;
    };
}
export interface TableSchema {
    name: string;
    columns: ColumnSchema[];
    rowCount?: number;
    fileSize?: number;
    filePath?: string;
}
export interface DatabaseSchema {
    tables: TableSchema[];
    relationships: SchemaRelationship[];
}
export interface SchemaRelationship {
    fromTable: string;
    fromColumn: string;
    toTable: string;
    toColumn: string;
    type: 'one-to-one' | 'one-to-many' | 'many-to-many';
}
export type EngineMode = 'PATHFIND' | 'NAVIGATE' | 'SCHEDULE';
/**
 * Frame : unité de navigation sur la stack.
 * Représente un pointeur sémantique vers une entité,
 * avec son état de résolution.
 */
export interface Frame {
    entity: string;
    id?: any;
    state?: 'RESOLVED' | 'UNRESOLVED' | 'DEFERRED';
    purpose?: string;
    intent?: Record<string, any>;
    data?: any;
    resolvedBy?: {
        relation: string;
        via: string;
        filters?: FrameFilter[];
    };
}
export interface FrameFilter {
    field: string;
    operator: 'equals' | 'contains' | 'gt' | 'lt' | 'exists';
    value: any;
}
/**
 * PathQuery : paramètres pour le mode PATHFIND
 */
export interface PathQuery {
    from: string;
    to: string;
    maxPaths?: number;
    minHops?: number;
    maxHops?: number;
    transferPenalty?: number;
    via?: string[];
    preferences?: {
        minimizeTransfers?: boolean;
        avoidEdges?: string[];
        [key: string]: any;
    };
}
/**
 * ScheduleAction : action pour le mode SCHEDULE.
 * Différenciée de ActionDefinition (infrastructure) pour éviter
 * tout conflit avec le registre d'actions techniques de V3.
 */
export interface ScheduleAction {
    name: string;
    weight: number;
    when?: (stack: Frame[]) => boolean;
    execute: (stack: Frame[], graph: Graph) => Promise<Frame[]>;
    cooldown?: number;
    maxExecutions?: number;
    terminal?: boolean;
    onUse?: (stack: Frame[], result: NavigationResult) => void;
}
export interface ActionState {
    cooldownUntil: number;
    executionCount: number;
    executed?: boolean;
    lastResult?: NavigationResult;
}
/**
 * Config du NavigationEngine
 */
export interface NavigationEngineConfig {
    mode: EngineMode;
    graph: Graph;
    trail?: import('../navigation/Trail.js').Trail;
    initialStack?: Frame[];
    actions?: ScheduleAction[];
    pathQuery?: PathQuery;
}
/**
 * Résultat d'un step d'exécution
 */
export interface EngineStepResult {
    time: number;
    mode: EngineMode;
    phase?: 'RESOLVE' | 'EXECUTE' | 'COMPLETE';
    selectedAction?: string;
    resolvedCount?: number;
    unresolvedCount?: number;
    path?: NavigationPath;
    result?: NavigationResult;
}
/**
 * Chemin trouvé par PATHFIND — riche en métadonnées
 * pour les formatters (ligne, direction, correspondance)
 */
export interface NavigationPath {
    nodes: string[];
    edges: GraphEdge[];
    totalWeight: number;
}
export interface NavigationResult {
    type: 'SUCCESS' | 'FAIL' | 'DEFER';
    reason?: string;
    data?: any;
}
export interface CacheStats {
    entries: number;
    size: number;
    sizeFormatted: string;
    maxSize: number;
    usage: string;
    hits: number;
    misses: number;
    hitRate: string;
}
//# sourceMappingURL=index.d.ts.map
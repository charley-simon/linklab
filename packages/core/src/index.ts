/**
 * @linklab/core — Point d'entrée public
 *
 * Trois zones d'export, du plus utilisé au plus technique :
 *
 *   ┌─────────────────────────────────────────────────────────┐
 *   │  API  — ce que 80% des utilisateurs importent           │
 *   │  BUILD — pipeline schema → graph (setup, CI)            │
 *   │  HTTP  — plugin Fastify HATEOAS (optionnel)             │
 *   │  ADVANCED — internals pour extensions et tests          │
 *   └─────────────────────────────────────────────────────────┘
 *
 * Usage typique :
 *
 *   import { Graph, Strategy } from '@linklab/core'
 *
 *   const cinema = new Graph(graphJson, { compiled, dataset }).domain()
 *   const cast   = await cinema.movies(278).people
 *   const route  = cinema.from('Pigalle').to('Alesia').path(Strategy.Comfort())
 */

// ══════════════════════════════════════════════════════════════
//  API — Surface publique principale
//  import { Graph, Strategy } from '@linklab/core'
// ══════════════════════════════════════════════════════════════

export { Graph } from './api/Graph.js'
export { Strategy } from './api/types.js'
export type {
  PathResult,
  ResolvedPath,
  PathStep,
  QueryResult,
  PathBuilderOptions
} from './api/types.js'

// PathBuilder est retourné par graph.from() — exposé pour le typage
export { PathBuilder } from './api/PathBuilder.js'

// ══════════════════════════════════════════════════════════════
//  BUILD — Pipeline schema → graph
//  Usage : scripts de génération, CI, pipeline.ts
//  import { SchemaExtractor, GraphCompiler } from '@linklab/core/build'
// ══════════════════════════════════════════════════════════════

export { SchemaExtractor } from './schema/SchemaExtractor.js'
export { JsonSchemaExtractor } from './schema/JsonSchemaExtractor.js'
export { SchemaAnalyzer } from './schema/SchemaAnalyzer.js'
export { GraphBuilder } from './schema/GraphBuilder.js'
export { GraphAssembler } from './graph/GraphAssembler.js'
export { GraphCompiler } from './graph/GraphCompiler.js'
export { GraphTrainer } from './graph/GraphTrainer.js'
export { GraphOptimizer } from './graph/GraphOptimizer.js'
export { GraphExtractor } from './graph/GraphExtractor.js'

// ══════════════════════════════════════════════════════════════
//  HTTP — Plugin Fastify HATEOAS
//  Usage : apps serveur
//  import { linklabPlugin } from '@linklab/core'
// ══════════════════════════════════════════════════════════════

export { linklabPlugin } from './http/plugin.js'
export { LinkBuilder } from './http/LinkBuilder.js'
export type { LinklabPluginOptions } from './http/plugin.js'

// ══════════════════════════════════════════════════════════════
//  ADVANCED — Internals pour extensions, providers, tests
//  Stable mais sans garantie de compatibilité entre versions
// ══════════════════════════════════════════════════════════════

// Moteur de navigation bas niveau
export { NavigationEngine } from './navigation/NavigationEngine.js'
export { Resolver } from './navigation/Resolver.js'
export { Scheduler } from './navigation/Scheduler.js'
export { Trail } from './navigation/Trail.js'
export { TrailParser } from './navigation/TrailParser.js'

// Runtime
export { QueryEngine } from './runtime/QueryEngine.js'
export { Engine } from './runtime/Engine.js'
export { DataLoader } from './runtime/DataLoader.js'

// Providers
export { PostgresProvider } from './providers/PostgresProvider.js'
export { MockProvider } from './providers/MockProvider.js'

// Formatters
export type { PathFormatter } from './formatters/BaseFormatter.js'

// PathFinder — algorithme Dijkstra brut
export { PathFinder } from './core/PathFinder.js'

// ══════════════════════════════════════════════════════════════
//  TYPES — tous les types internes
//  Pour les utilisateurs qui construisent sur les internals
// ══════════════════════════════════════════════════════════════

export type {
  Graph as GraphData, // renommé pour éviter le conflit avec la classe Graph
  GraphNode,
  GraphEdge,
  CompiledGraph,
  RouteInfo,
  Dictionary,
  Frame,
  Path,
  PathQuery
} from './types/index.js'

export type { MetricsMap, TrainingMetrics, UseCase } from './types/index.js'

// ── Instrumentation — opt-in telemetry bridge ─────────────────────────────
export {
  injectTelemetry,
  resetTelemetry,
  preloadTelemetry,
  shim
} from './instrumentation/TelemetryShim.js'
export type { TelemetryModule } from './instrumentation/TelemetryShim.js'

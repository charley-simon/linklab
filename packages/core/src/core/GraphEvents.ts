/**
 * GraphEvents — Catalogue des événements LinkLab
 *
 * Trois bus, trois contrats :
 *
 *   graph.hooks   — awaitable, enrichit ou annule le flux
 *   graph.events  — fire-and-forget, observation pure
 *   graph.errors  — synchrone, jamais silencieux
 *
 * Conventions de nommage :
 *   hooks  : <sujet>.<moment>   ex: traversal.before, access.check
 *   events : <sujet>.<résultat> ex: traversal.complete, cache.miss
 *   errors : <sujet>.<type>     ex: route.notfound, traversal.failed
 */

import { HookBus, EventBus, ErrorBus } from './EventBus.js'
import type { Frame, GraphEdge, NavigationPath, Graph } from '../types/index.js'

// ── Payloads Hooks ────────────────────────────────────────────

export interface TraversalBeforePayload {
  from: string
  to: string
  stack: Frame[]
  graph: Graph
}

export interface TraversalStepPayload {
  node: string
  edge: GraphEdge
  stack: Frame[]
  depth: number
}

export interface AccessCheckPayload {
  node: string
  stack: Frame[]
  context?: Record<string, any>
}

export interface StackPushPayload {
  frame: Frame
  stack: Frame[]
}

export interface StackPopPayload {
  frame: Frame
  stack: Frame[]
}

// ── Payloads Events ───────────────────────────────────────────

export interface TraversalCompletePayload {
  from: string
  to: string
  path: NavigationPath
  durationMs: number
  stackDepth: number
  routeUsed: string        // ex: "movies→credits→people"
  routeWeight: number
  resultCount?: number
}

export interface CacheMissPayload {
  key: string
  requestedAt: number
}

export interface CacheHitPayload {
  key: string
  accessCount: number
  cachedAt?: number
}

export interface WeightUpdatedPayload {
  edge: string             // "from→to"
  previousWeight: number
  newWeight: number
  reason?: string
}

export interface StackCompactedPayload {
  before: Frame[]
  after: Frame[]
  removedCount: number
}

// ── Payloads Errors ───────────────────────────────────────────

export interface RouteNotFoundPayload {
  from: string
  to: string
  stack: Frame[]
}

export interface TraversalFailedPayload {
  from: string
  to: string
  reason: string
  error?: Error
}

export interface HookTimeoutPayload {
  hook: string
  timeoutMs: number
}

export interface AccessDeniedPayload {
  node: string
  reason: string
  stack: Frame[]
}

// ── Registres typés ───────────────────────────────────────────

export interface GraphHooks {
  'traversal.before': TraversalBeforePayload
  'traversal.step':   TraversalStepPayload
  'access.check':     AccessCheckPayload
  'stack.push':       StackPushPayload
  'stack.pop':        StackPopPayload
}

export interface GraphEventMap {
  'traversal.complete': TraversalCompletePayload
  'cache.miss':         CacheMissPayload
  'cache.hit':          CacheHitPayload
  'weight.updated':     WeightUpdatedPayload
  'stack.compacted':    StackCompactedPayload
}

export interface GraphErrors {
  'route.notfound':    RouteNotFoundPayload
  'traversal.failed':  TraversalFailedPayload
  'hook.timeout':      HookTimeoutPayload
  'access.denied':     AccessDeniedPayload
}

// ── Factory — crée les trois bus pour une instance de graphe ──

export interface GraphBuses {
  hooks:  HookBus<GraphHooks>
  events: EventBus<GraphEventMap>
  errors: ErrorBus<GraphErrors>
}

export function createGraphBuses(): GraphBuses {
  return {
    hooks:  new HookBus<GraphHooks>(),
    events: new EventBus<GraphEventMap>(),
    errors: new ErrorBus<GraphErrors>(),
  }
}

/**
 * LinkLab Fastify Plugin
 *
 * Transforme automatiquement chaque requête HTTP en Trail,
 * résout la navigation via le graphe, et retourne une réponse
 * HATEOAS Level 3 — liens générés automatiquement depuis le graphe.
 *
 * Usage minimal :
 * ```typescript
 * import Fastify from 'fastify'
 * import { linklabPlugin } from '@linklab/http'
 *
 * const fastify = Fastify()
 * await fastify.register(linklabPlugin, {
 *   graph:  compiledGraph,
 *   prefix: '/api'
 * })
 * await fastify.listen({ port: 3000 })
 * ```
 *
 * Toutes ces routes fonctionnent sans configuration supplémentaire :
 *   GET /api/people
 *   GET /api/people/Nolan
 *   GET /api/people/Nolan/movies
 *   GET /api/people/Nolan/movies/1/actors
 *
 * Hooks disponibles sur chaque requête :
 * ```typescript
 * fastify.register(linklabPlugin, {
 *   graph,
 *   onEngine: (engine, req) => {
 *     engine.hooks.on('access.check', async (ctx) => {
 *       if (!ctx.trail.user.userId) {
 *         return { cancelled: true, reason: 'unauthenticated' }
 *       }
 *     })
 *   }
 * })
 * ```
 */

import type {
  FastifyPluginAsync,
  FastifyRequest,
  FastifyReply,
} from 'fastify'
import fp from 'fastify-plugin'

import type { Graph, CompiledGraph } from '../types/index.js'
import { Trail }                  from '../navigation/Trail.js'
import { TrailParser }            from '../navigation/TrailParser.js'
import { NavigationEngine }       from '../navigation/NavigationEngine.js'
import { LinkBuilder }            from './LinkBuilder.js'
import { DataLoader, type DataLoaderOptions } from '../runtime/DataLoader.js'
import {
  defaultUserExtractor,
  type UserContextExtractor,
} from './TrailRequest.js'

// ── Types ─────────────────────────────────────────────────────

export interface LinklabPluginOptions {
  /** Le graphe sémantique — navigation, LinkBuilder, Resolver */
  graph: Graph

  /** Le graphe compilé — routes SQL optimales pour DataLoader/QueryEngine */
  compiledGraph?: CompiledGraph

  /** Préfixe URL — ex: '/api' ou '/api/v1' */
  prefix?: string

  /** Contexte global injecté dans chaque Trail */
  global?: Record<string, any>

  /**
   * Extracteur de contexte utilisateur.
   * Par défaut : lit req.user ou req.session.user
   */
  extractUser?: UserContextExtractor

  /**
   * Hook appelé après création du moteur, avant résolution.
   * C'est ici que Netflix branche sa logique métier.
   *
   * @example
   * ```typescript
   * onEngine: (engine, req) => {
   *   engine.hooks.on('access.check', async (ctx) => {
   *     if (!ctx.trail.user.subscription) {
   *       return { cancelled: true, reason: 'subscription_required' }
   *     }
   *   })
   * }
   * ```
   */
  onEngine?: (engine: NavigationEngine, req: FastifyRequest) => void | Promise<void>

  /**
   * Options du DataLoader — source de données réelles.
   *
   * @example
   * ```typescript
   * // Mode JSON (Netflix mock / tests)
   * dataLoader: { dataset: { movies, people, credits } }
   *
   * // Mode SQL (PostgreSQL)
   * dataLoader: { provider: postgresProvider }
   * ```
   */
  dataLoader?: DataLoaderOptions

  /**
   * Transforme les données avant envoi.
   * Utile pour la pagination, la sérialisation custom, etc.
   */
  transformData?: (data: any, trail: Trail) => any
}

// ── Format de réponse ─────────────────────────────────────────

export interface TrailResponse {
  data:    any
  _links:  Record<string, any>
  _trail:  string
  _meta:   ResponseMeta
}

export interface ResponseMeta {
  entity:   string
  depth:    number
  resolved: number
  timing:   number
  count?:   number
}

// ── Helper — vérifie qu'un node est exposé ───────────────────
// Un node sans flag exposed (graphe ancien) est considéré exposé
// pour assurer la rétrocompatibilité.
// Un node avec exposed: false est bloqué.

function isExposed(graph: Graph, entity: string): boolean {
  const node = graph.nodes.find(n => n.id === entity)
  if (!node) return false
  // Rétrocompatibilité : si exposed n'est pas défini, on expose
  if (node.exposed === undefined) return true
  return node.exposed === true
}

// ── Plugin ────────────────────────────────────────────────────

const linklabPluginImpl: FastifyPluginAsync<LinklabPluginOptions> = async (
  fastify,
  options
) => {
  const {
    graph,
    prefix        = '',
    global        = {},
    extractUser   = defaultUserExtractor,
    onEngine,
    dataLoader,
    transformData,
  } = options

  const linkBuilder = new LinkBuilder(graph, { prefix })

  // compiledGraph peut être passé séparément (semantic graph + compiled graph distincts)
  // ou graph peut lui-même être un CompiledGraph (avec .routes)
  const effectiveCompiled: CompiledGraph | null =
    options.compiledGraph
      ?? ('routes' in graph && Array.isArray((graph as any).routes) ? graph as any : null)

  const loader = (dataLoader && effectiveCompiled)
    ? new DataLoader(effectiveCompiled, dataLoader)
    : null

  if (dataLoader && !effectiveCompiled) {
    fastify.log.warn('[LinkLab] dataLoader ignoré : graph doit être un CompiledGraph (avec .routes)')
  }

  // ── Décorer chaque request avec trail + linkBuilder ─────────
  fastify.decorateRequest('trail',       null as any)
  fastify.decorateRequest('linkBuilder', null as any)

  // ── Hook preHandler — parse le Trail avant chaque requête ───
  fastify.addHook('preHandler', async (req: FastifyRequest) => {
    const userCtx = await extractUser(req)

    const rawPath = req.url.split('?')[0]
    const path    = prefix ? rawPath.replace(new RegExp(`^${prefix}`), '') : rawPath

    const trail = TrailParser.fromPath(path, {
      global: { ...global },
      user:   userCtx,
    })

    ;(req as any).trail       = trail
    ;(req as any).linkBuilder = linkBuilder
  })

  // ── Routes génériques — capture tous les paths ─────────────
  const routePath  = prefix ? `${prefix}/*` : '/*'
  const rootPath   = prefix || '/'

  // Route pour le prefix exact ex: GET /api
  fastify.get(rootPath, async (
    req:   FastifyRequest,
    reply: FastifyReply
  ) => {
    const links = buildRootLinks(graph, prefix)
    return { data: null, _links: links, _trail: '', _meta: { entity: 'root', depth: 0, resolved: 0, timing: 0 } }
  })

  fastify.get(routePath, async (
    req:   FastifyRequest,
    reply: FastifyReply
  ): Promise<TrailResponse> => {
    const trail   = (req as any).trail as Trail
    const start   = Date.now()

    // Trail vide = index — retourner les nœuds racines du graphe
    if (trail.depth === 0) {
      const rootLinks = buildRootLinks(graph, prefix)
      return {
        data:   null,
        _links: rootLinks,
        _trail: '',
        _meta:  { entity: 'root', depth: 0, resolved: 0, timing: Date.now() - start },
      }
    }

    // ── Vérifier que toutes les frames du Trail pointent vers des nodes exposés
    // On vérifie chaque entité du Trail — si l'une est non exposée → 404.
    // Cela couvre aussi les vues sémantiques : leur entité cible résolue
    // est vérifiée au moment de la résolution du Trail.
    for (const frame of trail.frames) {
      if (!isExposed(graph, frame.entity)) {
        reply.code(404)
        return reply.send({
          error:  'NOT_FOUND',
          reason: `Entity '${frame.entity}' is not exposed`,
          _trail: TrailParser.toFluent(trail),
        }) as any
      }
    }

    // ── Créer le moteur de navigation ─────────────────────────
    const engine = NavigationEngine.forNavigation(graph, { trail })

    // Laisser Netflix (ou tout autre app) brancher ses hooks
    if (onEngine) {
      await onEngine(engine, req)
    }

    // ── Résoudre le Trail ─────────────────────────────────────
    const results = await engine.run(trail.depth + 1)
    const lastResult = results[results.length - 1]

    // ── Gérer les erreurs de navigation ───────────────────────
    if (lastResult?.result?.type === 'FAIL') {
      const reason = lastResult.result.reason ?? 'Navigation failed'

      if (reason.includes('notfound') || reason.includes('Aucun chemin')) {
        reply.code(404)
        return reply.send({
          error:  'NOT_FOUND',
          reason,
          _trail: TrailParser.toFluent(trail),
        }) as any
      }

      if (reason.includes('forbidden') || reason.includes('denied') || reason.includes('unauthenticated')) {
        reply.code(403)
        return reply.send({
          error:  'FORBIDDEN',
          reason,
          _trail: TrailParser.toFluent(trail),
        }) as any
      }

      reply.code(400)
      return reply.send({
        error:  'BAD_REQUEST',
        reason,
        _trail: TrailParser.toFluent(trail),
      }) as any
    }

    // ── Charger les données via DataLoader ───────────────────
    if (loader) {
      await loader.load(engine.trail)
    }

    // ── Récupérer les données de la frame courante ────────────
    const current  = engine.trail.current
    const rawData  = current?.data ?? null
    const data     = transformData ? transformData(rawData, engine.trail) : rawData

    // ── Générer les liens HATEOAS ─────────────────────────────
    const links = linkBuilder.from(engine.trail)

    // Si data est une liste, enrichir chaque item avec ses liens
    const isCollection = Array.isArray(data)
    let responseData   = data

    if (isCollection && data.length > 0) {
      const itemLinks = linkBuilder.forItems(engine.trail, data)
      responseData    = data.map((item: any, i: number) => ({
        ...item,
        _links: itemLinks[i],
      }))
    }

    // ── Construire la réponse ─────────────────────────────────
    const resolved = engine.trail.frames.filter(f => f.state === 'RESOLVED').length

    return {
      data:   responseData,
      _links: links,
      _trail: TrailParser.toFluent(engine.trail),
      _meta:  {
        entity:   current?.entity ?? '',
        depth:    engine.trail.depth,
        resolved,
        timing:   Date.now() - start,
        count:    isCollection ? data.length : undefined,
      },
    }
  })
}

// ── Helper — liens racines ────────────────────────────────────
// Filtre les nodes non exposés des liens racines.

function buildRootLinks(graph: Graph, prefix: string): Record<string, any> {
  const hasIncoming = new Set(graph.edges.map(e => e.to))
  const roots       = graph.nodes.filter(n =>
    !hasIncoming.has(n.id) && isExposed(graph, n.id)
  )

  const links: Record<string, any> = {
    self: { href: prefix || '/', method: 'GET' }
  }

  for (const node of roots) {
    links[node.id] = {
      href:   `${prefix}/${node.id}`,
      method: 'GET',
      rel:    node.id,
    }
  }

  return links
}

// ── Export avec fastify-plugin (preserve encapsulation) ───────
export const linklabPlugin = fp(linklabPluginImpl, {
  fastify: '4.x || 5.x',
  name:    'linklab',
})
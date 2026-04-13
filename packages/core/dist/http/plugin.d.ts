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
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { Graph, CompiledGraph } from '../types/index.js';
import { Trail } from '../navigation/Trail.js';
import { NavigationEngine } from '../navigation/NavigationEngine.js';
import { type DataLoaderOptions } from '../runtime/DataLoader.js';
import { type UserContextExtractor } from './TrailRequest.js';
export interface LinklabPluginOptions {
    /** Le graphe sémantique — navigation, LinkBuilder, Resolver */
    graph: Graph;
    /** Le graphe compilé — routes SQL optimales pour DataLoader/QueryEngine */
    compiledGraph?: CompiledGraph;
    /** Préfixe URL — ex: '/api' ou '/api/v1' */
    prefix?: string;
    /** Contexte global injecté dans chaque Trail */
    global?: Record<string, any>;
    /**
     * Extracteur de contexte utilisateur.
     * Par défaut : lit req.user ou req.session.user
     */
    extractUser?: UserContextExtractor;
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
    onEngine?: (engine: NavigationEngine, req: FastifyRequest) => void | Promise<void>;
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
    dataLoader?: DataLoaderOptions;
    /**
     * Transforme les données avant envoi.
     * Utile pour la pagination, la sérialisation custom, etc.
     */
    transformData?: (data: any, trail: Trail) => any;
}
export interface TrailResponse {
    data: any;
    _links: Record<string, any>;
    _trail: string;
    _meta: ResponseMeta;
}
export interface ResponseMeta {
    entity: string;
    depth: number;
    resolved: number;
    timing: number;
    count?: number;
}
export declare const linklabPlugin: FastifyPluginAsync<LinklabPluginOptions>;
//# sourceMappingURL=plugin.d.ts.map
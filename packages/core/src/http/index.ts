/**
 * http — Exports du module HTTP LinkLab
 *
 * Point d'entrée unique pour le plugin Fastify et
 * les utilitaires HTTP associés.
 *
 * @example
 * ```typescript
 * import { linklabPlugin, LinkBuilder, TrailParser } from '@linklab/http'
 *
 * await fastify.register(linklabPlugin, {
 *   graph:  compiledGraph,
 *   prefix: '/api',
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

export { linklabPlugin }           from './plugin.js'
export { LinkBuilder }             from './LinkBuilder.js'
export { DataLoader }              from '../runtime/DataLoader.js'

export type { LinklabPluginOptions } from './plugin.js'
export type { TrailResponse, ResponseMeta } from './plugin.js'
export type { HateoasLink, HateoasLinks, LinkBuilderOptions } from './LinkBuilder.js'
export type { UserContextExtractor } from './TrailRequest.js'
export type { DataLoaderOptions }  from '../runtime/DataLoader.js'

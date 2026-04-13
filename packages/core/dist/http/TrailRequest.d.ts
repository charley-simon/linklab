/**
 * TrailRequest — Augmentation du type Request Fastify
 *
 * Ajoute `request.trail` et `request.linkBuilder`
 * sur chaque requête décorée par le plugin LinkLab.
 *
 * Usage :
 * ```typescript
 * fastify.get('/*', async (req, reply) => {
 *   const trail = req.trail         // Trail parsé depuis l'URL
 *   const links = req.linkBuilder   // LinkBuilder prêt à l'emploi
 * })
 * ```
 */
import type { FastifyRequest } from 'fastify';
import type { Trail } from '../navigation/Trail.js';
import type { LinkBuilder } from './LinkBuilder.js';
/**
 * Déclaration d'augmentation du module Fastify.
 * TypeScript merge automatiquement avec FastifyRequest.
 */
declare module 'fastify' {
    interface FastifyRequest {
        /** Trail parsé depuis l'URL de la requête */
        trail: Trail;
        /** LinkBuilder configuré avec le graphe de l'instance */
        linkBuilder: LinkBuilder;
    }
}
/**
 * Extrait le contexte utilisateur depuis une requête Fastify.
 * Extensible par le dev via les options du plugin.
 */
export type UserContextExtractor = (req: FastifyRequest) => Promise<Record<string, any>> | Record<string, any>;
/**
 * Extracteur par défaut — lit req.user si présent (JWT/session)
 */
export declare const defaultUserExtractor: UserContextExtractor;
//# sourceMappingURL=TrailRequest.d.ts.map
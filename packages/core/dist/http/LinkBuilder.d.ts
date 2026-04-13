/**
 * LinkBuilder — Génère les liens HATEOAS depuis le graphe
 *
 * Logique pure, sans dépendance à Fastify.
 * Prend un Trail + un Graph, retourne des liens navigables.
 *
 * Trois catégories de liens générés automatiquement :
 *
 *   self      — l'URL courante (Trail sérialisé)
 *   up        — le parent (Trail sans la dernière frame)
 *   relations — toutes les arêtes sortantes du nœud courant
 *
 * Les liens émergent du graphe — le dev ne configure rien.
 */
import type { Graph } from '../types/index.js';
import { Trail } from '../navigation/Trail.js';
export interface HateoasLink {
    href: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    templated?: boolean;
    title?: string;
    rel?: string;
}
export interface HateoasLinks {
    self: HateoasLink;
    up?: HateoasLink;
    [relation: string]: HateoasLink | undefined;
}
export interface LinkBuilderOptions {
    /** Préfixe ajouté à toutes les URLs générées — ex: '/api/v1' */
    prefix?: string;
    /** Inclure les arêtes inverses (retour vers le parent) */
    includeReverse?: boolean;
    /** Exclure certaines relations — ex: ['internal', 'debug'] */
    exclude?: string[];
}
export declare class LinkBuilder {
    private graph;
    private options;
    constructor(graph: Graph, options?: LinkBuilderOptions);
    /**
     * Génère les liens HATEOAS pour un Trail donné.
     *
     * @example
     * ```typescript
     * const builder = new LinkBuilder(graph, { prefix: '/api' })
     * const links   = builder.from(trail)
     * // {
     * //   self:    { href: '/api/people/Nolan/movies' },
     * //   up:      { href: '/api/people/Nolan' },
     * //   actors:  { href: '/api/people/Nolan/movies/{id}/actors', templated: true },
     * //   ratings: { href: '/api/people/Nolan/movies/{id}/ratings', templated: true }
     * // }
     * ```
     */
    from(trail: Trail): HateoasLinks;
    /**
     * Génère les liens pour une collection de résultats.
     * Chaque item reçoit ses propres liens self + relations.
     *
     * @example
     * ```typescript
     * // GET /people/Nolan/movies → liste de films
     * const itemLinks = builder.forItems(trail, movies, 'id')
     * // itemLinks[0] = { self: { href: '/people/Nolan/movies/1' }, actors: {...} }
     * ```
     */
    forItems(trail: Trail, items: any[], idField?: string): HateoasLinks[];
    /**
     * Vérifie si une relation existe depuis un nœud donné.
     * Utile pour les hooks d'access.check.
     */
    hasRelation(fromEntity: string, relation: string): boolean;
    /**
     * Retourne toutes les entités accessibles depuis un nœud.
     */
    reachableFrom(entity: string): string[];
    private getOutgoingEdges;
    private prefix;
    private buildTitle;
}
//# sourceMappingURL=LinkBuilder.d.ts.map
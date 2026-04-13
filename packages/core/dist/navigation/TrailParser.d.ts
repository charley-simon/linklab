/**
 * TrailParser — Désérialise des représentations externes vers un Trail
 *
 * Trois sources supportées :
 *
 *   URL path   →  /cinema/people/Nolan/movies/Interstellar/actors
 *   URL fluent →  cinema.people(Nolan).movies(Interstellar).actors
 *   JSON       →  SerializedTrail (via Trail.from)
 *
 * Le parser est stateless — toutes les méthodes sont statiques.
 * Il ne valide pas les entités contre le graphe — c'est le rôle du moteur.
 */
import { Trail } from './Trail.js';
export declare class TrailParser {
    /**
     * Parse un path HTTP en Trail.
     *
     * Convention :
     *   /entity              → Frame(entity, UNRESOLVED)
     *   /entity/id           → Frame(entity, id, RESOLVED)
     *   /entity/id/other     → Frame(entity, id) + Frame(other, UNRESOLVED)
     *
     * Exemples :
     *   /people                     → [people?]
     *   /people/Nolan               → [people(Nolan)]
     *   /people/Nolan/movies        → [people(Nolan)] → [movies?]
     *   /people/Nolan/movies/2      → [people(Nolan)] → [movies(2)]
     *   /cinema/people/Nolan/movies → [cinema] → [people(Nolan)] → [movies?]
     *
     * @param path  - URL path, avec ou sans slash initial
     * @param init  - Contextes global/user à injecter
     */
    static fromPath(path: string, init?: {
        global?: Record<string, any>;
        user?: Record<string, any>;
    }): Trail;
    /**
     * Parse une expression fluente en Trail.
     *
     * Syntaxe :
     *   entity                  → Frame(entity, UNRESOLVED)
     *   entity(id)              → Frame(entity, id, RESOLVED)
     *   entity.other            → Frame(entity) + Frame(other)
     *   entity(id).other(id2)   → Frame(entity,id) + Frame(other,id2)
     *
     * Exemples :
     *   people                         → [people?]
     *   people(Nolan)                  → [people(Nolan)]
     *   people(Nolan).movies           → [people(Nolan)] → [movies?]
     *   cinema.people(Nolan).movies(2) → [cinema] → [people(Nolan)] → [movies(2)]
     *
     * @param expr  - Expression fluente
     * @param init  - Contextes global/user à injecter
     */
    static fromFluent(expr: string, init?: {
        global?: Record<string, any>;
        user?: Record<string, any>;
    }): Trail;
    /**
     * Sérialise un Trail en path HTTP.
     *
     * Exemple :
     *   Trail([people(Nolan)][movies?])  →  /people/Nolan/movies
     */
    static toPath(trail: Trail): string;
    /**
     * Sérialise un Trail en expression fluente.
     *
     * Exemple :
     *   Trail([people(Nolan)][movies?])  →  people(Nolan).movies
     */
    static toFluent(trail: Trail): string;
    /**
     * Heuristique : un segment ressemble-t-il à un nom d'entité ?
     * Les entités commencent par une lettre minuscule et ne contiennent
     * que des lettres, chiffres et tirets.
     */
    private static looksLikeEntity;
    /**
     * Essaie de convertir un id en nombre, sinon garde la string.
     */
    private static coerceId;
    /**
     * Tokenise une expression fluente en segments.
     * Préserve le contenu des parenthèses (les ids peuvent contenir des points).
     *
     * ex: "cinema.people(Nolan.Jr).movies"
     *   → ["cinema", "people(Nolan.Jr)", "movies"]
     */
    private static tokenizeFluent;
    /**
     * Parse un token "entity" ou "entity(id)" en Frame.
     */
    private static parseToken;
}
//# sourceMappingURL=TrailParser.d.ts.map
/**
 * api/DomainNode.ts — Niveau 1 : navigation sémantique
 *
 * Un DomainNode représente une frame dans le trail de navigation.
 * Il est Proxy sur lui-même pour intercepter les accès de propriétés
 * et les traduire en étapes de navigation.
 *
 * Usage :
 *   cinema.movies                        → DomainNode(entity='movies')
 *   cinema.people(278)                   → DomainNode(entity='people', filters={id:278})
 *   cinema.people(278).movies            → DomainNode(entity='movies', parent=people(278))
 *   await cinema.people(278).movies      → LinkLabResult (tableau enrichi)
 *
 * LinkLabResult = any[] + { path, timing, from, to }
 *   const films = await cinema.film()
 *   films.forEach(f => console.log(f.title))  // itération native
 *   films.length                               // nombre de résultats
 *   films.path                                 // ['film']
 *   films.timing                               // 12ms
 *
 *   cinema.directors('Nolan').movies     → QueryResult (route sémantique director_in)
 *   cinema.movies(278).actors            → QueryResult (route sémantique actor)
 *
 * Résolution des propriétés navigables :
 *   1. node.id === prop          → accès direct     (netflix: 'movies', 'people')
 *   2. node.type === prop        → type singulier    (musicians: 'artist')
 *   3. singular(prop) est un type connu → collection (musicians: 'artists' → type 'artist')
 *   4. label sémantique dans compiled.routes → vue filtrée (netflix: 'actor', 'director')
 *
 * Pattern thenable :
 *   Le DomainNode implémente .then() — JavaScript le traite comme une Promise.
 *   L'exécution réelle (fetch) n'est déclenchée qu'au `await`.
 */
import type { Graph as GraphData, CompiledGraph, Provider } from '../types/index.js';
export type LinkLabResult<T = any> = T[] & {
    /** Chemin de traversée dans le graphe */
    path: string[];
    /** Durée d'exécution en ms */
    timing: number;
    /** Entité source */
    from: string;
    /** Entité cible */
    to: string;
    /** Label sémantique composé du Trail (ex: "director_in→actor") */
    semanticLabel?: string;
    /** SQL généré (disponible en mode CTE postgres) */
    sql?: string;
};
interface DomainContext {
    graphData: GraphData;
    compiled: CompiledGraph | null;
    dataset: Record<string, any[]> | null;
    provider?: Provider | null;
    navMode?: boolean;
    dictionary?: Record<string, any> | null;
}
export declare class DomainNode {
    readonly entity: string;
    readonly filters: Record<string, any>;
    readonly parent: DomainNode | null;
    readonly semantic: string | null;
    private readonly _ctx;
    constructor(entity: string, filters: Record<string, any>, parent: DomainNode | null, ctx: DomainContext, semantic?: string | null);
    /**
     * _execute() — déclenché par `await domainNode`.
     *
     * Mode query (défaut) : cumulatif — chaque étape passe ses IDs à la suivante.
     * Mode nav  (préfixe) : stateless — comportement original, anchor→current direct.
     */
    private _execute;
    /**
     * linksFrom() — routes disponibles depuis l'entité courante.
     *
     * Retourne les routes avec labels humains depuis le dictionnaire résolu.
     * Si le dictionnaire n'est pas chargé, retourne les labels bruts du compilé.
     *
     * cinema.movies.linksFrom()
     * → [
     *     { to: 'people', label: 'Acteurs de',  semantic: 'actor',    composed: false },
     *     { to: 'people', label: 'Réalisé par', semantic: 'director', composed: false },
     *     { to: 'movies', label: 'Films avec',  semantic: 'actor_in→director', composed: true },
     *   ]
     */
    linksFrom(options?: {
        composed?: boolean;
        semantic?: boolean;
    }): Array<{
        to: string;
        label: string;
        semantic: string | null;
        composed: boolean;
        weight?: number;
    }>;
    /**
     * _executeQuery() — mode query cumulatif.
     *
     * Exécute chaque étape du Trail séquentiellement.
     * Les IDs trouvés à l'étape N deviennent une contrainte IN à l'étape N+1.
     * Le label sémantique est préservé d'une étape à l'autre.
     *
     * cinema.movies('Inception').director.movies :
     *   Étape 1 : movies WHERE title='Inception'     → [{ id: 27205 }]
     *   Étape 2 : people WHERE movieId IN [27205]    → [{ id: 525 }]  (semantic: director_in, jobId=2)
     *   Étape 3 : movies WHERE personId IN [525]     → 6 films        (jobId=2 préservé)
     */
    private _executeQuery;
    /**
     * _executeQueryCTE() — mode query SQL avec CTEs globales.
     *
     * Génère une seule requête SQL WITH ... AS (...) au lieu de N allers-retours.
     * Évite les clauses IN géantes sur les tables volumineuses.
     *
     * dvdrental.customer('MARY').rental.film :
     *
     *   WITH step0 AS (
     *     SELECT DISTINCT customer.* FROM customer WHERE customer.first_name ILIKE 'MARY'
     *   ),
     *   step1 AS (
     *     SELECT DISTINCT rental.*
     *     FROM rental
     *     INNER JOIN step0 ON rental.customer_id = step0.customer_id
     *   ),
     *   step2 AS (
     *     SELECT DISTINCT film.*
     *     FROM film
     *     INNER JOIN inventory ON film.film_id = inventory.film_id
     *     INNER JOIN step1 ON inventory.rental_id = step1.rental_id
     *   )
     *   SELECT * FROM step2
     */
    private _executeQueryCTE;
    /**
     * _fetchStep() — une étape du mode query cumulatif.
     *
     * Exécute la traversée from→to en filtrant sur les IDs de l'étape précédente.
     */
    private _fetchStep;
    /** Retourne la clé primaire d'une entité */
    private _getPK;
    private _fetchDirect;
    private _fetchViaRoute;
}
/**
 * createDomain — retourne le proxy sémantique (niveau 1).
 *
 * Le proxy expose :
 *   - Les entités du graphe comme propriétés navigables (cinema.movies, dvd.film...)
 *   - `.graph` — accès au Graph sous-jacent pour les niveaux 2/3/4
 *
 * C'est l'objet retourné par loadGraph() — point d'entrée principal de LinkLab.
 */
export declare function createDomain(ctx: DomainContext, graphInstance?: any): any;
export {};
//# sourceMappingURL=DomainNode.d.ts.map
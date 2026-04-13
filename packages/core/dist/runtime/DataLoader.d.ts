/**
 * DataLoader — Fetch les données pour un Trail résolu
 *
 * Fait le pont entre :
 *   Trail (sémantique — où on est, d'où on vient)
 *   QueryEngine (technique — comment fetcher les données)
 *   Provider (physique — SQL ou JSON en mémoire)
 *
 * Principe :
 *   Pour chaque frame RESOLVED dans le Trail, DataLoader
 *   construit la requête optimale depuis le graphe compilé
 *   et remplit frame.data avec les résultats.
 *
 * Deux modes de fetch :
 *   SQL  — via Provider (PostgreSQL, MySQL...)
 *   JSON — via dataset en mémoire (mock, tests, Netflix JSON)
 *
 * Usage :
 * ```typescript
 * const loader = new DataLoader(compiledGraph, { dataset })
 * await loader.load(trail)
 * // trail.current.data contient maintenant les données
 * ```
 */
import type { CompiledGraph, Frame } from '../types/index.js';
import type { Trail } from '../navigation/Trail.js';
export interface DataLoaderOptions {
    /**
     * Dataset JSON en mémoire — pour les providers mock ou Netflix JSON.
     * Clé = nom de l'entité, valeur = tableau de rows.
     */
    dataset?: Record<string, any[]>;
    /**
     * Provider SQL — pour PostgreSQL, MySQL, etc.
     * Si fourni, prend la priorité sur dataset.
     */
    provider?: {
        query<T = any>(sql: string, params?: any[]): Promise<T[]>;
    };
    /**
     * Transforme les filtres d'une frame en paramètres SQL.
     * Par défaut : { field: 'id', value: 1 } → WHERE entity.id = 1
     */
    buildFilters?: (frame: Frame) => Record<string, any>;
}
export declare class DataLoader {
    private queryEngine;
    private options;
    constructor(compiledGraph: CompiledGraph, options?: DataLoaderOptions);
    /**
     * Charge les données pour la frame courante du Trail.
     *
     * Stratégie :
     *   1. Si la frame courante est UNRESOLVED → rien à fetcher
     *   2. Si depth === 1 → fetch direct de l'entité (avec id si présent)
     *   3. Si depth > 1  → traverse depuis le dernier ancêtre résolu
     *
     * Mutate trail.current.data avec les résultats.
     */
    load(trail: Trail): Promise<void>;
    /**
     * Charge les données pour toutes les frames RESOLVED du Trail.
     * Utile pour les réponses enrichies (chaque frame a ses données).
     */
    loadAll(trail: Trail): Promise<void>;
    /**
     * Trouve le premier ancêtre résolu avec un id dans le Trail.
     * C'est le point de départ de la traversée.
     */
    private findAnchor;
    /**
     * Construit les filtres depuis le Trail.
     * Combine les filtres de resolvedBy + l'id de l'ancêtre.
     */
    private buildFilters;
    /**
     * Résout la clé primaire d'une entité depuis le graphe compilé.
     * Fallback : {entity}_id (convention dvdrental, PostgreSQL standard).
     */
    private pkOf;
    /**
     * Fetch direct — une seule entité, sans traversée.
     */
    private fetchDirect;
    /**
     * Fetch via route compilée — traverse from → to.
     */
    private fetchViaRoute;
}
//# sourceMappingURL=DataLoader.d.ts.map
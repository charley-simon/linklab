/**
 * Trail — Contexte de navigation vivant
 *
 * Trois niveaux de contexte, trois durées de vie :
 *
 *   global   — vit aussi longtemps que l'instance LinkLab
 *              config, feature flags, métriques globales
 *
 *   user     — vit le temps d'une session
 *              userId, permissions, préférences, historique récent
 *
 *   frames   — vit le temps d'une navigation
 *              le chemin parcouru, position courante
 *
 * Deux niveaux d'API :
 *
 *   Bas niveau  — trail.push(frame), trail.pop(), trail.compact()
 *                 fondation sur laquelle tout repose
 *
 *   Haut niveau — API fluente, construite sur push()
 *                 cinema.people('Nolan').movies
 *
 * Contrat de sérialisation :
 *   global et user ne contiennent que des données — jamais de fonctions.
 *   Un Trail sérialisé peut être rejoué exactement.
 */
import type { Frame } from '../types/index.js';
export interface TrailInit {
    global?: Record<string, any>;
    user?: Record<string, any>;
    frames?: Frame[];
}
/** Format de sérialisation — versionné pour les migrations futures */
export interface SerializedTrail {
    v: number;
    global: Record<string, any>;
    user: Record<string, any>;
    frames: Frame[];
    savedAt: string;
}
export declare class Trail {
    /** Contexte global — long terme */
    readonly global: Record<string, any>;
    /** Contexte utilisateur — session */
    readonly user: Record<string, any>;
    /** Frames de navigation — readonly depuis l'extérieur */
    private _frames;
    private constructor();
    /** Crée un Trail vierge, avec contextes optionnels */
    static create(init?: TrailInit): Trail;
    /** Restaure un Trail depuis sa forme sérialisée */
    static from(serialized: string | SerializedTrail): Trail;
    /** Toutes les frames — tableau immuable depuis l'extérieur */
    get frames(): readonly Frame[];
    /** Dernière frame — position courante */
    get current(): Frame | undefined;
    /** Nombre de frames */
    get depth(): number;
    /** Vrai si toutes les frames sont résolues */
    get isFullyResolved(): boolean;
    /** Frames non résolues */
    get unresolved(): Frame[];
    /**
     * Pousse une frame sur le Trail.
     * Retourne this pour le chaînage.
     *
     * Si state n'est pas précisé :
     *   - id fourni  → RESOLVED
     *   - id absent  → UNRESOLVED
     */
    push(frame: Frame): this;
    /**
     * Retire et retourne la dernière frame.
     * Retourne undefined si le Trail est vide.
     */
    pop(): Frame | undefined;
    /**
     * Met à jour une frame existante par index ou par entity.
     * Réservé à LinkLab — permet au moteur de synchroniser les frames résolues.
     *
     * @param entity  - L'entité de la frame à mettre à jour
     * @param updated - Les nouvelles valeurs à merger
     */
    updateFrame(entity: string, updated: Partial<Frame>): boolean;
    /**
     * Compacte le Trail — supprime les frames non-discriminantes
     * en conservant uniquement les frames qui portent un id
     * ou qui sont la position courante.
     *
     * Exemple :
     *   [cinema][people(Nolan)][movies(Interstellar)][actors]
     *   →  [people(Nolan)][movies(Interstellar)][actors]
     *
     * Note : réservé à LinkLab — appelé par le moteur, pas par les hooks.
     */
    compact(): this;
    /**
     * Retourne la frame à l'index donné (0 = première).
     * Accepte les index négatifs (-1 = dernière).
     */
    at(index: number): Frame | undefined;
    /**
     * Retourne la dernière frame dont l'entity correspond.
     */
    find(entity: string): Frame | undefined;
    /**
     * Retourne un Trail tronqué jusqu'à l'index donné (non inclus).
     * Utile pour le replay partiel.
     */
    slice(end: number): Trail;
    /**
     * Sérialise le Trail en JSON.
     * global et user ne doivent contenir que des données — les fonctions
     * sont silencieusement ignorées par JSON.stringify.
     */
    serialize(): string;
    toJSON(): SerializedTrail;
    /**
     * Deep copy — utile pour le replay ou les tests.
     * Le clone est indépendant — modifier l'un ne modifie pas l'autre.
     */
    clone(): Trail;
    /**
     * Représentation lisible du Trail courant.
     * ex: [people(Nolan)] → [movies(Interstellar)] → [actors?]
     */
    toString(): string;
}
//# sourceMappingURL=Trail.d.ts.map
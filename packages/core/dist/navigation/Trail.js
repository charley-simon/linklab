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
// ── Trail ─────────────────────────────────────────────────────
export class Trail {
    /** Contexte global — long terme */
    global;
    /** Contexte utilisateur — session */
    user;
    /** Frames de navigation — readonly depuis l'extérieur */
    _frames;
    constructor(init = {}) {
        this.global = init.global ?? {};
        this.user = init.user ?? {};
        this._frames = init.frames ? init.frames.map(f => ({ ...f })) : [];
    }
    // ── Factories ──────────────────────────────────────────────
    /** Crée un Trail vierge, avec contextes optionnels */
    static create(init = {}) {
        return new Trail(init);
    }
    /** Restaure un Trail depuis sa forme sérialisée */
    static from(serialized) {
        const data = typeof serialized === 'string'
            ? JSON.parse(serialized)
            : serialized;
        if (data.v !== 1) {
            throw new Error(`Trail.from: version ${data.v} non supportée`);
        }
        return new Trail({
            global: data.global ?? {},
            user: data.user ?? {},
            frames: data.frames ?? [],
        });
    }
    // ── Accesseurs frames ──────────────────────────────────────
    /** Toutes les frames — tableau immuable depuis l'extérieur */
    get frames() {
        return this._frames;
    }
    /** Dernière frame — position courante */
    get current() {
        return this._frames[this._frames.length - 1];
    }
    /** Nombre de frames */
    get depth() {
        return this._frames.length;
    }
    /** Vrai si toutes les frames sont résolues */
    get isFullyResolved() {
        return this._frames.every(f => f.state === 'RESOLVED');
    }
    /** Frames non résolues */
    get unresolved() {
        return this._frames.filter(f => f.state === 'UNRESOLVED');
    }
    // ── API bas niveau ─────────────────────────────────────────
    /**
     * Pousse une frame sur le Trail.
     * Retourne this pour le chaînage.
     *
     * Si state n'est pas précisé :
     *   - id fourni  → RESOLVED
     *   - id absent  → UNRESOLVED
     */
    push(frame) {
        const normalized = {
            ...frame,
            state: frame.state ?? (frame.id !== undefined ? 'RESOLVED' : 'UNRESOLVED'),
        };
        this._frames.push(normalized);
        return this;
    }
    /**
     * Retire et retourne la dernière frame.
     * Retourne undefined si le Trail est vide.
     */
    pop() {
        return this._frames.pop();
    }
    /**
     * Met à jour une frame existante par index ou par entity.
     * Réservé à LinkLab — permet au moteur de synchroniser les frames résolues.
     *
     * @param entity  - L'entité de la frame à mettre à jour
     * @param updated - Les nouvelles valeurs à merger
     */
    updateFrame(entity, updated) {
        const idx = this._frames.findIndex(f => f.entity === entity && f.state === 'UNRESOLVED');
        if (idx === -1)
            return false;
        this._frames[idx] = { ...this._frames[idx], ...updated };
        return true;
    }
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
    compact() {
        const last = this._frames.length - 1;
        this._frames = this._frames.filter((f, i) => i === last || f.id !== undefined);
        return this;
    }
    /**
     * Retourne la frame à l'index donné (0 = première).
     * Accepte les index négatifs (-1 = dernière).
     */
    at(index) {
        if (index < 0)
            index = this._frames.length + index;
        return this._frames[index];
    }
    /**
     * Retourne la dernière frame dont l'entity correspond.
     */
    find(entity) {
        return [...this._frames].reverse().find(f => f.entity === entity);
    }
    /**
     * Retourne un Trail tronqué jusqu'à l'index donné (non inclus).
     * Utile pour le replay partiel.
     */
    slice(end) {
        return new Trail({
            global: { ...this.global },
            user: { ...this.user },
            frames: this._frames.slice(0, end),
        });
    }
    // ── Sérialisation ──────────────────────────────────────────
    /**
     * Sérialise le Trail en JSON.
     * global et user ne doivent contenir que des données — les fonctions
     * sont silencieusement ignorées par JSON.stringify.
     */
    serialize() {
        return JSON.stringify(this.toJSON());
    }
    toJSON() {
        return {
            v: 1,
            global: this.global,
            user: this.user,
            frames: [...this._frames],
            savedAt: new Date().toISOString(),
        };
    }
    /**
     * Deep copy — utile pour le replay ou les tests.
     * Le clone est indépendant — modifier l'un ne modifie pas l'autre.
     */
    clone() {
        return Trail.from(this.toJSON());
    }
    // ── Debug ──────────────────────────────────────────────────
    /**
     * Représentation lisible du Trail courant.
     * ex: [people(Nolan)] → [movies(Interstellar)] → [actors?]
     */
    toString() {
        if (this._frames.length === 0)
            return '(trail vide)';
        return this._frames
            .map(f => {
            const id = f.id !== undefined ? `(${f.id})` : '';
            const state = f.state === 'UNRESOLVED' ? '?' : f.state === 'DEFERRED' ? '…' : '';
            return `[${f.entity}${id}${state}]`;
        })
            .join(' → ');
    }
}
//# sourceMappingURL=Trail.js.map
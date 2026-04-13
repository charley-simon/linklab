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
import { QueryEngine } from '../runtime/QueryEngine.js';
function makeResult(queryResult) {
    const arr = [...(queryResult.data ?? [])];
    arr.path = queryResult.path ?? [];
    arr.timing = queryResult.timing ?? 0;
    arr.from = queryResult.from ?? '';
    arr.to = queryResult.to ?? '';
    arr.semanticLabel = queryResult.semanticLabel;
    arr.sql = queryResult.sql;
    return arr;
}
// ── Résolution des noms de propriétés → IDs de nodes ─────────────────────────
/**
 * resolveEntity — résout un nom de propriété en entité navigable.
 *
 * Ordre de priorité :
 *   1. ID direct dans graphData.nodes       → 'movies', 'people'
 *   2. Type singulier dans graphData.nodes  → 'artist'
 *   3. Pluriel → singulier                  → 'artists' → 'artist'
 *   4. Label sémantique dans compiled.routes → 'actor', 'director', 'writer'
 *      Nécessite compiled — silencieux si absent.
 */
function resolveEntity(prop, graphData, compiled = null, currentEntity = null) {
    // 1. ID direct : 'movies' → node {id: 'movies'}
    if (graphData.nodes.some(n => n.id === prop)) {
        return { entity: prop, semantic: null };
    }
    // 2. Type singulier : 'artist' → premier node de type 'artist'
    const byType = graphData.nodes.find(n => n.type === prop);
    if (byType) {
        return { entity: byType.id, semantic: null };
    }
    // 3. Pluriel → singulier : 'artists' → type 'artist'
    const singular = toSingular(prop);
    const byPlural = graphData.nodes.find(n => n.type === singular);
    if (byPlural) {
        return { entity: singular, semantic: null };
    }
    // 4. Label sémantique dans compiled.routes : 'director', 'actor', 'writer'
    //    Stratégie de recherche :
    //      a. Match exact sur le label                  : 'actor'     → label='actor'
    //      b. Singulier du prop                         : 'actors'    → label='actor'
    //      c. Singulier + suffixe '_in' (sens inverse)  : 'directors' → label='director_in'
    //    Si currentEntity est fourni, on priorise la route dont from === currentEntity.
    if (compiled) {
        const singular = toSingular(prop);
        const candidates = [prop, singular, `${prop}_in`, `${singular}_in`];
        const semanticRoutes = compiled.routes.filter(r => r.semantic === true && candidates.includes(r.label));
        if (semanticRoutes.length > 0) {
            // Deux contextes distincts :
            //
            // A) Depuis createDomain (currentEntity=null) :
            //    cinema.directors('Nolan') — on navigue DEPUIS l'entité de la route
            //    director_in : people→movies → entity='people' (point de départ)
            //
            // B) Depuis un DomainNode parent (currentEntity fourni) :
            //    movies(278).actors — on navigue VERS l'entité de la route
            //    actor : movies→people → entity='people' (destination)
            //    On priorise la route dont from === currentEntity
            if (currentEntity) {
                // Cas B — depuis un DomainNode parent
                //
                // Deux sous-cas :
                //
                // B1 — Navigation vers une autre entité : movies(278).directors
                //      currentEntity='movies', prop='directors'
                //      → label='director' (movies→people) → entity='people' (destination)
                //      La route part DE currentEntity → naviguer VERS to
                //
                // B2 — Qualification/filtre sur même entité : people('Nolan').director
                //      currentEntity='people', prop='director'
                //      → label='director_in' (people→movies) mais on reste sur 'people'
                //      La route part DE currentEntity mais c'est un filtre, pas une nav vers movies
                //
                // Distinction : si prop (singulier) correspond à un label _in depuis currentEntity
                //   → c'est un filtre (B2) : entity = currentEntity, semantic = label_in
                // Sinon : c'est une navigation (B1) : entity = to, semantic = label
                const propSingular = toSingular(prop);
                const inLabel = `${propSingular}_in`;
                // Chercher une route _in depuis currentEntity (filtre sur même entité)
                const filterRoute = semanticRoutes.find(r => r.label === inLabel && r.from === currentEntity);
                if (filterRoute) {
                    // B2 — filtre : on reste sur currentEntity avec le semantic _in
                    return { entity: currentEntity, semantic: filterRoute.label };
                }
                // Chercher une route depuis currentEntity (navigation vers autre entité)
                const navRoute = semanticRoutes.find(r => r.from === currentEntity);
                if (navRoute) {
                    // B1 — navigation : on va vers to
                    return { entity: navRoute.to, semantic: navRoute.label };
                }
                // Fallback : première route disponible → navigation vers to
                const best = semanticRoutes[0];
                return { entity: best.to, semantic: best.label };
            }
            else {
                // Cas A — depuis createDomain : cinema.directors('Nolan')
                // On navigue DEPUIS l'entité source de la vue sémantique
                // Prioriser la route dont le label se termine par '_in' (sens inverse = point de départ)
                // Ex: 'directors' → label='director_in' (people→movies) → entity='people'
                // Ex: 'director'  → label='director_in' en priorité, sinon 'director' (movies→people) → from='movies'
                const propSingular = toSingular(prop);
                const inLabel = `${propSingular}_in`;
                const bestIn = semanticRoutes.find(r => r.label === inLabel);
                const best = bestIn ?? semanticRoutes[0];
                // Retourner l'entité SOURCE (from) — c'est le point d'entrée pour cinema.directors(...)
                return { entity: best.from, semantic: best.label };
            }
        }
    }
    return null;
}
/**
 * Résout les nodes correspondant à une entité (peut être un type avec N nodes).
 * Pour Netflix (type='table') : un seul node par entité.
 * Pour Musicians (type='artist') : N nodes du même type.
 */
function resolveNodes(entity, graphData) {
    // Cherche d'abord par ID exact
    const byId = graphData.nodes.filter(n => n.id === entity);
    if (byId.length > 0)
        return byId;
    // Sinon par type
    return graphData.nodes.filter(n => n.type === entity);
}
function toSingular(s) {
    if (s.endsWith('ies'))
        return s.slice(0, -3) + 'y';
    if (s.endsWith('s') && !s.endsWith('ss'))
        return s.slice(0, -1);
    return s;
}
// ── DomainNode ────────────────────────────────────────────────────────────────
export class DomainNode {
    entity; // ID ou type du node courant
    filters; // {id: 278} ou {name: 'Nolan'}
    parent; // frame précédente dans le trail
    semantic; // label sémantique si résolu via compiled.routes
    _ctx;
    constructor(entity, filters, parent, ctx, semantic = null) {
        this.entity = entity;
        this.filters = filters;
        this.parent = parent;
        this._ctx = ctx;
        this.semantic = semantic;
        // Retourner un Proxy pour intercepter les accès de propriétés
        return new Proxy(this, {
            get(target, prop) {
                // Propriétés natives de DomainNode — accès direct
                if (prop in target)
                    return target[prop];
                // Propriétés Symbol (iteration, etc.) — passe-plat
                if (typeof prop === 'symbol')
                    return undefined;
                // Méthodes Array — déclenchent l'exécution et appliquent la méthode sur le résultat
                // Permet : await cinema.movies.map(m => m.title)
                //          await cinema.film.filter(f => f.rating === 'PG')
                //          await cinema.film.find(f => f.id === 278)
                const ARRAY_METHODS = [
                    'map',
                    'filter',
                    'find',
                    'findIndex',
                    'forEach',
                    'some',
                    'every',
                    'reduce',
                    'reduceRight',
                    'slice',
                    'flat',
                    'flatMap',
                    'includes'
                ];
                if (ARRAY_METHODS.includes(prop)) {
                    return (...args) => target._execute().then(result => result[prop](...args));
                }
                // then/catch/finally — pattern thenable (Promise-like)
                // Déclenche l'exécution au `await`
                if (prop === 'then') {
                    return (resolve, reject) => target._execute().then(resolve, reject);
                }
                if (prop === 'catch') {
                    return (reject) => target._execute().catch(reject);
                }
                if (prop === 'finally') {
                    return (fn) => target._execute().finally(fn);
                }
                // Propriété navigable ? → nouvelle frame
                // On passe compiled pour permettre la résolution des labels sémantiques (cas 4)
                const resolved = resolveEntity(prop, target._ctx.graphData, target._ctx.compiled, target.entity);
                if (resolved !== null) {
                    return makeCallableDomainNode(resolved.entity, {}, target, target._ctx, resolved.semantic);
                }
                // Propriété inconnue
                return undefined;
            }
        });
    }
    // ── Exécution (thenable) ──────────────────────────────────────────────────
    /**
     * _execute() — déclenché par `await domainNode`.
     *
     * Mode query (défaut) : cumulatif — chaque étape passe ses IDs à la suivante.
     * Mode nav  (préfixe) : stateless — comportement original, anchor→current direct.
     */
    async _execute() {
        const start = Date.now();
        // Reconstruire le trail (du plus ancien au plus récent)
        const trail = [];
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        let cursor = this;
        while (cursor) {
            trail.unshift(cursor);
            cursor = cursor.parent;
        }
        // Cas 1 : un seul node dans le trail → fetch direct (identique query/nav)
        if (trail.length === 1) {
            return makeResult(await this._fetchDirect(trail[0], start));
        }
        // Cas 2 : mode nav — comportement original (anchor→current direct)
        if (this._ctx.navMode) {
            const anchor = trail[0];
            const current = trail[trail.length - 1];
            return makeResult(await this._fetchViaRoute(anchor, current, trail, start));
        }
        // Cas 3 : mode query — cumulatif étape par étape
        if (process.env.LINKLAB_DEBUG) {
            console.log(`[_execute query] trail=${trail.map(n => `${n.entity}(sem=${n.semantic},fil=${JSON.stringify(n.filters)})`).join('→')}`);
        }
        return this._executeQuery(trail, start);
    }
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
    linksFrom(options = {}) {
        const { compiled, dictionary } = this._ctx;
        if (!compiled)
            return [];
        let routes = compiled.routes.filter((r) => r.from === this.entity);
        // Filtres optionnels
        if (options.composed !== undefined)
            routes = routes.filter((r) => !!r.composed === options.composed);
        if (options.semantic !== undefined)
            routes = routes.filter((r) => !!r.semantic === options.semantic);
        const dictRoutes = dictionary?.routes ?? {};
        return routes.map((r) => {
            const key = r.label && r.semantic ? `${r.from}→${r.to}[${r.label}]` : `${r.from}→${r.to}`;
            const dictEntry = dictRoutes[key];
            return {
                to: r.to,
                label: dictEntry?.label ?? r.label ?? `${r.from}→${r.to}`,
                semantic: r.label ?? null,
                composed: !!r.composed,
                weight: r.primary?.weight
            };
        });
    }
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
    async _executeQuery(trail, start) {
        const { compiled, dataset, provider } = this._ctx;
        if (!compiled || (!dataset && !provider)) {
            throw new Error(`Mode query nécessite un compiledGraph et un dataset ou provider.`);
        }
        // Mode SQL → générer une requête CTE globale (évite les IN géants)
        if (provider) {
            return this._executeQueryCTE(trail, start, provider, compiled);
        }
        const engine = new QueryEngine(compiled);
        let currentIds = null;
        let lastSemantic = null;
        let lastResult = null;
        const resolvedPath = []; // chemin réel parcouru (pour breadcrumb)
        const trailSemantics = []; // labels sémantiques du Trail (pour breadcrumb)
        for (let i = 0; i < trail.length; i++) {
            const node = trail[i];
            if (i === 0) {
                lastResult = await this._fetchDirect(node, start);
                currentIds = lastResult.data.map((row) => row.id ?? row[Object.keys(row)[0]]);
                lastSemantic = node.semantic;
                if (process.env.LINKLAB_DEBUG) {
                    console.log(`[_fetchDirect] entity=${node.entity} filters=${JSON.stringify(node.filters)} → ${lastResult.data.length} rows, currentIds=${JSON.stringify(currentIds?.slice(0, 3))}`);
                }
                if (lastResult.path?.length)
                    resolvedPath.push(...lastResult.path);
                else
                    resolvedPath.push(node.entity);
                continue;
            }
            // Étapes suivantes : traversée avec contrainte IN sur les IDs précédents
            const prev = trail[i - 1];
            const semantic = node.semantic ?? lastSemantic;
            // Cas spécial A : même entité + semantic différent
            // → chercher une route composée dans le compilé
            if (prev.entity === node.entity && node.semantic !== null) {
                if (lastSemantic !== null && lastSemantic !== node.semantic) {
                    // Construire le label composé
                    // Convention : second terme sans _in (movies→people = 'actor', pas 'actor_in')
                    const secondLabel = node.semantic.endsWith('_in')
                        ? node.semantic.slice(0, -3)
                        : node.semantic;
                    const composedLabel = `${lastSemantic}→${secondLabel}`;
                    const composedRoute = engine?.compiledGraph?.routes?.find((r) => r.from === prev.entity &&
                        r.to === node.entity &&
                        r.composed &&
                        r.label === composedLabel);
                    if (composedRoute) {
                        // Exécuter la route composée directement avec les IDs courants
                        const idConstraint = currentIds && currentIds.length > 0
                            ? { _ids: currentIds, _fromEntity: prev.entity }
                            : null;
                        lastResult = await this._fetchStep(prev.entity, node.entity, node.filters, composedLabel, // label composé → getRoute trouvera la route
                        idConstraint, engine, start);
                        currentIds = lastResult.data.map((row) => row.id ?? row[Object.keys(row)[0]]);
                        // Accumuler le chemin réel de la route composée
                        if (lastResult.path?.length > 1)
                            resolvedPath.push(...lastResult.path.slice(1));
                        else
                            resolvedPath.push(node.entity);
                        lastSemantic = null; // reset après traversée composée
                    }
                    else {
                        // Pas de route composée → [] silencieux
                        lastResult = {
                            from: prev.entity,
                            to: node.entity,
                            filters: {},
                            data: [],
                            path: [prev.entity],
                            timing: Date.now() - start
                        };
                        currentIds = [];
                        lastSemantic = node.semantic;
                    }
                    continue;
                }
                lastSemantic = node.semantic;
                continue;
            }
            // Construire les filtres : IDs précédents comme contrainte
            // Court-circuit : si currentIds est vide, le résultat sera vide — inutile d'exécuter
            if (currentIds !== null && currentIds.length === 0) {
                lastResult = {
                    from: prev.entity,
                    to: node.entity,
                    filters: {},
                    data: [],
                    path: [prev.entity, node.entity],
                    timing: Date.now() - start
                };
                break;
            }
            // Sécurité : limiter la taille du IN pour éviter les requêtes SQL trop longues
            const MAX_IN_SIZE = 1000;
            const safeIds = currentIds && currentIds.length > MAX_IN_SIZE
                ? currentIds.slice(0, MAX_IN_SIZE)
                : currentIds;
            const idConstraint = safeIds && safeIds.length > 0 ? { _ids: safeIds, _fromEntity: prev.entity } : null;
            lastResult = await this._fetchStep(prev.entity, node.entity, node.filters, semantic, idConstraint, engine, start);
            currentIds = lastResult.data.map((row) => row.id ?? row[Object.keys(row)[0]]);
            // Accumuler le chemin réel (sans répéter le premier nœud)
            if (lastResult.path?.length > 1)
                resolvedPath.push(...lastResult.path.slice(1));
            else
                resolvedPath.push(node.entity);
            // Accumuler le semantic pour le breadcrumb
            if (semantic)
                trailSemantics.push(semantic);
            // Préserver le semantic pour l'étape suivante
            lastSemantic = semantic;
        }
        const semanticLabel = trailSemantics.length > 0 ? trailSemantics.join('→') : undefined;
        const base = lastResult ?? {
            from: '',
            to: '',
            filters: {},
            data: [],
            path: [],
            timing: Date.now() - start
        };
        return makeResult({
            ...base,
            path: resolvedPath.length ? resolvedPath : base.path,
            semanticLabel
        });
    }
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
    async _executeQueryCTE(trail, start, provider, compiled) {
        const engine = new QueryEngine(compiled);
        // Résoudre la PK d'une entité
        const pkOf = (tableId) => {
            const node = compiled.nodes.find((n) => n.id === tableId);
            const pk = node?.primaryKey;
            return Array.isArray(pk) ? pk[0] : (pk ?? `${tableId}_id`);
        };
        // Construire le WHERE depuis les filtres d'un nœud
        const buildWhere = (entity, filters) => {
            const pk = pkOf(entity);
            const clauses = Object.entries(filters).map(([k, v]) => {
                const col = k === 'id' ? pk : k;
                if (v === null)
                    return `${entity}.${col} IS NULL`;
                if (typeof v === 'object' && !Array.isArray(v)) {
                    const op = Object.keys(v)[0];
                    const val = v[op];
                    switch (op) {
                        case 'like':
                            return `${entity}.${col} ILIKE '%${val}%'`;
                        case 'startsWith':
                            return `${entity}.${col} ILIKE '${val}%'`;
                        case 'endsWith':
                            return `${entity}.${col} ILIKE '%${val}'`;
                        case 'gt':
                            return `${entity}.${col} > ${val}`;
                        case 'gte':
                            return `${entity}.${col} >= ${val}`;
                        case 'lt':
                            return `${entity}.${col} < ${val}`;
                        case 'lte':
                            return `${entity}.${col} <= ${val}`;
                        case 'neq':
                            return `${entity}.${col} != ${typeof val === 'string' ? `'${val}'` : val}`;
                        case 'in':
                            return `${entity}.${col} IN (${val.map((x) => (typeof x === 'string' ? `'${x}'` : x)).join(',')})`;
                        default:
                            return `${entity}.${col} = ${typeof val === 'string' ? `'${val}'` : val}`;
                    }
                }
                if (typeof v === 'string')
                    return `${entity}.${col} ILIKE '${v}'`;
                return `${entity}.${col} = ${v}`;
            });
            return clauses.length > 0 ? clauses.join(' AND ') : '';
        };
        const ctes = [];
        const resolvedPath = [];
        let lastEntity = trail[0].entity;
        let lastSemantic = trail[0].semantic;
        // ── Step 0 : premier nœud — fetch direct avec filtres ─────────────────
        const step0Entity = trail[0].entity;
        const step0Where = buildWhere(step0Entity, trail[0].filters);
        ctes.push(`step0 AS (\n  SELECT DISTINCT ${step0Entity}.*` +
            ` FROM ${step0Entity}` +
            (step0Where ? `\n  WHERE ${step0Where}` : '') +
            `\n)`);
        resolvedPath.push(step0Entity);
        // ── Steps suivants ─────────────────────────────────────────────────────
        for (let i = 1; i < trail.length; i++) {
            const node = trail[i];
            const prev = trail[i - 1];
            // Cas spécial : même entité + semantic différent → route composée
            if (prev.entity === node.entity && node.semantic !== null) {
                if (lastSemantic !== null && lastSemantic !== node.semantic) {
                    const secondLabel = node.semantic.endsWith('_in')
                        ? node.semantic.slice(0, -3)
                        : node.semantic;
                    const composedLabel = `${lastSemantic}→${secondLabel}`;
                    try {
                        const route = engine.getRoute(prev.entity, node.entity, composedLabel);
                        const stepIdx = ctes.length;
                        const prevStep = `step${stepIdx - 1}`;
                        const cte = buildCTEStep(stepIdx, node.entity, route.primary, prevStep, prev.entity, node.filters, pkOf, buildWhere);
                        ctes.push(cte);
                        resolvedPath.push(...route.primary.path.slice(1));
                        lastEntity = node.entity;
                        lastSemantic = null;
                        continue;
                    }
                    catch {
                        /* pas de route composée → vide */
                    }
                    // Pas de route composée → CTE vide
                    const stepIdx = ctes.length;
                    ctes.push(`step${stepIdx} AS (\n  SELECT DISTINCT ${node.entity}.* FROM ${node.entity} WHERE 1=0\n)`);
                    resolvedPath.push(node.entity);
                    lastEntity = node.entity;
                    lastSemantic = node.semantic;
                    continue;
                }
                lastSemantic = node.semantic;
                continue;
            }
            // Cas normal : traversée from→to
            const semantic = node.semantic ?? lastSemantic;
            try {
                const route = engine.getRoute(prev.entity, node.entity, semantic ?? undefined);
                const stepIdx = ctes.length;
                const prevStep = `step${stepIdx - 1}`;
                const cte = buildCTEStep(stepIdx, node.entity, route.primary, prevStep, prev.entity, node.filters, pkOf, buildWhere);
                ctes.push(cte);
                resolvedPath.push(...route.primary.path.slice(1));
                lastEntity = node.entity;
                lastSemantic = semantic;
            }
            catch {
                // Route introuvable → résultat vide
                const stepIdx = ctes.length;
                ctes.push(`step${stepIdx} AS (\n  SELECT DISTINCT ${node.entity}.* FROM ${node.entity} WHERE 1=0\n)`);
                resolvedPath.push(node.entity);
                lastEntity = node.entity;
                lastSemantic = null;
            }
        }
        // ── Requête finale ─────────────────────────────────────────────────────
        const finalStep = `step${ctes.length - 1}`;
        const sql = `WITH\n${ctes.map(c => `  ${c}`).join(',\n')}\nSELECT * FROM ${finalStep}`;
        if (process.env.LINKLAB_DEBUG) {
            console.log(`[_executeQueryCTE]\n${sql}\n`);
        }
        const data = await provider.query(sql);
        const from = trail[0].entity;
        const to = lastEntity;
        return makeResult({
            from,
            to,
            filters: trail[0].filters,
            data,
            path: resolvedPath,
            timing: Date.now() - start,
            sql
        });
    }
    /**
     * _fetchStep() — une étape du mode query cumulatif.
     *
     * Exécute la traversée from→to en filtrant sur les IDs de l'étape précédente.
     */
    async _fetchStep(fromEntity, toEntity, toFilters, semantic, idConstraint, engine, start) {
        const { dataset, provider } = this._ctx;
        // Résoudre le semantic inversé si nécessaire
        // Ex: lastSemantic='director_in' (people→movies) mais on va movies→people → utiliser 'director'
        const resolvedSemantic = semantic ?? null;
        let data;
        let path;
        try {
            const route = engine.getRoute(fromEntity, toEntity, resolvedSemantic ?? undefined);
            path = route.primary.path;
            if (process.env.LINKLAB_DEBUG) {
                console.log(`[_fetchStep] ${fromEntity}→${toEntity} semantic=${resolvedSemantic} idConstraint=${JSON.stringify(idConstraint?._ids?.slice(0, 3))} route=${JSON.stringify(path)}`);
            }
            if (provider) {
                // Mode SQL : générer un SQL avec sous-requête IN
                let sql = engine.generateSQL({
                    from: fromEntity,
                    to: toEntity,
                    ...(resolvedSemantic ? { semantic: resolvedSemantic } : {})
                });
                // Injecter la contrainte IN sur les IDs précédents
                if (idConstraint && idConstraint._ids.length > 0) {
                    const pk = this._getPK(fromEntity);
                    const inList = idConstraint._ids
                        .map((id) => (typeof id === 'string' ? `'${id}'` : id))
                        .join(', ');
                    // Remplacer ou ajouter le WHERE avec la contrainte IN
                    if (sql.includes('WHERE')) {
                        sql = sql.replace('WHERE', `WHERE ${fromEntity}.${pk} IN (${inList}) AND`);
                    }
                    else {
                        sql += `\nWHERE ${fromEntity}.${pk} IN (${inList})`;
                    }
                }
                // Appliquer les filtres du nœud courant
                if (Object.keys(toFilters).length > 0) {
                    const pk = this._getPK(toEntity);
                    const wheres = Object.entries(toFilters).map(([k, v]) => {
                        const col = k === 'id' ? pk : k;
                        return v === null
                            ? `${toEntity}.${col} IS NULL`
                            : `${toEntity}.${col} = ${typeof v === 'string' ? `'${v}'` : v}`;
                    });
                    if (sql.includes('WHERE')) {
                        sql += ` AND ${wheres.join(' AND ')}`;
                    }
                    else {
                        sql += `\nWHERE ${wheres.join(' AND ')}`;
                    }
                }
                data = await provider.query(sql);
            }
            else {
                // Mode in-memory : passer les IDs via filters sur l'entité source
                // executeInMemory filtre dataset[from] par filters, puis traverse vers to
                const sourceFilters = {};
                if (idConstraint && idConstraint._ids.length > 0) {
                    // Si un seul ID → filtre direct, sinon on pré-filtre le dataset
                    if (idConstraint._ids.length === 1) {
                        const pk = this._getPK(fromEntity);
                        sourceFilters[pk] = idConstraint._ids[0];
                    }
                    // Multi-IDs : on filtre le dataset manuellement
                }
                let filteredDataset = dataset;
                if (idConstraint && idConstraint._ids.length > 1) {
                    const pk = this._getPK(fromEntity);
                    filteredDataset = {
                        ...dataset,
                        [fromEntity]: (dataset[fromEntity] ?? []).filter((row) => idConstraint._ids.includes(row[pk] ?? row.id))
                    };
                }
                data = engine.executeInMemory({
                    from: fromEntity,
                    to: toEntity,
                    filters: sourceFilters,
                    ...(resolvedSemantic ? { semantic: resolvedSemantic } : {})
                }, filteredDataset);
                if (process.env.LINKLAB_DEBUG) {
                    console.log(`[_fetchStep inMemory] sourceFilters=${JSON.stringify(sourceFilters)} filteredDataset[${fromEntity}].length=${filteredDataset[fromEntity]?.length} result=${data.length}`);
                }
                if (Object.keys(toFilters).length > 0) {
                    data = data.filter((row) => matchFilters(row, toFilters));
                }
            }
        }
        catch {
            // Route inconnue — retourner vide
            data = [];
            path = [fromEntity, toEntity];
        }
        return {
            from: fromEntity,
            to: toEntity,
            filters: toFilters,
            data,
            path,
            timing: Date.now() - start
        };
    }
    /** Retourne la clé primaire d'une entité */
    _getPK(entity) {
        const node = this._ctx.graphData.nodes.find((n) => n.id === entity);
        const pk = node?.primaryKey;
        if (pk) {
            if (Array.isArray(pk))
                return pk[0];
            return pk;
        }
        // Inférer depuis les colonnes : chercher {entity}_id en priorité, puis *_id
        const columns = node?.columns ?? [];
        const entityPk = columns.find(c => c.name === `${entity}_id`);
        if (entityPk)
            return entityPk.name;
        const anyPk = columns.find(c => c.name.endsWith('_id') && !c.name.includes('_', c.name.indexOf('_') + 1));
        if (anyPk)
            return anyPk.name;
        return 'id';
    }
    async _fetchDirect(node, start) {
        const { dataset, provider } = this._ctx;
        let data;
        if (provider) {
            // Provider SQL — résoudre la vraie PK depuis le graph
            const nodeSchema = this._ctx.graphData.nodes.find((n) => n.id === node.entity);
            const pk = nodeSchema?.primaryKey ?? 'id';
            const filters = node.filters;
            const wheres = Object.entries(filters).map(([k, v]) => {
                const col = k === 'id' ? pk : k;
                if (v === null)
                    return `${node.entity}.${col} IS NULL`;
                // Mini-DSL en SQL
                if (typeof v === 'object' && !Array.isArray(v)) {
                    const op = Object.keys(v)[0];
                    const val = v[op];
                    switch (op) {
                        case 'like':
                            return `${node.entity}.${col} ILIKE '%${val}%'`;
                        case 'startsWith':
                            return `${node.entity}.${col} ILIKE '${val}%'`;
                        case 'endsWith':
                            return `${node.entity}.${col} ILIKE '%${val}'`;
                        case 'gt':
                            return `${node.entity}.${col} > ${val}`;
                        case 'gte':
                            return `${node.entity}.${col} >= ${val}`;
                        case 'lt':
                            return `${node.entity}.${col} < ${val}`;
                        case 'lte':
                            return `${node.entity}.${col} <= ${val}`;
                        case 'neq':
                            return `${node.entity}.${col} != ${typeof val === 'string' ? `'${val}'` : val}`;
                        case 'in':
                            return `${node.entity}.${col} IN (${val.map((x) => (typeof x === 'string' ? `'${x}'` : x)).join(',')})`;
                        default:
                            return `${node.entity}.${col} = ${typeof val === 'string' ? `'${val}'` : val}`;
                    }
                }
                // String : ILIKE pour matching insensible à la casse
                if (typeof v === 'string')
                    return `${node.entity}.${col} ILIKE '${v}'`;
                return `${node.entity}.${col} = ${v}`;
            });
            const sql = `SELECT DISTINCT ${node.entity}.* FROM ${node.entity}` +
                (wheres.length > 0 ? ` WHERE ${wheres.join(' AND ')}` : '');
            data = await provider.query(sql);
        }
        else {
            const table = dataset?.[node.entity] ?? [];
            data =
                Object.keys(node.filters).length > 0
                    ? table.filter(row => matchFilters(row, node.filters))
                    : table;
        }
        return {
            from: node.entity,
            to: node.entity,
            filters: node.filters,
            data,
            path: [node.entity],
            timing: Date.now() - start
        };
    }
    async _fetchViaRoute(anchor, current, trail, start) {
        const { compiled, dataset, provider } = this._ctx;
        if (!compiled || (!dataset && !provider)) {
            throw new Error(`Navigation ${anchor.entity}→${current.entity} nécessite un compiledGraph et un dataset ou provider.\n` +
                `Utilisez new Graph(source, { compiled, dataset }) ou new Graph(source, { provider }).`);
        }
        const engine = new QueryEngine(compiled);
        const filters = anchor.filters;
        // Le label sémantique est porté par le nœud anchor (ex: 'director_in')
        // ou par le nœud current (ex: 'actor' dans movies(278).actors)
        const semantic = anchor.semantic ?? current.semantic ?? null;
        let data;
        let path;
        // Décider si on utilise la route directe anchor→current ou la cascade via intermédiaires.
        //
        // On utilise la cascade uniquement si :
        //   1. Il y a des intermédiaires dans le trail
        //   2. La route directe ne passe par AUCUN des intermédiaires attendus
        //      (indique une route sémantiquement incorrecte, ex: staff→address→customer
        //       au lieu de staff→payment→rental→customer)
        //
        const intermediates = trail.slice(1, -1).map(n => n.entity);
        let useDirectRoute = true;
        if (intermediates.length > 0) {
            try {
                const route = engine.getRoute(anchor.entity, current.entity);
                const routePath = route.primary.path;
                // Si la route directe ne passe par AUCUN intermédiaire attendu,
                // c'est probablement le mauvais chemin → forcer la cascade
                const hasAnyIntermediate = intermediates.some(mid => routePath.includes(mid));
                useDirectRoute = hasAnyIntermediate || routePath.length <= 2;
            }
            catch {
                useDirectRoute = false;
            }
        }
        try {
            if (useDirectRoute) {
                // Route directe anchor→current (cas nominal)
                // Si semantic est présent, on l'utilise pour sélectionner la bonne route compilée
                path = engine.getRoute(anchor.entity, current.entity, semantic ?? undefined).primary.path;
                if (provider) {
                    const sql = engine.generateSQL({
                        from: anchor.entity,
                        to: current.entity,
                        filters,
                        ...(semantic ? { semantic } : {})
                    });
                    data = await provider.query(sql);
                }
                else {
                    data = engine.executeInMemory({
                        from: anchor.entity,
                        to: current.entity,
                        filters,
                        ...(semantic ? { semantic } : {})
                    }, dataset);
                }
            }
            else {
                // Route via étapes intermédiaires explicites du trail
                // On construit un SQL en cascadant les routes step by step
                const fullPath = [anchor.entity];
                const allEdges = [];
                for (let i = 0; i < trail.length - 1; i++) {
                    const from = trail[i].entity;
                    const to = trail[i + 1].entity;
                    try {
                        const stepRoute = engine.getRoute(from, to);
                        // Ajouter les nœuds du chemin (sans répéter le premier)
                        fullPath.push(...stepRoute.primary.path.slice(1));
                        allEdges.push(...stepRoute.primary.edges);
                    }
                    catch {
                        // Pas de route entre ces deux entités — on continue sans
                        fullPath.push(to);
                        allEdges.push({ fromCol: 'id', toCol: from + '_id' });
                    }
                }
                // Construire le SQL à partir du chemin composite
                const graphData = this._ctx.graphData;
                const pkOf = (tableId) => {
                    const node = graphData.nodes?.find((n) => n.id === tableId);
                    const pk = node?.primaryKey;
                    if (Array.isArray(pk))
                        return pk[0];
                    return pk ?? tableId + '_id';
                };
                let sql = `SELECT DISTINCT ${current.entity}.*\nFROM ${fullPath[0]}`;
                for (let i = 0; i < allEdges.length; i++) {
                    const curr = fullPath[i];
                    const next = fullPath[i + 1];
                    const fc = allEdges[i].fromCol === 'id' ? pkOf(curr) : allEdges[i].fromCol;
                    const tc = allEdges[i].toCol === 'id' ? pkOf(next) : allEdges[i].toCol;
                    sql += `\n  INNER JOIN ${next} ON ${curr}.${fc} = ${next}.${tc}`;
                }
                const sourcePK = pkOf(anchor.entity);
                const wheres = Object.entries(filters).map(([k, v]) => {
                    const col = k === 'id' ? sourcePK : k;
                    return v === null
                        ? `${anchor.entity}.${col} IS NULL`
                        : `${anchor.entity}.${col} = ${typeof v === 'string' ? `'${v}'` : v}`;
                });
                if (wheres.length > 0)
                    sql += `\nWHERE ${wheres.join(' AND ')}`;
                path = [anchor.entity, ...intermediates, current.entity];
                if (provider) {
                    data = await provider.query(sql);
                }
                else {
                    // In-memory fallback — cascade step by step
                    let rows = (dataset ?? {})[anchor.entity] ?? [];
                    if (Object.keys(filters).length > 0)
                        rows = rows.filter((r) => matchFilters(r, filters));
                    for (let i = 0; i < trail.length - 1; i++) {
                        const from = trail[i].entity;
                        const to = trail[i + 1].entity;
                        rows = engine.executeInMemory({ from, to, filters: i === 0 ? filters : {} }, dataset);
                    }
                    data = rows;
                }
            }
        }
        catch (routeErr) {
            // Route inconnue — fetch direct sur l'entité courante
            if (process.env.LINKLAB_DEBUG) {
                console.warn(`[DomainNode] Route fallback ${anchor.entity}→${current.entity}: ${routeErr?.message}`);
            }
            if (provider) {
                const wheres = Object.entries(current.filters).map(([k, v]) => v === null
                    ? `${current.entity}.${k} IS NULL`
                    : `${current.entity}.${k} = ${typeof v === 'string' ? `'${v}'` : v}`);
                const sql = `SELECT ${current.entity}.* FROM ${current.entity}` +
                    (wheres.length > 0 ? ` WHERE ${wheres.join(' AND ')}` : '');
                data = await provider.query(sql);
            }
            else {
                const table = (dataset ?? {})[current.entity] ?? [];
                data = table.filter(row => matchFilters(row, current.filters));
            }
            path = [anchor.entity, current.entity];
        }
        // Si la frame courante a ses propres filtres (ex: .movies(497))
        // on filtre les résultats supplémentaires
        if (Object.keys(current.filters).length > 0) {
            data = data.filter(row => matchFilters(row, current.filters));
        }
        return {
            from: anchor.entity,
            to: current.entity,
            filters,
            data,
            path,
            timing: Date.now() - start
        };
    }
}
// ── DomainNode callable ───────────────────────────────────────────────────────
/**
 * makeCallableDomainNode — retourne un objet à la fois Function et DomainNode.
 *
 * Permet :
 *   cinema.people        → DomainNode (propriété)
 *   cinema.people(278)   → DomainNode avec filters={id:278}  (appel)
 *   cinema.people(278).movies  → DomainNode chaîné
 *
 *   cinema.directors('Nolan') → DomainNode avec entity='people', semantic='director_in'
 *
 * La fonction elle-même retourne un nouveau DomainNode avec les filtres résolus.
 */
function makeCallableDomainNode(entity, filters, parent, ctx, semantic = null) {
    // Créer le DomainNode de base (sans appel)
    const node = new DomainNode(entity, filters, parent, ctx, semantic);
    // Envelopper dans une fonction pour permettre l'appel (people(278))
    const callable = function (...args) {
        if (args.length === 0)
            return node;
        // Résolution des filtres depuis les arguments
        // Pour les labels sémantiques, l'entity cible est 'people' — on utilise sa semantic_key
        const resolved = resolveFilters(args[0], entity, ctx.graphData);
        return new DomainNode(entity, resolved, parent, ctx, semantic);
    };
    // Copier les propriétés du Proxy DomainNode sur la fonction
    return new Proxy(callable, {
        get(_target, prop) {
            return node[prop];
        },
        apply(_target, _thisArg, args) {
            return callable(...args);
        }
    });
}
// ── Helpers ───────────────────────────────────────────────────────────────────
/**
 * Résout les arguments d'un appel en filtres.
 *
 *   people(278)              → { id: 278 }
 *   people('Nolan')          → { name: 'Nolan' }  (via semantic_key)
 *   people({ name: 'Nolan'}) → { name: 'Nolan' }
 */
function resolveFilters(arg, entity, graphData) {
    // Objet → filtre direct
    if (arg !== null && typeof arg === 'object' && !Array.isArray(arg)) {
        return arg;
    }
    // Number → id
    if (typeof arg === 'number') {
        return { id: arg };
    }
    // String → id si les PKs sont des strings, sinon semantic_key
    if (typeof arg === 'string') {
        // Chercher un node dont l'ID correspond (musicians: 'artist-will-smith')
        const nodes = resolveNodes(entity, graphData);
        const byId = nodes.find(n => n.id === arg);
        if (byId)
            return { id: arg };
        // Sinon semantic_key : 'name' pour people, 'title' pour movies, etc.
        const semanticKey = inferSemanticKey(entity, graphData);
        return { [semanticKey]: arg };
    }
    return {};
}
/**
 * Infère la clé sémantique par défaut d'une entité.
 * Priorité : 'name' > 'title' > 'label' > premier champ string non-id.
 */
function inferSemanticKey(entity, graphData) {
    const node = graphData.nodes.find(n => n.id === entity);
    if (!node)
        return 'name';
    const columns = node.columns?.map((c) => (typeof c === 'string' ? c : c.name)) ?? [];
    // Priorité : clés sémantiques connues
    for (const key of ['name', 'title', 'label', 'first_name', 'last_name', 'username', 'email']) {
        if (columns.includes(key))
            return key;
    }
    // Premier champ non-id (filtre _id, Id, _key)
    const nonId = columns.find(c => c !== 'id' && !c.endsWith('Id') && !c.endsWith('_id') && !c.endsWith('_key'));
    return nonId ?? 'name';
}
/**
 * matchFilters — filtre une row selon un objet de critères.
 * Supporte null (IS NULL en SQL).
 */
function matchFilters(row, filters) {
    return Object.entries(filters).every(([key, value]) => {
        if (value === null)
            return row[key] == null;
        // Mini-DSL : { name: { like: 'Nolan' } } | { year: { gte: 2000 } } | { id: { in: [1,2] } }
        if (typeof value === 'object' && !Array.isArray(value)) {
            const op = Object.keys(value)[0];
            const val = value[op];
            switch (op) {
                case 'like':
                    return (typeof row[key] === 'string' &&
                        row[key].toLowerCase().includes(String(val).toLowerCase()));
                case 'startsWith':
                    return (typeof row[key] === 'string' &&
                        row[key].toLowerCase().startsWith(String(val).toLowerCase()));
                case 'endsWith':
                    return (typeof row[key] === 'string' &&
                        row[key].toLowerCase().endsWith(String(val).toLowerCase()));
                case 'gt':
                    return row[key] > val;
                case 'gte':
                    return row[key] >= val;
                case 'lt':
                    return row[key] < val;
                case 'lte':
                    return row[key] <= val;
                case 'in':
                    return Array.isArray(val) && val.includes(row[key]);
                case 'neq':
                    return row[key] !== val;
                default:
                    return row[key] === val;
            }
        }
        // Match exact
        return row[key] === value;
    });
}
/**
 * buildCTEStep — construit un CTE pour une étape du Trail.
 *
 * Route film→film_actor→actor :
 *   path  = [film, film_actor, actor]
 *   edges = [{fromCol:'film_id', toCol:'id'}, {fromCol:'actor_id', toCol:'id'}]
 *   prevStep = step0 (= film)
 *
 * Résultat :
 *   step1 AS (
 *     SELECT DISTINCT actor.*
 *     FROM actor
 *     INNER JOIN film_actor ON film_actor.actor_id = actor.id
 *     INNER JOIN step0      ON step0.film_id = film_actor.id
 *   )
 *
 * Stratégie : FROM toEntity, JOINs en ordre inverse du path.
 * Le CTE précédent remplace path[0] dans le dernier JOIN.
 */
function buildCTEStep(stepIdx, toEntity, primary, prevStep, prevEntity, toFilters, pkOf, buildWhere) {
    const { path, edges } = primary;
    // path = [from, ...intermediates, to]
    // edges[i] : path[i] → path[i+1]
    const joins = [];
    // Parcourir les edges en ordre inverse : from toEntity vers fromEntity
    for (let i = edges.length - 1; i >= 0; i--) {
        const curr = path[i]; // table "gauche" de l'edge
        const next = path[i + 1]; // table "droite" de l'edge
        const edge = edges[i];
        const fromCol = edge.fromCol === 'id' ? pkOf(curr) : edge.fromCol;
        const toCol = edge.toCol === 'id' ? pkOf(next) : edge.toCol;
        const conditionSQL = edge.condition
            ? ' AND ' +
                Object.entries(edge.condition)
                    .map(([k, v]) => `${curr}.${k} = ${typeof v === 'string' ? `'${v}'` : v}`)
                    .join(' AND ')
            : '';
        if (i === 0) {
            // Dernier JOIN (premier edge) : remplacer curr par prevStep
            // edge : curr.fromCol = next.toCol
            // En partant de next (déjà dans le FROM ou jointé), on joint avec prevStep
            joins.push(`INNER JOIN ${prevStep} ON ${prevStep}.${fromCol} = ${next}.${toCol}${conditionSQL}`);
        }
        else {
            // Edge intermédiaire : curr rejoint next
            // On est en ordre inverse — curr n'est pas encore dans le FROM
            // On joint curr depuis next (qui est déjà présent)
            joins.push(`INNER JOIN ${curr} ON ${curr}.${fromCol} = ${next}.${toCol}${conditionSQL}`);
        }
    }
    const where = buildWhere(toEntity, toFilters);
    return (`step${stepIdx} AS (\n` +
        `  SELECT DISTINCT ${toEntity}.*\n` +
        `  FROM ${toEntity}\n` +
        `  ${joins.join('\n  ')}` +
        (where ? `\n  WHERE ${where}` : '') +
        `\n)`);
}
// ── Export helper pour Graph.ts ───────────────────────────────────────────────
/**
 * createDomain — retourne le proxy sémantique (niveau 1).
 *
 * Le proxy expose :
 *   - Les entités du graphe comme propriétés navigables (cinema.movies, dvd.film...)
 *   - `.graph` — accès au Graph sous-jacent pour les niveaux 2/3/4
 *
 * C'est l'objet retourné par loadGraph() — point d'entrée principal de LinkLab.
 */
export function createDomain(ctx, graphInstance) {
    return new Proxy({}, {
        get(_target, prop) {
            // Accès au Graph sous-jacent — niveaux 2/3/4
            if (prop === 'graph')
                return graphInstance ?? null;
            // Mode nav — sous-proxy avec navMode=true (comportement original stateless)
            if (prop === 'nav') {
                return createDomain({ ...ctx, navMode: true }, graphInstance);
            }
            if (typeof prop === 'symbol')
                return undefined;
            // Passer compiled pour permettre la résolution des labels sémantiques (cas 4)
            const resolved = resolveEntity(prop, ctx.graphData, ctx.compiled);
            if (resolved === null)
                return undefined;
            return makeCallableDomainNode(resolved.entity, {}, null, ctx, resolved.semantic);
        }
    });
}
//# sourceMappingURL=DomainNode.js.map
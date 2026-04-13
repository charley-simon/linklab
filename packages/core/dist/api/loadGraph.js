/**
 * loadGraph.ts — Factory universelle pour charger un graphe LinkLab
 *
 * Point d'entrée recommandé pour 80% des cas.
 * Déduit le mode de chargement depuis le paramètre source et l'environnement.
 *
 * Usage :
 *   // Node — fichier local
 *   const cinema = await loadGraph('./cinema.json', { provider })
 *
 *   // Browser ou Node — URL HTTP
 *   const cinema = await loadGraph('https://cdn.example.com/cinema.json', { provider })
 *
 *   // Données déjà en mémoire (tests, browser, injection)
 *   const cinema = await loadGraph({ compiled }, { provider })
 *
 * Convention fichiers (Node) :
 *   cinema.json            ← graphe compilé  (requis)
 *   cinema.reference.json  ← graphe brut     (optionnel — chargé automatiquement)
 *   cinema.override.json   ← surcharges dev  (optionnel — chargé automatiquement)
 *
 * new Graph() reste disponible pour les niveaux 2/3 et les tests unitaires.
 */
import { Graph } from './Graph.js';
// ── Détection environnement ────────────────────────────────────────────────────
const IS_NODE = typeof process !== 'undefined' && !!process.versions?.node;
const IS_BROWSER = typeof globalThis.window !== 'undefined';
// ── Chargement JSON ────────────────────────────────────────────────────────────
async function loadJSON(source) {
    // URL HTTP/HTTPS → fetch (universel)
    if (source.startsWith('http://') || source.startsWith('https://')) {
        const res = await fetch(source);
        if (!res.ok)
            throw new Error(`loadGraph: HTTP ${res.status} — ${source}`);
        return res.json();
    }
    // Chemin fichier → Node uniquement
    if (IS_NODE) {
        const { createRequire } = await import('module');
        const { fileURLToPath } = await import('url');
        const pathModule = await import('path');
        const fsModule = await import('fs');
        // Résoudre le chemin depuis cwd
        const resolved = pathModule.default.resolve(source);
        if (!fsModule.default.existsSync(resolved))
            return null;
        // createRequire depuis cwd pour les JSON
        const req = createRequire(pathModule.default.join(process.cwd(), 'noop.js'));
        return req(resolved);
    }
    throw new Error(`loadGraph: chemin fichier non supporté dans ce contexte — utiliser une URL HTTP`);
}
/** Derive les chemins convention depuis un chemin de base */
function deriveConventionPaths(basePath) {
    // './cinema.json' → base = './cinema'
    // './cinema'      → base = './cinema'
    const base = basePath.replace(/\.json$/i, '');
    return {
        compiled: `${base}.json`,
        reference: `${base}.reference.gen.json`,
        overrides: `${base}.override.json`,
        dictionary: `${base}.dictionary.gen.json`,
    };
}
// ── Factory principale ────────────────────────────────────────────────────────
/**
 * loadGraph — charge un graphe LinkLab depuis n'importe quelle source.
 *
 * Retourne directement le proxy sémantique (niveau 1) — prêt à naviguer.
 * Pour accéder au Graph sous-jacent (niveaux 2/3/4) : domain.graph
 *
 * @example
 *   const cinema = await loadGraph('./cinema.json', { provider })
 *   await cinema.directors('Nolan').movies
 *   cinema.graph.from('movies').to('people').path()  // niveau 2
 */
export async function loadGraph(source, options = {}) {
    let compiled;
    let reference = null;
    let overrides = null;
    let dictionary = null;
    // ── Source objet en mémoire ────────────────────────────────────────────────
    if (typeof source === 'object') {
        compiled = source.compiled;
        reference = source.reference ?? null;
        overrides = source.overrides ?? null;
    }
    // ── Source string (chemin ou URL) ─────────────────────────────────────────
    else {
        const isURL = source.startsWith('http://') || source.startsWith('https://');
        if (isURL) {
            // URL directe — pas de convention (on ne peut pas deviner les URLs sœurs)
            compiled = await loadJSON(source);
            if (!compiled)
                throw new Error(`loadGraph: impossible de charger ${source}`);
        }
        else {
            // Chemin fichier — convention {name}.json + {name}.reference.json + {name}.override.json
            const paths = deriveConventionPaths(source);
            compiled = await loadJSON(options.reference ? source : paths.compiled);
            if (!compiled)
                throw new Error(`loadGraph: graphe introuvable — ${paths.compiled}`);
            // Référence (optionnel — chargé silencieusement)
            const refPath = options.reference ?? paths.reference;
            reference = await loadJSON(refPath); // null si absent
            // Overrides (optionnel — chargé silencieusement)
            const ovPath = options.overrides ?? paths.overrides;
            overrides = await loadJSON(ovPath); // null si absent
            // Dictionnaire résolu (optionnel — labels humains des routes)
            dictionary = await loadJSON(paths.dictionary); // null si absent
        }
    }
    // ── Charger dataset depuis dataDir ────────────────────────────────────────
    let dataset = options.dataset ?? null;
    if (!dataset && options.dataDir && IS_NODE) {
        const pathModule = await import('path');
        const fsModule = await import('fs');
        const { createRequire } = await import('module');
        const req = createRequire(pathModule.default.join(process.cwd(), 'noop.js'));
        const dataDirAbs = pathModule.default.resolve(options.dataDir);
        dataset = {};
        for (const node of compiled.nodes) {
            const file = pathModule.default.join(dataDirAbs, `${node.id}.json`);
            if (fsModule.default.existsSync(file))
                dataset[node.id] = req(file);
        }
    }
    // ── Appliquer les overrides sur le compilé ─────────────────────────────────
    // TODO : deepMerge(compiled, overrides) quand ADR-0008 sera implémenté
    if (overrides && IS_NODE && process.env.LINKLAB_DEBUG) {
        console.warn('[loadGraph] overrides chargés mais pas encore appliqués (ADR-0008 pending)');
    }
    // ── Construire le Graph (niveau bas) ──────────────────────────────────────
    const rawGraph = reference ?? {
        nodes: compiled.nodes,
        edges: [],
    };
    const { compiled: _c, reference: _r, overrides: _o, dataDir: _d, dataset: _ds, ...graphOptions } = options;
    const graph = new Graph(rawGraph, {
        ...graphOptions,
        compiled,
        ...(dataset ? { dataset } : {}),
        ...(dictionary ? { dictionary } : {}),
    });
    // ── Retourner le domain directement ───────────────────────────────────────
    // loadGraph() retourne le proxy sémantique (niveau 1) — pas le Graph brut.
    // Accès au Graph sous-jacent via : const g = domain.graph
    return graph.domain();
}
// ── Export de commodité ────────────────────────────────────────────────────────
/** Alias — même API, nom plus court pour les imports fréquents */
export { loadGraph as graph };
//# sourceMappingURL=loadGraph.js.map
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
import type { GraphOptions } from './Graph.js';
import type { Graph as GraphData, CompiledGraph } from '../types/index.js';
/** Source du graphe compilé */
export type GraphSource = string | GraphSourceObject;
export interface GraphSourceObject {
    compiled: CompiledGraph;
    reference?: GraphData;
    overrides?: Record<string, any>;
}
/** Options de loadGraph — étend GraphOptions */
export interface LoadGraphOptions extends Omit<GraphOptions, 'compiled'> {
    /** Surcharge le chemin du graphe de référence (optionnel) */
    reference?: string;
    /** Surcharge le chemin des overrides (optionnel) */
    overrides?: string;
    /** Dossier contenant les fichiers JSON de données {entity}.json (mode local) */
    dataDir?: string;
}
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
export declare function loadGraph(source: GraphSource, options?: LoadGraphOptions): Promise<ReturnType<Graph['domain']>>;
/** Alias — même API, nom plus court pour les imports fréquents */
export { loadGraph as graph };
//# sourceMappingURL=loadGraph.d.ts.map
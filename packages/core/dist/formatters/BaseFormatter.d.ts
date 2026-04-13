/**
 * BaseFormatter - Interface pour les formatters de sortie
 *
 * Chaque scénario peut avoir son propre formatter.
 * Le formatter transforme un résultat brut du NavigationEngine
 * en sortie lisible par un humain.
 */
import type { NavigationPath, EngineStepResult } from '../types/index.js';
export interface PathFormatter {
    /** Formate un chemin pour l'affichage humain */
    format(path: NavigationPath): string;
    /** Formate un step complet de résultat */
    formatResult(result: EngineStepResult): string;
}
//# sourceMappingURL=BaseFormatter.d.ts.map
/**
 * config.ts — Chargement de {alias}.linklab.ts
 *
 * Résolution de l'alias :
 *   1. --alias <name> (CLI)
 *   2. Argument positionnel : linklab build cinema
 *   3. Auto-detect : glob *.linklab.ts dans le cwd (si unique)
 *   4. Fallback legacy : linklab.config.ts
 *
 * Fichier de config : {alias}.linklab.ts
 * Répertoire de sortie : ./linklab/{alias}/
 */
import type { LinklabConfig } from './types.js';
export { defineConfig } from './types.js';
/**
 * Résout l'alias depuis le cwd.
 * Auto-detect si un seul *.linklab.ts est présent.
 */
export declare function resolveAlias(cwd: string, alias?: string): string | null;
export declare function loadConfig(cwd: string, alias?: string, configPath?: string): Promise<{
    config: LinklabConfig;
    alias: string;
    outDir: string;
}>;
export declare function validateConfig(config: LinklabConfig): string[];
//# sourceMappingURL=config.d.ts.map
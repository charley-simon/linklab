/**
 * build.ts — linklab build <alias>
 *
 * Pipeline complet : extract → analyze → assemble → train → compile
 * Les fichiers générés sont nommés {alias}.*.json dans linklab/{alias}/
 *
 * Usage :
 *   linklab build cinema
 *   linklab build dvdrental --dry-run
 *   linklab build            ← auto-detect si un seul *.linklab.ts
 */
import type { BuildOptions } from '../types.js';
export declare function build(options?: BuildOptions): Promise<void>;
//# sourceMappingURL=build.d.ts.map
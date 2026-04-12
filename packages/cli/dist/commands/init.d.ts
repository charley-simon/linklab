/**
 * init.ts — linklab init <alias>
 *
 * Crée {alias}.linklab.ts + linklab/{alias}/ structure.
 * Ne jamais écraser — afficher ce qui existe déjà.
 *
 * Usage :
 *   linklab init cinema
 *   linklab init dvdrental --source postgres://localhost/dvdrental
 */
import type { InitOptions } from '../types.js';
export declare function init(options?: InitOptions): Promise<void>;
//# sourceMappingURL=init.d.ts.map
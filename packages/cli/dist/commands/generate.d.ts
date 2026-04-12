/**
 * generate.ts — linklab generate <alias>
 *
 * Génère use-cases.gen.json depuis le graphe compilé.
 * Exhaustif : physiques + sémantiques + composées (people→people).
 *
 * Usage :
 *   linklab generate cinema
 *   linklab generate dvdrental
 */
export interface GeneratedUseCase {
    id: string;
    from: string;
    to: string;
    semantic?: string;
    via?: string[];
    description: string;
    path: string[];
    weight: number;
    type: 'physical' | 'semantic' | 'composed';
}
export declare function generate(options?: {
    alias?: string;
}): Promise<void>;
//# sourceMappingURL=generate.d.ts.map
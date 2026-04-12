/**
 * test.ts — linklab test <alias>
 *
 * Teste chaque use case du graphe contre les données réelles.
 * Lit use-cases.gen.json (+ use-cases.json override si présent).
 * Produit use-cases.test.gen.json avec les résultats.
 *
 * Usage :
 *   linklab test cinema
 *   linklab test dvdrental
 *   linklab test cinema --fail-fast   ← stoppe au premier échec
 *   linklab test cinema --filter physical  ← physiques uniquement
 */
export interface TestResult {
    id: string;
    from: string;
    to: string;
    type: string;
    semantic?: string;
    description: string;
    path: string[];
    status: 'ok' | 'empty' | 'error';
    resultCount: number;
    durationMs: number;
    error?: string;
}
export interface TestReport {
    alias: string;
    testedAt: string;
    total: number;
    ok: number;
    empty: number;
    errors: number;
    durationMs: number;
    results: TestResult[];
}
export declare function test(options?: {
    alias?: string;
    failFast?: boolean;
    filter?: 'physical' | 'semantic' | 'composed';
}): Promise<void>;
//# sourceMappingURL=test.d.ts.map
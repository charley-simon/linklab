/**
 * train.ts — linklab train <alias>
 *
 * Calibre les poids du graphe depuis les résultats de test.
 * Élimine les routes sans données (vides) en leur assignant un poids disqualifiant.
 * Recompile uniquement les étapes ⑤⑥ (train + compile).
 *
 * Usage :
 *   linklab train cinema
 *   linklab train dvdrental
 */
export declare function train(options?: {
    alias?: string;
}): Promise<void>;
//# sourceMappingURL=train.d.ts.map
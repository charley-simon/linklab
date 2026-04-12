/**
 * stress.ts — linklab stress <alias>
 *
 * Test de performance et de charge sur les routes compilées.
 *
 * Modes :
 *   linklab stress cinema                     → séquentiel (1 passe)
 *   linklab stress cinema --runs 10           → séquentiel N passes
 *   linklab stress cinema --load              → charge (p95, p99, seuils)
 *   linklab stress cinema --concurrent --vu 5 --think 1000  → VU avec think time
 *   linklab stress cinema --watch             → boucle infinie (Esc/Ctrl+C)
 *
 * Métriques :
 *   - Temps par route : avg, p50, p95, p99, min, max
 *   - Mémoire : heap used par passe, détection de fuite
 *   - Throughput : routes/sec
 */
export declare function stress(options?: {
    alias?: string;
    runs?: number;
    load?: boolean;
    concurrent?: boolean;
    vu?: number;
    think?: number;
    watch?: boolean;
    slowMs?: number;
    criticalMs?: number;
}): Promise<void>;
//# sourceMappingURL=stress.d.ts.map
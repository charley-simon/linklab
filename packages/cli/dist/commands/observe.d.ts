/**
 * observe.ts — linklab observe <alias> [--record] [--replay <sessionId>]
 *
 * Lance le TUI d'observabilité LinkLab.
 * Se connecte au traceBus et commandBus pour afficher les spans en temps réel.
 *
 * Usage :
 *   linklab observe cinema
 *   linklab observe cinema --record
 *   linklab observe cinema --replay session-abc123
 */
export declare function observe(options?: {
    alias?: string;
    record?: boolean;
    replay?: string;
    duckdb?: boolean;
}): Promise<void>;
//# sourceMappingURL=observe.d.ts.map
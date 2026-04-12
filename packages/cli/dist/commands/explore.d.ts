/**
 * explore.ts — linklab explore
 *
 * Wrapper autour du TUI générique (src/examples/tui/tui.tsx).
 * Lance le TUI avec le compiled-graph du projet courant.
 *
 * Usage :
 *   linklab explore
 *   linklab explore --roots movies,people
 *   linklab explore --label "Netflix Explorer"
 *   linklab explore --compiled path/to/compiled-graph.json
 *   linklab explore --pg database=dvdrental host=localhost
 */
export interface ExploreOptions {
    compiled?: string;
    roots?: string;
    label?: string;
    data?: string;
    pg?: string;
    mock?: boolean;
}
export declare function explore(options?: ExploreOptions): Promise<void>;
//# sourceMappingURL=explore.d.ts.map
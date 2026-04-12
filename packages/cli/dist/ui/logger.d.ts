/**
 * logger.ts — Output coloré + progress pour @linklab/cli
 */
import type { Warning } from '../types.js';
export declare function header(version: string, scenario: string): void;
export declare function step(index: number, name: string, summary: string, durationMs: number): void;
export declare function success(outputPath: string, version: string, alias?: string): void;
export declare function initCreated(path: string): void;
export declare function initSkipped(path: string): void;
export declare function initDone(alias?: string): void;
export declare function warnings(list: Warning[]): void;
export declare function error(msg: string, detail?: string): void;
//# sourceMappingURL=logger.d.ts.map
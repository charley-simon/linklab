/**
 * logger.ts — Output coloré + progress pour @linklab/cli
 */
import chalk from 'chalk';
// ── Couleurs ──────────────────────────────────────────────────────────────────
const C = {
    step: chalk.cyan,
    ok: chalk.green,
    warn: chalk.yellow,
    error: chalk.red,
    dim: chalk.gray,
    accent: chalk.bold.white,
    version: chalk.magenta
};
// ── Header ────────────────────────────────────────────────────────────────────
export function header(version, scenario) {
    console.log();
    console.log(`  ${C.accent('linklab')} ${C.version(`v${version}`)}  ·  ${C.dim(scenario)}`);
    console.log();
}
// ── Step progress ─────────────────────────────────────────────────────────────
const STEP_ICONS = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧'];
export function step(index, name, summary, durationMs) {
    const icon = STEP_ICONS[index] ?? `${index + 1}.`;
    const bar = C.step('████████████');
    const nameStr = name.padEnd(12);
    const sumStr = C.dim(summary.padEnd(50));
    const durStr = C.dim(`${durationMs}ms`);
    console.log(`  ${icon} ${nameStr} ${bar}  ${sumStr} ${durStr}`);
}
// ── Success ───────────────────────────────────────────────────────────────────
export function success(outputPath, version, alias) {
    console.log();
    console.log(`  ${C.ok('✔')}  ${C.dim(outputPath)}  ${C.version(version)}`);
    const replCmd = alias ? `linklab repl ${alias}` : 'linklab repl';
    console.log(`     ${C.dim(`Run "${replCmd}" to navigate your graph`)}`);
    console.log();
}
// ── Init success ──────────────────────────────────────────────────────────────
export function initCreated(path) {
    console.log(`  ${C.ok('✔')}  ${path}`);
}
export function initSkipped(path) {
    console.log(`  ${C.warn('⚠')}  ${C.dim(path + ' — already exists, skipped')}`);
}
export function initDone(alias) {
    console.log();
    const aliasStr = alias ? `${alias}` : 'your-alias';
    console.log(`  ${C.dim('→ Edit')} ${C.accent(`${aliasStr}.linklab.ts`)} ${C.dim('then run')} ${C.accent(`"linklab build ${aliasStr}"`)}`);
    console.log();
}
// ── Warnings ──────────────────────────────────────────────────────────────────
export function warnings(list) {
    if (!list.length)
        return;
    console.log();
    console.log(`  ${C.warn('⚠')}  ${list.length} warning${list.length > 1 ? 's' : ''} :`);
    console.log();
    for (const w of list) {
        console.log(`     ${C.warn(w.message)}`);
        if (w.hint)
            console.log(`     ${C.dim('Fix : ' + w.hint)}`);
        console.log();
    }
}
// ── Error ─────────────────────────────────────────────────────────────────────
export function error(msg, detail) {
    console.log();
    console.log(`  ${C.error('✖')}  ${msg}`);
    if (detail)
        console.log(`     ${C.dim(detail)}`);
    console.log();
}
//# sourceMappingURL=logger.js.map
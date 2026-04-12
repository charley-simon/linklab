/**
 * refresh.ts — linklab refresh [alias]
 *
 * Macro : build + generate + test + train en séquence (mode quiet).
 */
import * as path from 'path';
import chalk from 'chalk';
import { resolveAlias } from '../config.js';
import { build } from './build.js';
import { generate } from './generate.js';
import { test } from './test.js';
import { train } from './train.js';
// Supprime console.log/warn pendant l'exécution d'une fn, restaure après
// Intercepte aussi process.exit pour éviter que test() tue le process sur errors > 0
async function quiet(fn) {
    const ol = console.log, ow = console.warn;
    const origExit = process.exit.bind(process);
    let exitCode;
    console.log = () => { };
    console.warn = () => { };
    process.exit = (code) => {
        exitCode = code ?? 0;
    };
    try {
        const result = await fn();
        // Si exit(0) ou exit() → OK. Si exit(1+) → on note mais on ne tue pas
        if (exitCode !== undefined && exitCode !== 0) {
            throw new Error(`exit(${exitCode})`);
        }
        return result;
    }
    finally {
        console.log = ol;
        console.warn = ow;
        process.exit = origExit;
    }
}
function duration(ms) {
    return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}
export async function refresh(options = {}) {
    const cwd = process.cwd();
    let alias;
    try {
        const resolved = resolveAlias(cwd, options.alias);
        if (!resolved) {
            console.error(`\n  ✖  Alias requis : linklab refresh <alias>\n`);
            process.exit(1);
        }
        alias = resolved;
    }
    catch (e) {
        console.error(`\n  ✖  ${e.message}\n`);
        process.exit(1);
    }
    const t0 = Date.now();
    console.log();
    console.log(`  ${chalk.bold.white('linklab refresh')}  ·  ${chalk.cyan(alias)}`);
    console.log();
    // ── ① Build ──────────────────────────────────────────────────────────────────
    const t1 = Date.now();
    process.stdout.write(`  ${chalk.dim('①')} build         `);
    try {
        await quiet(() => build({ alias }));
        console.log(chalk.green('✔') + chalk.dim(`  ${duration(Date.now() - t1)}`));
    }
    catch (e) {
        console.log(chalk.red('✖'));
        console.error(`\n  ${chalk.red('✖')}  build échoué : ${e.message}\n`);
        process.exit(1);
    }
    // ── ② Generate ───────────────────────────────────────────────────────────────
    const t2 = Date.now();
    process.stdout.write(`  ${chalk.dim('②')} generate      `);
    try {
        await quiet(() => generate({ alias }));
        console.log(chalk.green('✔') + chalk.dim(`  ${duration(Date.now() - t2)}`));
    }
    catch (e) {
        console.log(chalk.red('✖'));
        console.error(`\n  ${chalk.red('✖')}  generate échoué : ${e.message}\n`);
        process.exit(1);
    }
    // ── ③ Test ───────────────────────────────────────────────────────────────────
    const t3 = Date.now();
    console.log(`  ${chalk.dim('③')} test          ${chalk.dim('(en cours...)')}`);
    let testHasErrors = false;
    try {
        await quiet(() => test({ alias }));
    }
    catch (e) {
        // exit(1) de test = des erreurs dans les use cases → pas fatal pour refresh
        const msg = e.message;
        if (msg.startsWith('exit(')) {
            testHasErrors = true;
        }
        else {
            process.stdout.write('\x1B[1A\x1B[2K');
            console.log(`  ${chalk.dim('③')} test          ` + chalk.red('✖'));
            console.error(`\n  ${chalk.red('✖')}  test échoué : ${msg}\n`);
            process.exit(1);
        }
    }
    const elapsed3 = duration(Date.now() - t3);
    try {
        const { createRequire } = await import('module');
        const req = createRequire(import.meta.url);
        const outDir = path.resolve(cwd, `linklab/${alias}`);
        const report = req(path.join(outDir, `${alias}.test.gen.json`));
        const pct = Math.round((report.ok / report.total) * 100);
        const icon = testHasErrors ? chalk.yellow('⚠') : chalk.green('✔');
        const errStr = testHasErrors ? chalk.dim(`  ${report.errors} err`) : '';
        process.stdout.write('\x1B[1A\x1B[2K');
        console.log(`  ${chalk.dim('③')} test          ` +
            icon +
            chalk.dim(`  ${elapsed3}  —  ${report.ok}/${report.total} OK (${pct}%)`) +
            errStr);
    }
    catch {
        process.stdout.write('\x1B[1A\x1B[2K');
        console.log(`  ${chalk.dim('③')} test          ` + chalk.green('✔') + chalk.dim(`  ${elapsed3}`));
    }
    // ── ④ Train ──────────────────────────────────────────────────────────────────
    const t4 = Date.now();
    process.stdout.write(`  ${chalk.dim('④')} train         `);
    try {
        await quiet(() => train({ alias }));
        console.log(chalk.green('✔') + chalk.dim(`  ${duration(Date.now() - t4)}`));
    }
    catch (e) {
        console.log(chalk.red('✖'));
        console.error(`\n  ${chalk.red('✖')}  train échoué : ${e.message}\n`);
        process.exit(1);
    }
    // ── Résumé ────────────────────────────────────────────────────────────────────
    const total = duration(Date.now() - t0);
    try {
        const { createRequire } = await import('module');
        const req = createRequire(import.meta.url);
        const outDir = path.resolve(cwd, `linklab/${alias}`);
        const compiled = req(path.join(outDir, `${alias}.json`));
        const routes = compiled.routes ?? [];
        const physical = routes.filter((r) => !r.semantic).length;
        const semantic = routes.filter((r) => r.semantic && !r.composed).length;
        const composed = routes.filter((r) => r.composed).length;
        console.log();
        console.log(`  ${chalk.green('✔')}  ${routes.length} routes` +
            chalk.dim(` (${physical} physical · ${semantic} semantic · ${composed} composed)`) +
            chalk.dim(`  —  ${total}`));
    }
    catch {
        console.log();
        console.log(`  ${chalk.green('✔')}  refresh terminé en ${chalk.bold(total)}`);
    }
    console.log(`     Run "linklab repl ${alias}" to navigate your graph`);
    console.log();
}
//# sourceMappingURL=refresh.js.map
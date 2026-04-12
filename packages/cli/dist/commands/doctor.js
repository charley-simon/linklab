/**
 * doctor.ts — linklab doctor [alias]
 *
 * Diagnostic complet du projet LinkLab.
 * Vérifie : config, source, fichiers générés, drift.
 *
 * Usage :
 *   linklab doctor          ← tous les alias
 *   linklab doctor cinema   ← un seul alias
 */
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { loadConfig, validateConfig } from '../config.js';
// ── Helpers ───────────────────────────────────────────────────────────────────
function icon(status) {
    switch (status) {
        case 'ok':
            return chalk.green('✔');
        case 'warn':
            return chalk.yellow('⚠');
        case 'error':
            return chalk.red('✖');
        case 'skip':
            return chalk.dim('·');
    }
}
function printCheck(check, indent = '  ') {
    const ic = icon(check.status);
    const lbl = check.status === 'error'
        ? chalk.red(check.label)
        : check.status === 'warn'
            ? chalk.yellow(check.label)
            : check.label;
    const det = check.detail ? chalk.dim(`  ${check.detail}`) : '';
    console.log(`${indent}${ic}  ${lbl}${det}`);
    if (check.fix && (check.status === 'error' || check.status === 'warn')) {
        console.log(`${indent}   ${chalk.dim('→')} ${chalk.dim(check.fix)}`);
    }
}
// ── Checks ────────────────────────────────────────────────────────────────────
async function runDoctor(cwd, alias) {
    let errors = 0, warnings = 0;
    console.log();
    console.log(`  ${chalk.bold.white('linklab doctor')}  ·  ${chalk.cyan(alias)}`);
    console.log();
    // ── Config ──────────────────────────────────────────────────────────────────
    console.log(`  ${chalk.dim('Config')}`);
    let config = null;
    let outDir = path.resolve(cwd, `linklab/${alias}`);
    const configPath = path.join(cwd, `${alias}.linklab.ts`);
    if (!fs.existsSync(configPath)) {
        printCheck({
            label: `${alias}.linklab.ts`,
            status: 'error',
            detail: 'introuvable',
            fix: `linklab init ${alias}`
        });
        errors++;
    }
    else {
        printCheck({ label: `${alias}.linklab.ts`, status: 'ok' });
        try {
            ;
            ({ config, outDir } = await loadConfig(cwd, alias));
            const errs = validateConfig(config);
            if (errs.length > 0) {
                for (const e of errs) {
                    printCheck({ label: 'config invalide', status: 'error', detail: e });
                    errors++;
                }
            }
            else {
                printCheck({
                    label: 'config valide',
                    status: 'ok',
                    detail: `source.type=${config.source?.type}`
                });
            }
        }
        catch (e) {
            printCheck({ label: 'config illisible', status: 'error', detail: e.message });
            errors++;
        }
    }
    console.log();
    // ── Source ───────────────────────────────────────────────────────────────────
    console.log(`  ${chalk.dim('Source')}`);
    if (config?.source?.type === 'json') {
        const dataDir = path.resolve(cwd, config.source.dataDir ?? './data');
        if (!fs.existsSync(dataDir)) {
            printCheck({
                label: 'dataDir',
                status: 'error',
                detail: `${dataDir} introuvable`,
                fix: `Crée le dossier et ajoute des fichiers JSON`
            });
            errors++;
        }
        else {
            const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));
            if (files.length === 0) {
                printCheck({
                    label: 'dataDir',
                    status: 'warn',
                    detail: 'aucun fichier JSON trouvé',
                    fix: `Ajoute des fichiers {entity}.json dans ${dataDir}`
                });
                warnings++;
            }
            else {
                printCheck({ label: 'dataDir', status: 'ok', detail: `${files.length} fichiers JSON` });
            }
        }
    }
    else if (config?.source?.type === 'postgres') {
        // Test de connexion
        const ol = console.log, ow = console.warn;
        console.log = () => { };
        console.warn = () => { };
        try {
            const { PostgresProvider } = await import('@linklab/core');
            const provider = new PostgresProvider({
                host: config.source.host ?? process.env.PGHOST ?? 'localhost',
                port: parseInt(config.source.port ?? process.env.PGPORT ?? '5432'),
                database: config.source.database ?? process.env.PGDATABASE ?? '',
                user: config.source.user ?? process.env.PGUSER ?? 'postgres',
                password: config.source.password ?? process.env.PGPASSWORD ?? ''
            });
            await provider.query('SELECT 1');
            await provider.close?.();
            console.log = ol;
            console.warn = ow;
            printCheck({
                label: 'postgres',
                status: 'ok',
                detail: `${config.source.database ?? process.env.PGDATABASE}@${config.source.host ?? 'localhost'}`
            });
        }
        catch (e) {
            console.log = ol;
            console.warn = ow;
            printCheck({
                label: 'postgres',
                status: 'error',
                detail: e.message,
                fix: `Vérifie PGHOST, PGDATABASE, PGUSER, PGPASSWORD`
            });
            errors++;
        }
    }
    else if (!config) {
        printCheck({ label: 'source', status: 'skip', detail: 'config non chargée' });
    }
    console.log();
    // ── Fichiers générés ─────────────────────────────────────────────────────────
    console.log(`  ${chalk.dim('Fichiers générés')}`);
    const compiledPath = path.join(outDir, `${alias}.json`);
    const refPath = path.join(outDir, `${alias}.reference.gen.json`);
    const schemaPath = path.join(outDir, '.linklab', `${alias}.schema.gen.json`);
    const dictPath = path.join(outDir, `${alias}.dictionary.gen.json`);
    const ucGenPath = path.join(outDir, `${alias}.use-cases.gen.json`);
    const testGenPath = path.join(outDir, `${alias}.test.gen.json`);
    if (!fs.existsSync(compiledPath)) {
        printCheck({
            label: `${alias}.json`,
            status: 'error',
            detail: 'introuvable',
            fix: `linklab build ${alias}`
        });
        errors++;
    }
    else {
        try {
            const { createRequire } = await import('module');
            const req = createRequire(import.meta.url);
            const compiled = req(compiledPath);
            const routes = compiled.routes ?? [];
            const physical = routes.filter((r) => !r.semantic).length;
            const semantic = routes.filter((r) => r.semantic && !r.composed).length;
            const composed = routes.filter((r) => r.composed).length;
            printCheck({
                label: `${alias}.json`,
                status: 'ok',
                detail: `v${compiled.version}  —  ${routes.length} routes (${physical}p · ${semantic}s · ${composed}c)`
            });
        }
        catch {
            printCheck({ label: `${alias}.json`, status: 'warn', detail: 'illisible' });
            warnings++;
        }
    }
    for (const [file, fixCmd] of [
        [refPath, `linklab build ${alias}`],
        [schemaPath, `linklab build ${alias}`],
        [dictPath, `linklab build ${alias}`]
    ]) {
        const name = path.relative(outDir, file).replace(/\\/g, '/');
        if (!fs.existsSync(file)) {
            printCheck({ label: name, status: 'warn', detail: 'introuvable', fix: fixCmd });
            warnings++;
        }
        else {
            printCheck({ label: name, status: 'ok' });
        }
    }
    if (!fs.existsSync(ucGenPath)) {
        printCheck({
            label: `${alias}.use-cases.gen.json`,
            status: 'warn',
            detail: 'non généré',
            fix: `linklab generate ${alias}`
        });
        warnings++;
    }
    else {
        const ucs = JSON.parse(fs.readFileSync(ucGenPath, 'utf-8'));
        printCheck({
            label: `${alias}.use-cases.gen.json`,
            status: 'ok',
            detail: `${ucs.length} use cases`
        });
    }
    if (!fs.existsSync(testGenPath)) {
        printCheck({
            label: `${alias}.test.gen.json`,
            status: 'warn',
            detail: 'non testé',
            fix: `linklab test ${alias}`
        });
        warnings++;
    }
    else {
        const report = JSON.parse(fs.readFileSync(testGenPath, 'utf-8'));
        const pct = Math.round((report.ok / report.total) * 100);
        const status = report.errors > 0 ? 'warn' : 'ok';
        printCheck({
            label: `${alias}.test.gen.json`,
            status,
            detail: `${report.ok}/${report.total} OK (${pct}%)${report.errors > 0 ? ` — ${report.errors} erreur${report.errors > 1 ? 's' : ''}` : ''}`
        });
        if (report.errors > 0)
            warnings++;
    }
    console.log();
    // ── Résumé ────────────────────────────────────────────────────────────────────
    if (errors === 0 && warnings === 0) {
        console.log(`  ${chalk.green('✔')}  Tout est en ordre`);
    }
    else {
        if (errors > 0)
            console.log(`  ${chalk.red('✖')}  ${errors} erreur${errors > 1 ? 's' : ''}`);
        if (warnings > 0)
            console.log(`  ${chalk.yellow('⚠')}  ${warnings} avertissement${warnings > 1 ? 's' : ''}`);
    }
    console.log();
    return { errors, warnings };
}
// ── Commande ──────────────────────────────────────────────────────────────────
export async function doctor(options = {}) {
    const cwd = process.cwd();
    if (!options.alias) {
        const aliases = fs
            .readdirSync(cwd)
            .filter(f => f.endsWith('.linklab.ts'))
            .map(f => f.replace('.linklab.ts', ''));
        if (aliases.length === 0) {
            console.log(`\n  ${chalk.yellow('⚠')}  Aucun fichier *.linklab.ts trouvé\n`);
            return;
        }
        let totalErrors = 0;
        for (const a of aliases) {
            const { errors } = await runDoctor(cwd, a);
            totalErrors += errors;
        }
        if (totalErrors > 0)
            process.exit(1);
        return;
    }
    const { errors } = await runDoctor(cwd, options.alias);
    if (errors > 0)
        process.exit(1);
}
//# sourceMappingURL=doctor.js.map
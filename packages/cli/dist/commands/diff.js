/**
 * diff.ts — linklab diff [alias]
 *
 * Compare le schema.gen.json du dernier build avec la source actuelle
 * et affiche les différences (drift).
 */
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { loadConfig, resolveAlias, validateConfig } from '../config.js';
// ── Helpers ───────────────────────────────────────────────────────────────────
function snapshotFromSchema(schema) {
    return {
        tables: (schema.entities ?? []).map((e) => ({
            name: e.name,
            columns: (e.properties ?? []).map((p) => ({
                name: p.name,
                type: p.type ?? 'unknown',
            }))
        }))
    };
}
function silence() {
    const ol = console.log, ow = console.warn;
    console.log = () => { };
    console.warn = () => { };
    return () => { console.log = ol; console.warn = ow; };
}
async function snapshotFromJSON(dataDir) {
    const restore = silence();
    try {
        const { JsonSchemaExtractor } = await import('@linklab/core');
        const extractor = new JsonSchemaExtractor(dataDir);
        const techSchema = await extractor.extract();
        return snapshotFromSchema(techSchema);
    }
    finally {
        restore();
    }
}
async function snapshotFromPostgres(config) {
    const { PostgresProvider, SchemaExtractor } = await import('@linklab/core');
    const provider = new PostgresProvider(config.source);
    const extractor = new SchemaExtractor(provider);
    const restore = silence();
    try {
        const techSchema = await extractor.extract(config.source.database ?? 'db');
        return snapshotFromSchema(techSchema);
    }
    finally {
        restore();
        await provider.close?.();
    }
}
function computeDiff(old, current) {
    const changes = [];
    const oldTables = new Map(old.tables.map(t => [t.name, t]));
    const currentTables = new Map(current.tables.map(t => [t.name, t]));
    for (const [name] of currentTables) {
        if (!oldTables.has(name))
            changes.push({ kind: 'added', table: name });
    }
    for (const [name] of oldTables) {
        if (!currentTables.has(name))
            changes.push({ kind: 'removed', table: name });
    }
    for (const [name, currentTable] of currentTables) {
        const oldTable = oldTables.get(name);
        if (!oldTable)
            continue;
        const oldCols = new Map(oldTable.columns.map(c => [c.name, c]));
        const currentCols = new Map(currentTable.columns.map(c => [c.name, c]));
        for (const [col, c] of currentCols) {
            if (!oldCols.has(col))
                changes.push({ kind: 'added', table: name, column: col, to: c.type });
        }
        for (const [col] of oldCols) {
            if (!currentCols.has(col))
                changes.push({ kind: 'removed', table: name, column: col });
        }
        for (const [col, cur] of currentCols) {
            const old = oldCols.get(col);
            if (old && old.type !== cur.type) {
                changes.push({ kind: 'modified', table: name, column: col, from: old.type, to: cur.type });
            }
        }
    }
    return changes;
}
function display(changes, alias) {
    console.log();
    console.log(`  ${chalk.bold.white('linklab diff')}  ·  ${chalk.cyan(alias)}`);
    console.log();
    if (changes.length === 0) {
        console.log(`  ${chalk.green('✔')}  No drift detected`);
        console.log();
        return;
    }
    const byTable = new Map();
    for (const c of changes) {
        if (!byTable.has(c.table))
            byTable.set(c.table, []);
        byTable.get(c.table).push(c);
    }
    for (const [table, tableChanges] of byTable) {
        const tableAdded = tableChanges.some(c => c.kind === 'added' && !c.column);
        const tableRemoved = tableChanges.some(c => c.kind === 'removed' && !c.column);
        if (tableAdded)
            console.log(`  ${chalk.green('+')} ${chalk.bold(table)}  ${chalk.dim('(nouvelle table)')}`);
        else if (tableRemoved)
            console.log(`  ${chalk.red('-')} ${chalk.bold(table)}  ${chalk.dim('(table supprimée)')}`);
        else
            console.log(`  ${chalk.dim(table)}`);
        for (const c of tableChanges) {
            if (!c.column)
                continue;
            const col = c.column.padEnd(22);
            if (c.kind === 'added')
                console.log(`    ${chalk.green('+')} ${col} ${chalk.dim(c.to ?? '')}`);
            else if (c.kind === 'removed')
                console.log(`    ${chalk.red('-')} ${col}`);
            else
                console.log(`    ${chalk.yellow('~')} ${col} ${chalk.dim(c.from)} ${chalk.dim('→')} ${chalk.yellow(c.to ?? '')}`);
        }
        console.log();
    }
    const adds = changes.filter(c => c.kind === 'added').length;
    const rems = changes.filter(c => c.kind === 'removed').length;
    const mods = changes.filter(c => c.kind === 'modified').length;
    console.log(`  ${chalk.dim(`${changes.length} change${changes.length > 1 ? 's' : ''} —`)}` +
        (adds ? chalk.green(` +${adds}`) : '') +
        (rems ? chalk.red(` -${rems}`) : '') +
        (mods ? chalk.yellow(` ~${mods}`) : ''));
    console.log();
    console.log(`  ${chalk.dim(`Run "linklab build ${alias}" to recompile.`)}`);
    console.log();
}
// ── Commande ──────────────────────────────────────────────────────────────────
export async function diff(options = {}) {
    const cwd = process.cwd();
    let alias;
    let outDir;
    let config;
    try {
        const resolved = resolveAlias(cwd, options.alias);
        alias = resolved ?? path.basename(cwd);
        ({ config, outDir } = await loadConfig(cwd, alias));
    }
    catch (e) {
        console.error(`\n  ✖  ${e.message}\n`);
        process.exit(1);
    }
    // Chemin du schema sauvegardé (convention .gen.)
    const schemaPath = path.join(outDir, '.linklab', `${alias}.schema.gen.json`);
    if (!fs.existsSync(schemaPath)) {
        console.log();
        console.log(`  ${chalk.red('✖')}  Schema introuvable — lance "linklab build ${alias}" d'abord`);
        console.log();
        process.exit(1);
    }
    const oldSchema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
    const oldSnap = snapshotFromSchema(oldSchema);
    let currentSnap;
    try {
        if (config.source?.type === 'json') {
            const dataDir = path.resolve(cwd, config.source.dataDir ?? './data');
            currentSnap = await snapshotFromJSON(dataDir);
        }
        else {
            const errors = validateConfig(config);
            if (errors.length) {
                for (const e of errors)
                    console.error(`  ✖  ${e}`);
                process.exit(1);
            }
            currentSnap = await snapshotFromPostgres(config);
        }
    }
    catch (e) {
        console.error(`  ✖  Impossible de lire la source : ${e.message}`);
        process.exit(1);
    }
    const changes = computeDiff(oldSnap, currentSnap);
    display(changes, alias);
}
//# sourceMappingURL=diff.js.map
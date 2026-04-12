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
import * as fs from 'fs';
import * as path from 'path';
import * as log from '../ui/logger.js';
import { loadConfig, resolveAlias } from '../config.js';
// ── Commande ──────────────────────────────────────────────────────────────────
export async function train(options = {}) {
    const cwd = process.cwd();
    // ── Config ──────────────────────────────────────────────────────────────────
    let alias;
    let outDir;
    let config;
    try {
        const resolved = resolveAlias(cwd, options.alias);
        alias = resolved ?? 'graph';
        ({ config, outDir } = await loadConfig(cwd, alias));
    }
    catch (e) {
        log.error('Impossible de charger la config', e.message);
        process.exit(1);
    }
    const compiledPath = path.join(outDir, `${alias}.json`);
    const testGenPath = path.join(outDir, `${alias}.test.gen.json`);
    const rawPath = path.join(outDir, `${alias}.reference.gen.json`);
    if (!fs.existsSync(compiledPath)) {
        log.error(`Graph introuvable`, `Lance d'abord : linklab build ${alias}`);
        process.exit(1);
    }
    if (!fs.existsSync(testGenPath)) {
        log.error(`Résultats de test introuvables`, `Lance d'abord : linklab test ${alias}`);
        process.exit(1);
    }
    const { createRequire } = await import('module');
    const req = createRequire(import.meta.url);
    const compiled = req(compiledPath);
    const testReport = JSON.parse(fs.readFileSync(testGenPath, 'utf-8'));
    log.header('0.1.0', alias);
    // ── Construire les métriques depuis les résultats de test ──────────────────
    const weightThreshold = config.compiler?.weightThreshold ?? 1000;
    const DISQUALIFIED = weightThreshold + 1; // poids éliminatoire
    // Métriques par clé de chemin (path.join('→'))
    const metrics = {};
    let ok = 0, eliminated = 0, unchanged = 0;
    for (const result of testReport.results) {
        // Ignorer les résultats sans chemin valide
        if (!result.path || !Array.isArray(result.path) || result.path.length === 0)
            continue;
        // Clé unique : pour composées, utiliser le semantic (label) car les paths sont identiques
        // Pour les autres routes : utiliser le path
        const ucResult = result;
        const pathKey = ucResult.type === 'composed' && ucResult.semantic
            ? `composed:${ucResult.from}→${ucResult.to}:${ucResult.semantic}`
            : result.path.join('→');
        if (result.status === 'ok' && result.resultCount > 0) {
            // Route avec données → poids basé sur la popularité
            // Plus de résultats = route très utilisée = poids faible
            // On utilise le temps d'exécution mesuré ou un poids calculé
            const weight = Math.max(0.1, 10 / Math.log10(result.resultCount + 2));
            metrics[pathKey] = {
                path: result.path,
                executions: 1,
                successes: 1,
                totalTime: result.durationMs,
                avgTime: weight,
                minTime: result.durationMs,
                maxTime: result.durationMs,
                used: true,
                failed: false
            };
            ok++;
        }
        else if (result.status === 'empty') {
            // Route sans données → poids disqualifiant
            metrics[pathKey] = {
                path: result.path,
                executions: 1,
                successes: 0,
                totalTime: 0,
                avgTime: DISQUALIFIED,
                minTime: 0,
                maxTime: 0,
                used: false,
                failed: false
            };
            eliminated++;
        }
        // Erreurs → ignorées (pas dans les métriques)
    }
    // ── Sauvegarder les métriques ─────────────────────────────────────────────
    const metricsPath = path.join(outDir, `${alias}.metrics.gen.json`);
    fs.writeFileSync(metricsPath, JSON.stringify(metrics, null, 2));
    console.log(`  Métriques calibrées depuis ${testReport.total} use cases :`);
    console.log(`  ✔  ${ok} routes conservées`);
    console.log(`  ✖  ${eliminated} routes éliminées (poids=${DISQUALIFIED})`);
    console.log();
    // ── Recompiler avec les nouvelles métriques ───────────────────────────────
    const { GraphCompiler } = await import('@linklab/core');
    const rawPath2 = fs.existsSync(rawPath) ? rawPath : path.join(outDir, `${alias}.reference.json`);
    if (!fs.existsSync(rawPath2)) {
        log.error(`Raw graph introuvable`, `${rawPath2}`);
        process.exit(1);
    }
    const rawGraph = req(rawPath2);
    const metricsMap = new Map(Object.entries(metrics).map(([k, v]) => [k, v]));
    let compileStats;
    const t0 = Date.now();
    const silence = () => {
        const ol = console.log, ow = console.warn;
        console.log = () => { };
        console.warn = () => { };
        return () => {
            console.log = ol;
            console.warn = ow;
        };
    };
    const restore = silence();
    try {
        const compiler = new GraphCompiler({
            weightThreshold: config.compiler?.weightThreshold ?? 1000,
            keepFallbacks: config.compiler?.keepFallbacks ?? true,
            maxFallbacks: config.compiler?.maxFallbacks ?? 2
        });
        const newCompiled = compiler.compile(rawGraph, metricsMap);
        newCompiled.version = bumpPatch(compiled.version ?? '2.0.0');
        newCompiled.alias = alias;
        const dir = path.dirname(compiledPath);
        if (!fs.existsSync(dir))
            fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(compiledPath, JSON.stringify(newCompiled, null, 2));
        compileStats = GraphCompiler.getStats(newCompiled);
    }
    finally {
        restore();
    }
    const d = Date.now() - t0;
    log.step(5, 'Compile', `${compileStats.totalRoutes} routes (${compileStats.physical} physical · ${compileStats.semantic} semantic · ${compileStats.composed ?? 0} composed)`, d);
    const prevVersion = compiled.version ?? '2.0.0';
    const newVersion = bumpPatch(prevVersion);
    log.warnings([]);
    log.success(path.relative(cwd, compiledPath).replace(/\\/g, '/'), `${prevVersion} → ${newVersion}`, alias);
    console.log(`     → Lance : linklab repl ${alias}`);
    console.log();
}
function bumpPatch(version) {
    const parts = version.split('.').map(Number);
    if (parts.length !== 3 || parts.some(isNaN))
        return '2.0.0';
    parts[2]++;
    return parts.join('.');
}
//# sourceMappingURL=train.js.map
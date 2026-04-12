/**
 * test.ts — linklab test <alias>
 *
 * Teste chaque use case du graphe contre les données réelles.
 * Lit use-cases.gen.json (+ use-cases.json override si présent).
 * Produit use-cases.test.gen.json avec les résultats.
 *
 * Usage :
 *   linklab test cinema
 *   linklab test dvdrental
 *   linklab test cinema --fail-fast   ← stoppe au premier échec
 *   linklab test cinema --filter physical  ← physiques uniquement
 */
import * as fs from 'fs';
import * as path from 'path';
import * as log from '../ui/logger.js';
import { loadConfig, resolveAlias } from '../config.js';
// ── Commande ──────────────────────────────────────────────────────────────────
export async function test(options = {}) {
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
    const ucGenPath = path.join(outDir, `${alias}.use-cases.gen.json`);
    const ucOverPath = path.join(outDir, `${alias}.use-cases.json`);
    if (!fs.existsSync(compiledPath)) {
        log.error(`Graph introuvable`, `Lance d'abord : linklab build ${alias}`);
        process.exit(1);
    }
    if (!fs.existsSync(ucGenPath)) {
        log.error(`Use cases introuvables`, `Lance d'abord : linklab generate ${alias}`);
        process.exit(1);
    }
    const { createRequire } = await import('module');
    const req = createRequire(import.meta.url);
    const compiled = req(compiledPath);
    // Charger les use cases (override prioritaire)
    let useCases = JSON.parse(fs.readFileSync(ucGenPath, 'utf-8'));
    if (fs.existsSync(ucOverPath)) {
        const override = JSON.parse(fs.readFileSync(ucOverPath, 'utf-8'));
        // Merger : override remplace par id, sinon ajoute
        const byId = new Map(useCases.map(uc => [uc.id, uc]));
        for (const uc of override)
            byId.set(uc.id, uc);
        useCases = [...byId.values()];
    }
    // Filtrer par type si demandé
    if (options.filter) {
        useCases = useCases.filter(uc => uc.type === options.filter);
    }
    log.header('0.1.0', alias);
    // ── Charger le moteur d'exécution ─────────────────────────────────────────
    const { Graph } = await import('@linklab/core');
    const rawGraph = { nodes: compiled.nodes, edges: [] };
    let dataset = null;
    let provider = null;
    if (config.source?.type === 'json' && config.source?.dataDir) {
        const dataDirAbs = path.resolve(cwd, config.source.dataDir);
        dataset = {};
        for (const node of compiled.nodes) {
            const file = path.join(dataDirAbs, `${node.id}.json`);
            if (fs.existsSync(file))
                dataset[node.id] = req(file);
        }
    }
    else if (config.source?.type === 'postgres' || process.env.PGDATABASE) {
        const { PostgresProvider } = await import('@linklab/core');
        provider = new PostgresProvider({
            host: config.source?.host ?? process.env.PGHOST ?? 'localhost',
            port: parseInt(config.source?.port ?? process.env.PGPORT ?? '5432'),
            database: config.source?.database ?? process.env.PGDATABASE ?? 'postgres',
            user: config.source?.user ?? process.env.PGUSER ?? 'postgres',
            password: config.source?.password ?? process.env.PGPASSWORD ?? ''
        });
    }
    const graph = new Graph(rawGraph, {
        compiled,
        ...(dataset ? { dataset } : {}),
        ...(provider ? { provider } : {})
    });
    // ── Exécuter les tests ─────────────────────────────────────────────────────
    const results = [];
    const globalStart = Date.now();
    const total = useCases.length;
    let ok = 0, empty = 0, errors = 0;
    let lastPct = -1;
    console.log(`  Testing ${total} use cases...\n`);
    for (let i = 0; i < useCases.length; i++) {
        const uc = useCases[i];
        // Barre de progression simple
        const pct = Math.floor((i / total) * 20);
        if (pct !== lastPct) {
            const bar = '█'.repeat(pct) + '░'.repeat(20 - pct);
            const label = `${i}/${total}`;
            process.stdout.write(`\r  [${bar}] ${label.padStart(8)}  ok=${ok} empty=${empty} err=${errors}`);
            lastPct = pct;
        }
        const start = Date.now();
        let status = 'ok';
        let resultCount = 0;
        let error;
        try {
            // Exécuter via QueryEngine directement
            const { QueryEngine } = await import('@linklab/core');
            const engine = new QueryEngine(compiled);
            if (dataset) {
                const rows = engine.executeInMemory({
                    from: uc.from,
                    to: uc.to,
                    filters: {},
                    // Passer le semantic pour toutes les routes sémantiques (y compris composées via)
                    ...(uc.semantic ? { semantic: uc.semantic } : {})
                }, dataset);
                resultCount = rows.length;
                status = resultCount > 0 ? 'ok' : 'empty';
            }
            else if (provider) {
                const sql = engine.generateSQL({
                    from: uc.from,
                    to: uc.to,
                    filters: {},
                    // Passer le semantic pour toutes les routes sémantiques (y compris composées via)
                    ...(uc.semantic ? { semantic: uc.semantic } : {})
                });
                const rows = await provider.query(`SELECT COUNT(*) as cnt FROM (${sql}) sub`);
                resultCount = parseInt(rows[0]?.cnt ?? '0');
                status = resultCount > 0 ? 'ok' : 'empty';
            }
        }
        catch (e) {
            status = 'error';
            error = e.message;
            errors++;
            if (options.failFast) {
                console.log();
                log.error(`[FAIL] ${uc.id}`, error);
                break;
            }
        }
        if (status === 'ok')
            ok++;
        if (status === 'empty')
            empty++;
        results.push({
            id: uc.id,
            from: uc.from,
            to: uc.to,
            type: uc.type,
            semantic: uc.semantic,
            description: uc.description,
            path: uc.path,
            status,
            resultCount,
            durationMs: Date.now() - start,
            ...(error ? { error } : {})
        });
    }
    const totalMs = Date.now() - globalStart;
    // Effacer la barre de progression
    process.stdout.write('\r' + ' '.repeat(60) + '\r');
    // ── Rapport ───────────────────────────────────────────────────────────────
    const report = {
        alias,
        testedAt: new Date().toISOString(),
        total,
        ok,
        empty,
        errors,
        durationMs: totalMs,
        results
    };
    const outFile = path.join(outDir, `${alias}.test.gen.json`);
    fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
    // Afficher le résumé
    const pctOk = Math.round((ok / total) * 100);
    const pctEmpty = Math.round((empty / total) * 100);
    const pctErr = Math.round((errors / total) * 100);
    console.log(`  Résultats sur ${total} use cases — ${totalMs}ms\n`);
    console.log(`  ✔  OK     : ${String(ok).padStart(5)}  (${pctOk}%)`);
    console.log(`  ○  Vides  : ${String(empty).padStart(5)}  (${pctEmpty}%)  ← candidats à éliminer`);
    console.log(`  ✖  Erreurs: ${String(errors).padStart(5)}  (${pctErr}%)`);
    // Top 10 des routes vides (pour info)
    const emptyRoutes = results.filter(r => r.status === 'empty');
    if (emptyRoutes.length > 0 && emptyRoutes.length <= 20) {
        console.log(`\n  Routes vides :`);
        emptyRoutes.slice(0, 10).forEach(r => console.log(`    ○  ${r.description}`));
        if (emptyRoutes.length > 10)
            console.log(`    ... et ${emptyRoutes.length - 10} autres`);
    }
    console.log();
    console.log(`  ✔  ${path.relative(cwd, outFile).replace(/\\/g, '/')}`);
    console.log();
    console.log(`     → Lance : linklab train ${alias}`);
    console.log();
    if (provider?.close)
        await provider.close();
    // Exit code non-zéro si des erreurs (pas pour les vides — c'est attendu)
    if (errors > 0)
        process.exit(1);
}
//# sourceMappingURL=test.js.map
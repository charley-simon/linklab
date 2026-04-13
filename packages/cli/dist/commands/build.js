/**
 * build.ts — linklab build <alias>
 *
 * Pipeline complet : extract → analyze → assemble → train → compile
 * Les fichiers générés sont nommés {alias}.*.json dans linklab/{alias}/
 *
 * Usage :
 *   linklab build cinema
 *   linklab build dvdrental --dry-run
 *   linklab build            ← auto-detect si un seul *.linklab.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import * as log from '../ui/logger.js';
import { loadConfig, validateConfig } from '../config.js';
import { JsonSchemaExtractor } from '@linklab/core';
import { SchemaAnalyzer } from '@linklab/core';
import { GraphBuilder } from '@linklab/core';
import { GraphAssembler } from '@linklab/core';
import { GraphCompiler } from '@linklab/core';
import { PathFinder } from '@linklab/core';
// ── Helpers ───────────────────────────────────────────────────────────────────
function save(filepath, data) {
    const dir = path.dirname(filepath);
    if (!fs.existsSync(dir))
        fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
}
function silence() {
    const origLog = console.log, origWarn = console.warn;
    console.log = () => { };
    console.warn = () => { };
    return () => {
        console.log = origLog;
        console.warn = origWarn;
    };
}
function bumpPatch(version) {
    const parts = version.split('.').map(Number);
    if (parts.length !== 3 || parts.some(isNaN))
        return '2.0.0';
    parts[2]++;
    return parts.join('.');
}
function readVersion(compiledPath) {
    try {
        return JSON.parse(fs.readFileSync(compiledPath, 'utf-8')).version ?? '2.0.0';
    }
    catch {
        return '2.0.0';
    }
}
function timed(fn) {
    const t0 = Date.now();
    const result = fn();
    return { result, durationMs: Date.now() - t0 };
}
async function timedAsync(fn) {
    const t0 = Date.now();
    const result = await fn();
    return { result, durationMs: Date.now() - t0 };
}
function defaultUseCases(graph) {
    const nodes = graph.nodes.map(n => n.id);
    const cases = [];
    for (let i = 0; i < Math.min(nodes.length, 4); i++)
        for (let j = 0; j < Math.min(nodes.length, 4); j++)
            if (i !== j)
                cases.push({ from: nodes[i], to: nodes[j], description: `${nodes[i]} → ${nodes[j]}` });
    return cases;
}
// ── Commande ──────────────────────────────────────────────────────────────────
export async function build(options = {}) {
    const cwd = process.cwd();
    const warnings = [];
    // ── Config ──────────────────────────────────────────────────────────────────
    let config, alias, outDir;
    try {
        ;
        ({ config, alias, outDir } = await loadConfig(cwd, options.alias, options.config));
    }
    catch (e) {
        log.error('Impossible de charger la config', e.message);
        process.exit(1);
    }
    const errors = validateConfig(config);
    if (errors.length) {
        for (const e of errors)
            log.error(e);
        process.exit(1);
    }
    // Chemins des fichiers — convention {alias}.*
    const files = {
        schema: path.join(outDir, '.linklab', `${alias}.schema.gen.json`),
        analyzed: path.join(outDir, '.linklab', `${alias}.analyzed-schema.gen.json`),
        raw: path.join(outDir, `${alias}.reference.gen.json`),
        dict: path.join(outDir, `${alias}.dictionary.gen.json`),
        metrics: path.join(outDir, `${alias}.metrics.gen.json`),
        compiled: path.join(outDir, `${alias}.json`), // principal — pas .gen.
        override: path.join(outDir, `${alias}.override.json`), // dev — pas .gen.
        useCases: path.join(outDir, `${alias}.use-cases.json`), // dev override
        ucGen: path.join(outDir, `${alias}.use-cases.gen.json`) // généré
    };
    log.header('0.1.0', alias);
    if (options.dryRun) {
        console.log('  dry-run — rien ne sera écrit\n');
        console.log('  Fichiers qui seraient générés :');
        for (const [key, p] of Object.entries(files)) {
            if (!['override', 'useCases'].includes(key))
                console.log(`    ${path.relative(cwd, p).replace(/\\/g, '/')}`);
        }
        console.log();
        return;
    }
    // ── Step 1 : Extract ────────────────────────────────────────────────────────
    let techSchema;
    const { durationMs: d1 } = await timedAsync(async () => {
        const restore = silence();
        try {
            if (config.source.type === 'json') {
                const dataDir = path.resolve(cwd, config.source.dataDir ?? './data');
                techSchema = await new JsonSchemaExtractor(dataDir).extract();
            }
            else {
                const { PostgresProvider } = await import('@linklab/core');
                const { SchemaExtractor } = await import('@linklab/core');
                const provider = new PostgresProvider(config.source);
                const extractor = new SchemaExtractor(provider);
                techSchema = await extractor.extract(config.source.database ?? alias);
                await provider.close?.();
            }
            save(files.schema, techSchema);
        }
        finally {
            restore();
        }
    });
    const entityCount = techSchema.entities?.length ?? 0;
    log.step(0, 'Extract', `${entityCount} tables`, d1);
    // ── Step 2 : Analyze ────────────────────────────────────────────────────────
    let analyzedSchema;
    const dataDir2 = config.source.type === 'json'
        ? path.resolve(cwd, config.source.dataDir ?? './data')
        : path.dirname(files.schema);
    const { durationMs: d2 } = timed(() => {
        const restore = silence();
        try {
            analyzedSchema = new SchemaAnalyzer(path.dirname(files.schema), dataDir2).analyze(techSchema);
            save(files.analyzed, analyzedSchema);
        }
        finally {
            restore();
        }
    });
    const advices = (analyzedSchema?.advices ?? []);
    const pivots = advices.filter((a) => a.action === 'SUGGEST_VIRTUAL_VIEWS').length;
    const warnAdvices = advices.filter((a) => a.level === 'WARNING' || a.level === 'CRITICAL');
    for (const w of warnAdvices)
        warnings.push({ level: 'warn', message: w.message ?? String(w), hint: w.action });
    log.step(1, 'Analyze', `${pivots} pivot${pivots !== 1 ? 's' : ''}${warnAdvices.length ? ` · ${warnAdvices.length} warnings` : ''}`, d2);
    // ── Step 3 : Dictionary ──────────────────────────────────────────────────────
    let dictionary;
    const { durationMs: d3 } = timed(() => {
        dictionary = new GraphBuilder().build(analyzedSchema, dataDir2);
        save(files.dict, dictionary);
    });
    log.step(2, 'Dictionary', `${dictionary?.relations?.length ?? 0} relations`, d3);
    // ── Step 4 : Assemble ────────────────────────────────────────────────────────
    let rawGraph;
    const { durationMs: d4 } = timed(() => {
        rawGraph = new GraphAssembler().assemble(dictionary);
        // Appliquer {alias}.override.json
        if (fs.existsSync(files.override)) {
            const over = JSON.parse(fs.readFileSync(files.override, 'utf-8'));
            if (Array.isArray(over.edges) && over.edges.length)
                rawGraph = { ...rawGraph, edges: [...rawGraph.edges, ...over.edges] };
            if (over.nodes && typeof over.nodes === 'object')
                rawGraph = {
                    ...rawGraph,
                    nodes: rawGraph.nodes.map(n => ({ ...n, ...(over.nodes[n.id] ?? {}) }))
                };
            if (over.weights && typeof over.weights === 'object')
                rawGraph = {
                    ...rawGraph,
                    edges: rawGraph.edges.map(e => {
                        const key = `${e.from}→${e.to}`;
                        return over.weights[key] !== undefined ? { ...e, weight: over.weights[key] } : e;
                    })
                };
        }
        save(files.raw, rawGraph);
    });
    log.step(3, 'Assemble', `${rawGraph.nodes.length} nodes · ${rawGraph.edges.length} edges`, d4);
    // ── Step 5 : Train ────────────────────────────────────────────────────────────
    let metrics;
    const { durationMs: d5 } = timed(() => {
        const useCases = fs.existsSync(files.useCases)
            ? JSON.parse(fs.readFileSync(files.useCases, 'utf-8')) // override dev prioritaire
            : fs.existsSync(files.ucGen)
                ? JSON.parse(fs.readFileSync(files.ucGen, 'utf-8')) // généré par linklab generate
                : (config.useCases ?? defaultUseCases(rawGraph));
        const finder = new PathFinder(rawGraph);
        metrics = new Map();
        for (const uc of useCases) {
            for (const p of finder.findAllPaths(uc.from, uc.to)) {
                metrics.set(p.join('→'), {
                    path: p,
                    executions: 10,
                    successes: 10,
                    totalTime: 100,
                    avgTime: 10,
                    minTime: 8,
                    maxTime: 12,
                    used: true,
                    failed: false
                });
            }
        }
        save(files.metrics, Object.fromEntries(metrics));
    });
    log.step(4, 'Train', `${metrics.size} routes entraînées`, d5);
    // ── Step 6 : Compile ──────────────────────────────────────────────────────────
    const prevVersion = readVersion(files.compiled);
    const newVersion = bumpPatch(prevVersion);
    let compileStats;
    const { durationMs: d6 } = timed(() => {
        const restore = silence();
        try {
            const compiler = new GraphCompiler({
                weightThreshold: config.compiler?.weightThreshold ?? 1000,
                keepFallbacks: config.compiler?.keepFallbacks ?? true,
                maxFallbacks: config.compiler?.maxFallbacks ?? 2,
                expose: config.expose ?? 'none'
            });
            const compiled = compiler.compile(rawGraph, metrics);
            compiled.version = newVersion;
            compiled.alias = alias;
            save(files.compiled, compiled);
            compileStats = GraphCompiler.getStats(compiled);
        }
        finally {
            restore();
        }
    });
    log.step(5, 'Compile', `${compileStats.totalRoutes} routes (${compileStats.physical ?? '?'} physical · ${compileStats.semantic ?? 0} semantic · ${compileStats.composed ?? 0} composed)`, d6);
    // ── Step 6b : Enrichir le dictionnaire avec les routes compilées ──────────────
    //
    // Le dictionary.gen.json initial ne contient que les relations physiques
    // et les vues sémantiques de GraphBuilder. On y ajoute maintenant une
    // section "routes" avec les labels humains de chaque route compilée.
    //
    // Structure produite :
    //   {
    //     tables: [...],
    //     relations: [...],
    //     routes: {
    //       "movies→people[director]":   { label: "director",   semantic: true,  composed: false },
    //       "director_in→actor":          { label: "actor",      semantic: true,  composed: true  },
    //     }
    //   }
    try {
        const compiledData = JSON.parse(fs.readFileSync(files.compiled, 'utf-8'));
        const dictData = JSON.parse(fs.readFileSync(files.dict, 'utf-8'));
        const routeLabels = {};
        for (const route of compiledData.routes ?? []) {
            // Clé : "from→to" ou "from→to[label]" si sémantique
            const routeLabel = typeof route.label === 'string' ? route.label : null;
            const key = routeLabel && route.semantic
                ? `${route.from}→${route.to}[${routeLabel}]`
                : `${route.from}→${route.to}`;
            routeLabels[key] = {
                from: route.from,
                to: route.to,
                label: routeLabel ?? `${route.from}_to_${route.to}`,
                semantic: !!route.semantic,
                composed: !!route.composed,
                weight: route.primary?.weight
            };
        }
        dictData.routes = routeLabels;
        // Merger le dictionary.override.json dev (labels humains)
        const dictOverridePath = path.join(outDir, `${alias}.dictionary.override.json`);
        if (fs.existsSync(dictOverridePath)) {
            try {
                const devOverride = JSON.parse(fs.readFileSync(dictOverridePath, 'utf-8'));
                const devRoutes = devOverride.routes ?? {};
                for (const [key, val] of Object.entries(devRoutes)) {
                    if (dictData.routes[key]) {
                        dictData.routes[key] = { ...dictData.routes[key], ...val };
                    }
                }
            }
            catch { /* non bloquant */ }
        }
        save(files.dict, dictData);
    }
    catch { /* non bloquant */ }
    // ── Résumé ────────────────────────────────────────────────────────────────────
    log.warnings(warnings);
    log.success(path.relative(cwd, files.compiled).replace(/\\/g, '/'), `${prevVersion} → ${newVersion}`, alias);
}
//# sourceMappingURL=build.js.map
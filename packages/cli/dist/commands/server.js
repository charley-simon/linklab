/**
 * server.ts — linklab server <alias>
 *
 * Lance un serveur REST + HATEOAS Level 3 depuis le graphe compilé.
 * Zéro ligne de code applicatif — démonstration LinkLab.
 *
 * Usage :
 *   linklab server cinema
 *   linklab server dvdrental --port 4000
 */
import * as path from 'path';
import * as fs from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { loadConfig, resolveAlias } from '../config.js';
const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// ── Couleurs ANSI ─────────────────────────────────────────────
const C = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
};
const c = (color, s) => `${color}${s}${C.reset}`;
// ── Commande principale ───────────────────────────────────────
export async function server(options = {}) {
    const cwd = process.cwd();
    const port = options.port ?? 3000;
    const host = options.host ?? 'localhost';
    // ── Résoudre l'alias et la config ─────────────────────────
    let alias;
    let config;
    let outDir;
    try {
        const resolved = resolveAlias(cwd, options.alias);
        alias = resolved ?? 'graph';
        ({ config, outDir } = await loadConfig(cwd, alias));
    }
    catch (e) {
        console.error('\n  ✖', e.message);
        process.exit(1);
    }
    const compiledPath = path.join(outDir, `${alias}.json`);
    if (!fs.existsSync(compiledPath)) {
        console.error(`\n  ✖  Graph introuvable : ${path.relative(cwd, compiledPath).replace(/\\/g, '/')}`);
        console.error(`     Lance d'abord : linklab build ${alias}\n`);
        process.exit(1);
    }
    // ── Charger le graphe compilé ──────────────────────────────
    const { PostgresProvider } = await import('@linklab/core');
    // dotenv optionnel
    try {
        const dotenvMod = require('dotenv');
        let dir = cwd;
        for (let i = 0; i < 4; i++) {
            const candidate = path.join(dir, '.env');
            if (fs.existsSync(candidate)) {
                dotenvMod.config({ path: candidate });
                break;
            }
            const parent = path.dirname(dir);
            if (parent === dir)
                break;
            dir = parent;
        }
    }
    catch { /* optionnel */ }
    const compiled = require(compiledPath);
    // Reconstruire les edges depuis les routes compilées (non composées)
    // LinkBuilder a besoin de graph.edges pour générer les liens HATEOAS
    const edges = (compiled.routes ?? [])
        .filter((r) => !r.composed)
        .map((r) => ({
        from: r.from,
        to: r.to,
        name: r.label,
        weight: r.weight ?? 500,
    }));
    // Objet graph plain — pas une instance Graph
    // linklabPlugin le passe directement à LinkBuilder qui attend { nodes, edges }
    const graphForPlugin = {
        nodes: compiled.nodes,
        edges,
        routes: compiled.routes,
    };
    // Si --expose-all : forcer exposed: true sur tous les nodes
    // Override la config expose compilée dans le graphe
    if (options.exposeAll) {
        graphForPlugin.nodes = graphForPlugin.nodes.map((n) => ({
            ...n,
            exposed: true,
        }));
    }
    let dataLoaderOptions;
    let mode;
    // Mode JSON
    if (config.source?.type === 'json' && config.source?.dataDir) {
        const dataDirAbs = path.resolve(cwd, config.source.dataDir);
        const dataset = {};
        for (const node of compiled.nodes) {
            const file = path.join(dataDirAbs, `${node.id}.json`);
            if (fs.existsSync(file))
                dataset[node.id] = require(file);
        }
        dataLoaderOptions = { dataset };
        mode = `json:${path.relative(cwd, dataDirAbs)}`;
        console.log('dataset keys:', Object.keys(dataset));
        console.log('movie count:', dataset['movie']?.length ?? 0);
    }
    // Mode Postgres
    else if (config.source?.type === 'postgres' || process.env.PGDATABASE) {
        const provider = new PostgresProvider({
            host: config.source?.host ?? process.env.PGHOST ?? 'localhost',
            port: parseInt(config.source?.port ?? process.env.PGPORT ?? '5432'),
            database: config.source?.database ?? process.env.PGDATABASE ?? 'postgres',
            user: config.source?.user ?? process.env.PGUSER ?? 'postgres',
            password: config.source?.password ?? process.env.PGPASSWORD ?? '',
        });
        dataLoaderOptions = { provider };
        mode = `postgres:${config.source?.database ?? process.env.PGDATABASE}`;
    }
    else {
        console.error(c(C.red, '\n  ✖  Impossible de déterminer le mode de données'));
        console.error(c(C.dim, `     Définis source.type dans ${alias}.linklab.ts\n`));
        process.exit(1);
    }
    // ── Lancer Fastify + linklabPlugin ────────────────────────
    const { default: Fastify } = await import('fastify');
    const { linklabPlugin } = await import('@linklab/core');
    const prefix = options.prefix ?? '/api';
    const app = Fastify({ logger: false });
    await app.register(linklabPlugin, {
        graph: graphForPlugin,
        compiledGraph: compiled,
        prefix,
        dataLoader: dataLoaderOptions,
    });
    try {
        await app.listen({ port, host });
    }
    catch (e) {
        console.error(c(C.red, `\n  ✖  Impossible de démarrer le serveur : ${e.message}\n`));
        process.exit(1);
    }
    // ── Output ────────────────────────────────────────────────
    const entities = compiled.nodes.map((n) => n.id);
    const routeCount = compiled.routes?.length ?? 0;
    console.log(c(C.bold + C.cyan, `\n  LinkLab Server  ·  ${mode}`));
    console.log(c(C.dim, `  ${routeCount} routes compilées  ·  ${entities.length} entités`));
    console.log();
    console.log(`  ${c(C.bold, 'URL')}  http://${host}:${port}${prefix}`);
    console.log();
    for (const entity of entities.slice(0, 8)) {
        console.log(`  ${c(C.dim, 'GET')}  http://${host}:${port}${prefix}/${entity}`);
    }
    if (entities.length > 8) {
        console.log(c(C.dim, `  … et ${entities.length - 8} entités de plus`));
    }
    console.log();
    console.log(c(C.dim, '  Ctrl+C pour arrêter\n'));
    process.on('SIGINT', async () => {
        await app.close();
        process.exit(0);
    });
}
//# sourceMappingURL=server.js.map
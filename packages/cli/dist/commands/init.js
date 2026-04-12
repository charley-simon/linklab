/**
 * init.ts — linklab init <alias>
 *
 * Crée {alias}.linklab.ts + linklab/{alias}/ structure.
 * Ne jamais écraser — afficher ce qui existe déjà.
 *
 * Usage :
 *   linklab init cinema
 *   linklab init dvdrental --source postgres://localhost/dvdrental
 */
import * as fs from 'fs';
import * as path from 'path';
import * as log from '../ui/logger.js';
// ── Template {alias}.linklab.ts ───────────────────────────────────────────────
function configTemplate(alias, opts) {
    const isPostgres = !opts.type || opts.type === 'postgres';
    return `/**
 * ${alias}.linklab.ts — Configuration LinkLab pour '${alias}'
 * defineConfig() est un pass-through pour l'autocomplétion IDE.
 */
function defineConfig<T>(config: T): T { return config }

export default defineConfig({
  alias: '${alias}',
  source: {
${isPostgres
        ? `    type: 'postgres',
    // connectionString: process.env.DATABASE_URL,
    // host: 'localhost',
    // port: 5432,
    // database: '${alias}',
    // user: 'postgres',
    // password: process.env.PGPASSWORD,`
        : `    type: 'json',
    dataDir: './data',`}
  },
  // output: {
  //   dir: './linklab/${alias}',  ← défaut automatique
  // },
})
`;
}
// ── Fichiers de l'alias ───────────────────────────────────────────────────────
const OVERRIDE_TEMPLATE = JSON.stringify({
    edges: [], // relations custom : { name, from, to, via, weight }
    nodes: {}, // enrichissement par id : { "movies": { label, icon } }
    weights: {} // poids custom : { "movies→credits": 0.5 }
}, null, 2) + '\n';
const DICTIONARY_OVERRIDE_TEMPLATE = JSON.stringify({
    "//": "Labels humains pour les routes — mergés avec dictionary.gen.json après build.",
    "//example": {
        "movies→people[actor]": { "label": "Acteurs de", "inverse": "Films avec" },
        "movies→people[director]": { "label": "Réalisé par", "inverse": "Films dirigés par" },
        "director_in→actor": { "label": "Acteurs des films dirigés par" }
    },
    routes: {}
}, null, 2) + '\n';
const USE_CASES_TEMPLATE = JSON.stringify([
    { from: 'table_a', to: 'table_b', description: 'Example use case' }
], null, 2) + '\n';
// ── Commande ──────────────────────────────────────────────────────────────────
export async function init(options = {}) {
    const cwd = process.cwd();
    // Alias requis
    const alias = options.alias;
    if (!alias) {
        console.error('\n  ✖  Alias requis : linklab init <alias>');
        console.error('     Exemple : linklab init cinema\n');
        process.exit(1);
    }
    const dir = `linklab/${alias}`;
    console.log();
    console.log(`  linklab init ${alias}`);
    console.log();
    const specs = [
        // Config
        { path: path.join(cwd, `${alias}.linklab.ts`), content: configTemplate(alias, options) },
        // Structure linklab/{alias}/
        { path: path.join(cwd, dir), content: '', isDir: true },
        { path: path.join(cwd, dir, '.linklab'), content: '', isDir: true },
        // Override JSON
        { path: path.join(cwd, dir, `${alias}.override.json`), content: OVERRIDE_TEMPLATE },
        // Dictionary override (labels humains)
        { path: path.join(cwd, dir, `${alias}.dictionary.override.json`), content: DICTIONARY_OVERRIDE_TEMPLATE },
        // Use cases
        { path: path.join(cwd, dir, `${alias}.use-cases.json`), content: USE_CASES_TEMPLATE },
    ];
    for (const spec of specs) {
        if (spec.isDir) {
            if (!fs.existsSync(spec.path)) {
                fs.mkdirSync(spec.path, { recursive: true });
            }
            continue;
        }
        const rel = path.relative(cwd, spec.path).replace(/\\/g, '/');
        if (fs.existsSync(spec.path) && !options.force) {
            log.initSkipped(rel);
        }
        else {
            const dir = path.dirname(spec.path);
            if (!fs.existsSync(dir))
                fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(spec.path, spec.content, 'utf-8');
            log.initCreated(rel);
        }
    }
    log.initDone(alias);
}
//# sourceMappingURL=init.js.map
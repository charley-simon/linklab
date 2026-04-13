/**
 * test-api.ts — Validation niveau 2 sur les 3 exemples
 *
 * Couvre les deux familles :
 *   A) Pathfinding pur   — metro, musicians (pas de données)
 *   B) Navigation data   — netflix (compiled + dataset)
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import { Graph, Strategy } from './index.js';
const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
// ── Helpers ──────────────────────────────────────────────────────────────────
const ok = (label) => console.log(`  ✅ ${label}`);
const err = (label, e) => console.log(`  ❌ ${label}: ${e?.message ?? e}`);
const sep = (title) => console.log(`\n${'─'.repeat(50)}\n${title}`);
// ── Famille A : Pathfinding pur ───────────────────────────────────────────────
sep('METRO — Pathfinding pur');
try {
    const metro = new Graph(require(`${root}/examples/metro/graph.json`));
    // Chemin optimal (Shortest)
    const r1 = metro.from('Station-chatelet').to('Station-opera').path();
    r1.found && r1.paths[0].hops > 0
        ? ok(`Châtelet→Opéra : ${r1.paths[0].hops} saut(s), poids=${r1.paths[0].weight}`)
        : err('Châtelet→Opéra', 'chemin non trouvé');
    // Mode confort — pénalise les correspondances
    const r2 = metro.from('Station-republique').to('Station-bastille')
        .paths(Strategy.Comfort());
    r2.found
        ? ok(`République→Bastille Comfort : ${r2.paths.length} chemins`)
        : err('République→Bastille', 'non trouvé');
    // Mode LeastHops
    const r3 = metro.from('Station-gare-du-nord').to('Station-montparnasse-bienvenue')
        .path(Strategy.LeastHops());
    r3.found
        ? ok(`GdN→Montparnasse LeastHops : ${r3.paths[0].hops} sauts`)
        : err('GdN→Montparnasse', 'non trouvé');
    // Introspection
    console.log(`\n  graph.entities  : ${metro.entities.length} nodes`);
    console.log(`  graph.relations : ${metro.relations.length} arêtes`);
    const types = Object.keys(metro.schema);
    console.log(`  graph.schema    : types = [${types.join(', ')}]`);
}
catch (e) {
    err('Metro init', e);
}
sep('MUSICIANS — Pathfinding avec via + minHops');
try {
    const music = new Graph(require(`${root}/examples/musicians/graph.json`));
    // Chaîne sampling Will Smith → Manu Dibango
    const r1 = music.from('artist-will-smith').to('artist-manu-dibango')
        .paths();
    r1.found
        ? ok(`Will Smith→Manu Dibango : ${r1.paths.length} chemin(s), meilleur=${r1.paths[0].hops} sauts`)
        : err('Will Smith→Manu Dibango', 'non trouvé');
    // Chemin d'influence James Brown → Kanye avec minHops
    const builder = music.from('artist-james-brown', { minHops: 1 })
        .to('artist-kanye-west');
    const r2 = builder.paths();
    r2.found
        ? ok(`James Brown→Kanye (minHops=1) : ${r2.paths.length} chemin(s)`)
        : err('James Brown→Kanye', 'non trouvé');
    // .links — vue structurelle
    const l = music.from('artist-daft-punk').to('artist-kanye-west').links;
    l.found
        ? ok(`.links Daft Punk↔Kanye : ${l.edges.length} arêtes dans le sous-graphe`)
        : err('.links', 'non trouvé');
    // Steps enrichis — labels lisibles
    if (r1.found && r1.paths[0].steps.length > 0) {
        const labels = r1.paths[0].steps.map(s => s.label ?? s.node).join(' → ');
        ok(`Steps : ${labels}`);
    }
}
catch (e) {
    err('Musicians init', e);
}
sep('NETFLIX — Navigation avec données');
try {
    const compiled = require(`${root}/examples/netflix/compiled-graph.json`);
    const movies = require(`${root}/scenarios/test-netflix/data/movies.json`);
    const credits = require(`${root}/scenarios/test-netflix/data/credits.json`);
    const people = require(`${root}/scenarios/test-netflix/data/people.json`);
    const netflix = new Graph(require(`${root}/scenarios/test-netflix/graph.json`), { compiled, dataset: { movies, credits, people } });
    // Traversée movies → people via execute()
    const r1 = await netflix.from('movies').to('people').execute({ id: 278 });
    r1.data.length > 0
        ? ok(`movies(278)→people : ${r1.data.length} personnes en ${r1.timing}ms, path=${r1.path.join('→')}`)
        : err('movies→people', 'data vide');
    // Traversée people → movies
    const r2 = await netflix.from('people').to('movies').execute({ id: 4027 });
    r2.data.length > 0
        ? ok(`people(4027)→movies : ${r2.data.length} films (${r2.data.map((m) => m.title).join(', ')})`)
        : err('people→movies', 'data vide');
    // path() fonctionne aussi (sans données)
    const r3 = netflix.from('movies').to('people').path();
    r3.found
        ? ok(`path() movies→people : ${r3.paths[0].nodes.join('→')}`)
        : err('path() movies→people', 'non trouvé');
    // Introspection
    console.log(`\n  graph.entities  : ${netflix.entities.length} nodes`);
    console.log(`  graph.weights   : ${Object.keys(netflix.weights).length} arêtes pondérées`);
}
catch (e) {
    err('Netflix init', e);
}
sep('NIVEAU 4 — Maintenance');
try {
    const music = new Graph(require(`${root}/examples/musicians/graph.json`));
    // weight().set()
    const edge = music.relations.find(e => e.name);
    const g2 = music.weight(edge.name).set(99);
    const before = music.weights[edge.name];
    const after = g2.weights[edge.name];
    before !== after && after === 99
        ? ok(`weight('${edge.name}').set(99) : ${before} → ${after}`)
        : err('weight.set', `${before} → ${after}`);
    // Immuabilité — le graph original n'est pas modifié
    music.weights[edge.name] === before
        ? ok(`Immuabilité préservée : original = ${before}`)
        : err('Immuabilité', 'graph original modifié');
    // snapshot()
    const snap = music.snapshot();
    snap.graph && !snap.compiled
        ? ok(`snapshot() : graph OK, compiled=null (pas de compile())`)
        : err('snapshot', JSON.stringify(snap));
}
catch (e) {
    err('Niveau 4', e);
}
console.log('\n' + '─'.repeat(50));
//# sourceMappingURL=test-api.js.map
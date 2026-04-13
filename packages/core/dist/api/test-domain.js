/**
 * test-domain.ts — Validation niveau 1 : DomainProxy
 *
 * Couvre :
 *   - Accès propriété simple       cinema.movies
 *   - Filtre par ID (number)       cinema.people(278)
 *   - Filtre par objet             cinema.people({ id: 278 })
 *   - Traversée thenable           await cinema.people(278).movies
 *   - Fetch direct                 await cinema.movies
 *   - Chaînage profond             await cinema.people(278).movies (depth 2)
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import { Graph } from './index.js';
const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const ok = (label) => console.log(`  ✅ ${label}`);
const err = (label, detail) => console.log(`  ❌ ${label}: ${detail?.message ?? JSON.stringify(detail)}`);
const sep = (t) => console.log(`\n${'─'.repeat(50)}\n${t}`);
// ── Setup Netflix ─────────────────────────────────────────────────────────────
const compiled = require(`${root}/examples/netflix/compiled-graph.json`);
const movies = require(`${root}/scenarios/test-netflix/data/movies.json`);
const credits = require(`${root}/scenarios/test-netflix/data/credits.json`);
const people = require(`${root}/scenarios/test-netflix/data/people.json`);
const cinema = new Graph(require(`${root}/scenarios/test-netflix/graph.json`), { compiled, dataset: { movies, credits, people } }).domain();
sep('NIVEAU 1 — Fetch direct (depth 1)');
try {
    // await cinema.movies → tous les films
    const r1 = await cinema.movies;
    r1.data.length > 0
        ? ok(`await cinema.movies → ${r1.data.length} films`)
        : err('cinema.movies', 'vide');
    // await cinema.people → toutes les personnes
    const r2 = await cinema.people;
    r2.data.length > 0
        ? ok(`await cinema.people → ${r2.data.length} personnes`)
        : err('cinema.people', 'vide');
    // await cinema.movies(278) → un seul film
    const r3 = await cinema.movies(278);
    r3.data.length === 1 && r3.data[0].title === 'Les Évadés'
        ? ok(`await cinema.movies(278) → "${r3.data[0].title}"`)
        : err('cinema.movies(278)', r3.data);
    // await cinema.people(4027) → Frank Darabont
    const r4 = await cinema.people(4027);
    r4.data.length === 1 && r4.data[0].name === 'Frank Darabont'
        ? ok(`await cinema.people(4027) → "${r4.data[0].name}"`)
        : err('cinema.people(4027)', r4.data);
    // Filtre par objet
    const r5 = await cinema.people({ id: 4027 });
    r5.data.length === 1
        ? ok(`await cinema.people({ id: 4027 }) → "${r5.data[0].name}"`)
        : err('cinema.people({id:4027})', r5.data);
}
catch (e) {
    err('Depth 1', e);
}
sep('NIVEAU 1 — Traversée (depth 2)');
try {
    // await cinema.people(4027).movies → filmographie Darabont
    const r1 = await cinema.people(4027).movies;
    r1.data.length >= 2
        ? ok(`await cinema.people(4027).movies → ${r1.data.length} films : ${r1.data.map((m) => m.title).join(', ')}`)
        : err('cinema.people(4027).movies', `${r1.data.length} films`);
    // await cinema.movies(278).people → cast des Évadés
    const r2 = await cinema.movies(278).people;
    r2.data.length >= 10
        ? ok(`await cinema.movies(278).people → ${r2.data.length} personnes`)
        : err('cinema.movies(278).people', `${r2.data.length}`);
    // Trail path
    r1.path.length > 1
        ? ok(`path: ${r1.path.join('→')}`)
        : err('path', r1.path);
}
catch (e) {
    err('Depth 2', e);
}
sep('NIVEAU 1 — Clé sémantique (string filter)');
try {
    // await cinema.movies('Les Évadés') → via title
    // Le semantic_key pour movies devrait être 'title'
    const r1 = await cinema.movies({ title: 'Les Évadés' });
    r1.data.length === 1
        ? ok(`await cinema.movies({ title: 'Les Évadés' }) → id=${r1.data[0].id}`)
        : err('cinema.movies({title})', `${r1.data.length} résultats`);
}
catch (e) {
    err('Semantic key', e);
}
sep('NIVEAU 1 — Musicians (nodes par type)');
try {
    const music = new Graph(require(`${root}/examples/musicians/graph.json`)).domain();
    // Les musicians ont type='artist' — pas de données, juste des nodes
    // cinema.artists → devrait résoudre le type 'artist'
    const node = music.artists;
    node !== undefined
        ? ok(`cinema.artists → DomainNode résolu (entity=${node.entity})`)
        : err('cinema.artists', 'undefined');
}
catch (e) {
    err('Musicians domain', e);
}
console.log('\n' + '─'.repeat(50));
//# sourceMappingURL=test-domain.js.map
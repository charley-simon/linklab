## Domain Concepts

DomainNode
DomainProxy (createDomain)
resolveEntity
CompiledGraph.routes (semantic label)
QueryEngine (semantic option)

## Related Use Cases

UC-Q3 — SQL sémantique avec condition jobId
UC-C2 — Routes sémantiques compilées
UC-N2 — Mode NAVIGATE (Trail)

---

🎯 Objectif

Garantir que `DomainNode` résout les labels sémantiques (`actor`, `director`,
`writer`) comme points d'entrée navigables, en s'appuyant sur le
`compiledGraph` plutôt que sur les nœuds du raw-graph.

Sans ce UC, `cinema.directors('Nolan').movies` retourne `undefined`
car `directors` n'est pas un nœud dans le raw-graph — c'est un label
de route sémantique dans le compilé. La distinction
`people('Tarantino')` vs `directors('Tarantino')` vs `actors('Tarantino')`
ne fonctionne pas.

📥 Entrée

API testée :
```typescript
import { Graph } from '@linklab/core'

const cinema = new Graph(rawGraph, { compiled, dataset })

// Navigation via label sémantique
await cinema.directors('Nolan').movies
await cinema.actors('DiCaprio').movies
await cinema.people('Nolan').movies

// Navigation inverse
await cinema.movies(278).actors
await cinema.movies(278).directors
await cinema.movies(278).people
```

CompiledGraph avec routes sémantiques (extrait) :
```typescript
// Route sémantique people → movies [director_in]
{
  from: 'people', to: 'movies',
  semantic: true, label: 'director_in',
  primary: {
    path: ['people', 'credits', 'movies'],
    edges: [
      { fromCol: 'id', toCol: 'personId', condition: { jobId: 2 } },
      { fromCol: 'movieId', toCol: 'id' }
    ],
    weight: 0.1, joins: 2, avgTime: 0.1
  }
}

// Route sémantique movies → people [actor]
{
  from: 'movies', to: 'people',
  semantic: true, label: 'actor',
  primary: {
    path: ['movies', 'credits', 'people'],
    edges: [
      { fromCol: 'id', toCol: 'movieId', condition: { jobId: 1 } },
      { fromCol: 'personId', toCol: 'id' }
    ],
    weight: 0.1, joins: 2, avgTime: 0.1
  }
}
```

Dataset :
```typescript
{
  movies:  [{ id: 278, title: 'Shawshank' }, { id: 680, title: 'Pulp Fiction' }],
  credits: [
    { id: 1, movieId: 278, personId: 1, jobId: 1 }, // actor
    { id: 2, movieId: 278, personId: 2, jobId: 2 }, // director
    { id: 3, movieId: 680, personId: 2, jobId: 2 }, // director
  ],
  people: [
    { id: 1, name: 'Tim Robbins' },
    { id: 2, name: 'Frank Darabont' },
  ],
}
```

⚙️ Traitement attendu

**Correction dans `resolveEntity(prop, graphData, compiled?)` :**

Ajouter un 4ème cas après les 3 existants :
```
1. ID direct dans graphData.nodes           → 'movies', 'people'
2. Type singulier dans graphData.nodes      → 'artist'
3. Pluriel → singulier dans graphData.nodes → 'artists' → 'artist'
4. Label sémantique dans compiled.routes    → 'director', 'actor', 'writer'
   → retourner { entity: r.to, semantic: r.label }
```

Pour le cas 4 :
- Chercher `compiled.routes.find(r => r.label === prop && r.semantic)`
- Si trouvé : retourner `r.to` comme entity, mémoriser `r.label` comme
  paramètre semantic à passer au QueryEngine lors de `_fetchViaRoute`

**Comportement attendu :**

`cinema.directors('Nolan').movies` :
1. `resolveEntity('directors', graphData, compiled)` → route `label='director_in'`, entity=`'people'`
2. `DomainNode(entity='people', filters={name:'Nolan'}, semantic='director_in')`
3. `.movies` → `DomainNode(entity='movies', parent=people)`
4. `_fetchViaRoute` → `QueryEngine.executeInMemory({ from:'people', to:'movies', semantic:'director_in' })`
5. → films où Nolan est crédité jobId=2 uniquement

`cinema.people('Nolan').movies` :
- Même chemin mais sans `semantic` → tous les films où Nolan apparaît

📤 Sortie

```typescript
// cinema.directors('Nolan').movies → films réalisés par Nolan seulement
[{ id: 278, title: 'Shawshank' }, { id: 680, title: 'Pulp Fiction' }]
// (Frank Darabont = personId:2, jobId:2 dans les deux films)

// cinema.actors('DiCaprio').movies → films où DiCaprio est acteur
// (Tim Robbins = personId:1, jobId:1)
[{ id: 278, title: 'Shawshank' }]

// cinema.people('Darabont').movies → TOUS les films (jobId ignoré)
[{ id: 278, title: 'Shawshank' }, { id: 680, title: 'Pulp Fiction' }]

// cinema.movies(278).directors → réalisateurs du film 278
[{ id: 2, name: 'Frank Darabont' }]

// cinema.movies(278).actors → acteurs du film 278
[{ id: 1, name: 'Tim Robbins' }]

// cinema.movies(278).people → tous les crédités du film 278
[{ id: 1, name: 'Tim Robbins' }, { id: 2, name: 'Frank Darabont' }]
```

📏 Critères

- `cinema.directors('X')` résout via `compiled.routes` label `director_in` — pas d'erreur
- `cinema.actors('X')` résout via `compiled.routes` label `actor_in` — pas d'erreur
- `cinema.people('X')` résout via route physique — comportement inchangé
- Résultats `directors('X').movies` ⊆ résultats `people('X').movies`
- Résultats `actors('X').movies` ⊆ résultats `people('X').movies`
- `directors('X').movies` ≠ `actors('X').movies` si la personne a les deux rôles
- `cinema.movies(278).actors` retourne uniquement jobId=1
- `cinema.movies(278).directors` retourne uniquement jobId=2
- `cinema.movies(278).people` retourne tous (jobId ignoré)
- Sans `compiledGraph` : `cinema.directors('X')` retourne `undefined` silencieusement

Cas de test

[D1.1] cinema.directors('Darabont').movies → films réalisés (jobId=2) → ✓
[D1.2] cinema.actors('Robbins').movies → films joués (jobId=1) → ✓
[D1.3] cinema.people('Darabont').movies → tous films (physique, jobId ignoré) → ✓
[D1.4] résultats directors ⊆ résultats people pour même personne → ✓
[D1.5] résultats actors ⊆ résultats people pour même personne → ✓
[D1.6] cinema.movies(278).actors → Tim Robbins uniquement → ✓
[D1.7] cinema.movies(278).directors → Frank Darabont uniquement → ✓
[D1.8] cinema.movies(278).people → Tim + Frank (tous) → ✓
[D1.9] sans compiledGraph : cinema.directors('X') → undefined (pas d'exception) → ✓
[D1.10] label inexistant → undefined silencieux (pas d'exception) → ✓

---

## Architecture Context

```
cinema.directors('Nolan').movies
  ↓ createDomain() → Proxy
  ↓ resolveEntity('directors', graphData, compiled)
       cas 4 : compiled.routes.find(r => r.label === 'director_in' && r.semantic)
       → { entity: 'people', semantic: 'director_in' }
  ↓ makeCallableDomainNode('people', {}, null, ctx, semantic='director_in')
  ↓ appel('Nolan') → DomainNode('people', {name:'Nolan'}, null, semantic='director_in')
  ↓ .movies → DomainNode('movies', {}, parent=people)
  ↓ await → _fetchViaRoute(anchor=people, current=movies)
  ↓ QueryEngine.executeInMemory({ from:'people', to:'movies', semantic:'director_in' })
  ↓ → SQL avec AND credits.jobId = 2
  ↓ → films réalisés uniquement
```

Note : `director_in` est le label pour `people → movies` (sens inverse).
`director` est le label pour `movies → people`.
La convention `_in` est générée par le pipeline pour les arêtes inverses.

## Dependencies

DomainNode (correction resolveEntity — cas 4)
CompiledGraph avec routes sémantiques (UC-C2)
QueryEngine v2 avec option semantic (UC-Q3)

## Failure Modes

`compiled` absent (Graph construit sans compiledGraph)
→ cas 4 ignoré, `directors` retourne `undefined`
→ comportement dégradé acceptable — pas d'exception

Label présent dans compiled mais QueryEngine ne trouve pas la route
→ `_fetchViaRoute` lève une erreur "Route inconnue"
→ fallback vers fetch direct sur l'entité courante (comportement existant)

Confusion `director` vs `director_in` selon le sens de navigation
→ `cinema.directors('X')` part de `people` → label `director_in`
→ `cinema.movies(278).directors` part de `movies` → label `director`
→ `resolveEntity` doit chercher dans TOUTES les routes du nœud courant

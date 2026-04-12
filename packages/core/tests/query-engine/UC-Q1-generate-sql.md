## Domain Concepts

QueryEngine
CompiledGraph
RouteInfo
QueryOptions

## Related Use Cases

UC-C1 — Routes physiques (fournit le CompiledGraph)
UC-Q2 — executeInMemory
UC-Q3 — SQL sémantique avec condition

---

🎯 Objectif

Garantir que `QueryEngine.generateSQL()` produit un SQL correct
avec les bonnes clauses INNER JOIN et WHERE, depuis une route
précalculée dans le `CompiledGraph`.

C'est le pont entre le graphe compilé et la base de données réelle.
Un SQL incorrect = données erronées retournées sans erreur visible.
Un SQL avec les mauvaises colonnes = requête qui plante en production.

📥 Entrée

API testée :
```
engine.generateSQL(options: QueryOptions): string

QueryOptions {
  from:     string
  to:       string
  filters?: Record<string, any>
}
```

CompiledGraph minimal utilisé :
```typescript
// Route movies → people via credits
{
  from: 'movies', to: 'people',
  primary: {
    path:  ['movies', 'credits', 'people'],
    edges: [
      { fromCol: 'id',       toCol: 'movieId'   },
      { fromCol: 'personId', toCol: 'id'        }
    ],
    weight: 2, joins: 2, avgTime: 2
  },
  fallbacks: [], alternativesDiscarded: 0
}

// Route departments → movies (3 jointures)
{
  from: 'departments', to: 'movies',
  primary: {
    path:  ['departments', 'jobs', 'credits', 'movies'],
    edges: [
      { fromCol: 'id',    toCol: 'departmentId' },
      { fromCol: 'id',    toCol: 'jobId'        },
      { fromCol: 'movieId', toCol: 'id'         }
    ],
    weight: 3, joins: 3, avgTime: 3
  },
  fallbacks: [], alternativesDiscarded: 0
}
```

⚙️ Traitement attendu

1. Récupère la route via `getRoute(from, to)`
2. Construit `SELECT {to}.* FROM {from}`
3. Pour chaque edge dans `primary.edges` :
   `INNER JOIN {path[i+1]} ON {path[i]}.{fromCol} = {path[i+1]}.{toCol}`
4. Ajoute `WHERE {from}.{key} = {val}` pour chaque filtre
   - string → valeur entre quotes
   - number → valeur sans quotes

📤 Sortie

```sql
-- movies → people, filter id=278
SELECT people.*
FROM movies
  INNER JOIN credits ON movies.id = credits.movieId
  INNER JOIN people  ON credits.personId = people.id
WHERE movies.id = 278

-- departments → movies, filter name='Directing'
SELECT movies.*
FROM departments
  INNER JOIN jobs    ON departments.id = jobs.departmentId
  INNER JOIN credits ON jobs.id = credits.jobId
  INNER JOIN movies  ON credits.movieId = movies.id
WHERE departments.name = 'Directing'
```

📏 Critères

- `SELECT {to}.*` — toujours la table cible
- `FROM {from}` — toujours la table source
- Autant de `INNER JOIN` que `primary.edges.length`
- Chaque JOIN utilise exactement `fromCol` et `toCol` de l'edge
- Filtre string → `= 'valeur'` avec quotes
- Filtre number → `= 42` sans quotes
- Sans filtres → pas de clause WHERE
- Route inexistante → lève une Error (pas null)

Cas de test

[Q1.1] route 2 jointures : SQL avec 2 INNER JOIN corrects → ✓
[Q1.2] route 3 jointures : SQL avec 3 INNER JOIN corrects → ✓
[Q1.3] filtre numérique : WHERE movies.id = 278 (sans quotes) → ✓
[Q1.4] filtre string : WHERE departments.name = 'Directing' (avec quotes) → ✓
[Q1.5] sans filtre : pas de clause WHERE → ✓
[Q1.6] plusieurs filtres : WHERE a = 1 AND b = 'x' → ✓
[Q1.7] route inexistante : lève Error 'No route found' → ✓

---

## Architecture Context

```
linklabPlugin (Fastify) :
  GET /api/movies/278/people
  → Trail [{table:'movies',id:278}, {table:'people'}]
  → engine.generateSQL({ from:'movies', to:'people', filters:{id:278} })
  → SQL exécuté sur PostgresProvider
  → JSON + _links HATEOAS

dvdrental run.ts :
  dvd.customer(1).rentals.film.actors
  → generateSQL({ from:'customer', to:'film', filters:{customer_id:1} })
```

## Dependencies

CompiledGraph.routes (RouteInfo[])
RouteInfo.primary.path
RouteInfo.primary.edges (fromCol, toCol)

## Failure Modes

Route non compilée (paire absente de compiled.routes)
→ Error lancée — l'appelant doit gérer

Edge sans fromCol ou toCol
→ SQL invalide généré silencieusement (JOIN ON undefined)
→ protection à ajouter : valider edges avant génération

Filtre avec valeur null/undefined
→ comportement non défini — ne pas utiliser

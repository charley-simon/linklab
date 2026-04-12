## Domain Concepts

GraphCompiler v2
semantic_view
RouteInfo
RouteStep.condition
MetricsMap

## Related Use Cases

UC-C1 — Routes physiques
UC-Q3 — SQL sémantique avec condition

---

🎯 Objectif

Garantir que `GraphCompiler v2` compile les edges `semantic_view`
en routes sémantiques avec leur condition SQL embarquée
(`condition: { jobId: 1 }`), distinctes des routes physiques.

Sans routes sémantiques, `cinema.movies(5).actors` ne peut pas
être distingué de `cinema.movies(5).people` — les deux retournent
tout le monde sans filtre. Les 56 vues sémantiques de Netflix
(une par job × 2 directions) deviennent navigables dans le TUI
et exploitables via `QueryEngine({ semantic: 'actor' })`.

📥 Entrée

API testée :
```
compiler.compile(graph: Graph, metrics: MetricsMap): CompiledGraph
```

Graphe utilisé :
```
SEMANTIC_MINI — 4 nœuds, 3 edges :
  movies → credits    (physical,   via: 'movieId')
  credits → people    (physical,   via: 'personId')
  movies → people     (semantic_view, via: 'credits',
                       condition: { jobId: 1 }, label: 'actor')
```

Edge semantic_view format :
```typescript
{
  from: 'movies', to: 'people',
  via:  'credits',
  weight: 0.1,
  metadata: {
    type:      'semantic_view',
    condition: { jobId: 1 },
    label:     'actor'
  }
}
```

⚙️ Traitement attendu

GraphCompiler v2 fait deux passes :

**Passe 1 — Routes physiques** (identique UC-C1)
- Traite les edges dont `metadata.type !== 'semantic_view'`
- Produit les routes physiques standards

**Passe 2 — Routes sémantiques**
- Traite les edges dont `metadata.type === 'semantic_view'`
- Pour chaque edge sémantique `movies → people [actor]` :
  1. Trouve le chemin physique via `credits` :
     `['movies', 'credits', 'people']`
  2. Injecte la `condition` sur le bon step (le step qui traverse `credits`)
  3. Crée une `RouteInfo` avec `semantic: true`, `label: 'actor'`
- Les deux passes sont additives → `compiled.routes` contient physical + semantic

La condition est injectée sur le **premier edge** du chemin qui traverse
la table de jonction (`credits`), pas sur le dernier :
```
movies → credits : { fromCol: 'id', toCol: 'movieId', condition: { jobId: 1 } }
credits → people : { fromCol: 'personId', toCol: 'id' }
```

📤 Sortie

Route sémantique `movies → people [actor]` :
```typescript
{
  from: 'movies', to: 'people',
  semantic: true,
  label: 'actor',
  primary: {
    path:  ['movies', 'credits', 'people'],
    edges: [
      { fromCol: 'id', toCol: 'movieId', condition: { jobId: 1 }, label: 'actor' },
      { fromCol: 'personId', toCol: 'id' }
    ],
    weight:  0.1,
    joins:   2,
    avgTime: 0.1
  },
  fallbacks: [],
  alternativesDiscarded: 0
}
```

📏 Critères

- Les routes physiques et sémantiques coexistent dans `compiled.routes`
- Une route sémantique a `semantic: true` et `label` défini
- La `condition` est injectée sur le step qui traverse la table de jonction
- `primary.edges[step].condition` contient le filtre exact de l'edge source
- La route sémantique a un poids ≤ à la route physique équivalente
  (car `semantic_view` edges ont `weight: 0.1` — priorité maximale)
- Netflix : 20 routes physiques + 56 sémantiques = 76 routes au total

Cas de test

[C2.1] edge semantic_view compilé : RouteInfo avec semantic=true, label='actor' → ✓
[C2.2] condition injectée sur bon step : edges[0].condition = { jobId: 1 } → ✓
[C2.3] route sémantique et physique coexistent pour même paire → ✓
[C2.4] poids route sémantique ≤ poids route physique → ✓
[C2.5] graphe sans semantic_view : 0 routes sémantiques (pas d'exception) → ✓
[C2.6] Netflix après migration : compiled.routes.length === 76 → ✓

---

## Architecture Context

```
QueryEngine v2 :
  engine.generateSQL({ from:'movies', to:'people', semantic:'actor' })
  → cherche route avec r.semantic=true && r.label==='actor'
  → génère :
    INNER JOIN credits ON movies.id = credits.movieId AND credits.jobId = 1
    INNER JOIN people  ON credits.personId = people.id

TUI Explorer :
  LinkLabTUIAdapter lit les routes sémantiques
  → affiche 'actor', 'director', 'writer' comme sous-nœuds distincts
  → au lieu d'un seul nœud 'people' générique
```

## Dependencies

GraphCompiler v1 (passe 1 — routes physiques)
PathFinder (findShortestPath — trouve le chemin physique sous-jacent)
GraphEdge.metadata.condition
GraphEdge.metadata.label

## Failure Modes

Edge semantic_view sans chemin physique sous-jacent
→ route sémantique ignorée (warning dans linklab build)

condition: null ou undefined
→ route compilée sans condition → SQL sans filtre → données incorrectes
→ CRITIQUE : valider que condition est non-null avant injection

label absent
→ route sémantique sans label → TUI ne peut pas la distinguer
→ fallback : utiliser edge.via comme label

## Observability Impact

GraphCompiler v2

Impact:
semantic routes enable fine-grained navigation (actor vs director)
without them, all credits resolve to 'people' with no job filter
56 semantic routes for Netflix = 56 new navigation possibilities

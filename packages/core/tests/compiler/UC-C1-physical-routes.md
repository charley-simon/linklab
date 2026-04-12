## Domain Concepts

GraphCompiler
PathFinder
CompiledGraph
RouteInfo
MetricsMap

## Related Use Cases

UC-P1 — findShortestPath (utilisé en interne)
UC-C2 — Routes sémantiques v2
UC-C3 — Pas de doublons d'inverses (fix metro)

---

🎯 Objectif

Garantir que `GraphCompiler.compile()` produit un `CompiledGraph`
avec les routes physiques correctes — chemin optimal, edges SQL résolus,
poids cohérents, fallbacks — depuis un graphe brut et des métriques
d'entraînement.

C'est la brique centrale du pipeline `linklab build` : sans compilation
correcte, `QueryEngine` génère du SQL invalide, le TUI affiche de mauvaises
relations, et toute la navigation est compromise.

📥 Entrée

API testée :
```
compiler.compile(graph: Graph, metrics: MetricsMap): CompiledGraph
GraphCompiler.getStats(compiled: CompiledGraph): CompilationStats
```

Options constructeur :
```typescript
new GraphCompiler({
  weightThreshold?: number,   // seuil d'élagage (défaut: 1000)
  keepFallbacks?:   boolean,  // garder les routes alternatives (défaut: true)
  maxFallbacks?:    number,   // max d'alternatives par route (défaut: 2)
})
```

Graphes utilisés (construits en mémoire) :
```
SIMPLE — 3 nœuds, 2 edges FK :
  movies → credits (via movieId)
  credits → people (via personId)

WEIGHTED — 3 nœuds, chemin direct + indirect :
  A → B (weight 1) → C (weight 1)   chemin ABc poids 2
  A → C (weight 5)                   chemin direct poids 5

MULTI — 4 nœuds, Netflix minimal :
  departments → jobs (via departmentId)
  jobs → credits (via jobId)
  credits → movies (via movieId)
  credits → people (via personId)
```

⚙️ Traitement attendu

1. Extrait tous les nœuds uniques depuis les edges du graphe
2. Génère toutes les paires `(from, to)` distinctes
3. Pour chaque paire : appelle `PathFinder.findAllPaths(from, to, 5)`
4. Si aucun chemin → paire ignorée (pas dans `compiled.routes`)
5. Pour chaque chemin trouvé :
   - Calcule le poids depuis les métriques (`metric.avgTime`) ou
     depuis les poids théoriques des edges
   - Filtre : `failed=false`, `weight ≤ weightThreshold`, `used=true`
6. Trie par poids croissant → `primary` = meilleur, `fallbacks` = suivants
7. Résout les colonnes SQL via `resolveEdges()` :
   - Si `edge.from === from` → `fromCol = edge.via`, `toCol = 'id'`
   - Sinon (edge inversé) → `fromCol = 'id'`, `toCol = edge.via`
8. Retourne `CompiledGraph` avec `nodes`, `routes`, `stats`, `version`

📤 Sortie

```typescript
CompiledGraph {
  version:    '1.0.0'
  compiledAt: string     // ISO date
  nodes:      GraphNode[]
  routes:     RouteInfo[]
  stats: {
    totalPairs:      number
    routesCompiled:  number
    routesFiltered:  number
    compressionRatio: string  // ex: '40.0%'
  }
}
```

RouteInfo pour `movies → people` via credits :
```typescript
{
  from: 'movies', to: 'people',
  primary: {
    path:    ['movies', 'credits', 'people'],
    edges:   [
      { fromCol: 'movieId', toCol: 'id' },
      { fromCol: 'personId', toCol: 'id' }
    ],
    weight:  2,
    joins:   2,
    avgTime: 2
  },
  fallbacks: [],
  alternativesDiscarded: 0
}
```

📏 Critères

- Toute paire de nœuds connectés produit une `RouteInfo` dans `routes`
- Les paires non connectées sont absentes de `routes` (pas dans `routes` avec null)
- `primary.path[0] === from` et `primary.path[last] === to`
- `primary.joins === primary.path.length - 1`
- `primary.edges.length === primary.joins`
- `primary.weight` est le poids minimal parmi tous les chemins valides
- Avec métriques : utilise `metric.avgTime` si disponible et valide
- Sans métriques : utilise le poids théorique (somme des `edge.weight`)
- `stats.routesCompiled + stats.routesFiltered === stats.totalPairs`
- `compiled.nodes` contient exactement les nœuds du graphe source

Cas de test

[C1.1] graphe simple A→B→C : route A→C compilée avec path=['A','B','C'], joins=2 → ✓
[C1.2] deux chemins A→C : primary = chemin de poids minimal → ✓
[C1.3] paire non connectée : absente de routes → ✓
[C1.4] edges SQL résolus : fromCol/toCol corrects depuis edge.via → ✓
[C1.5] avec métriques avgTime : poids = metric.avgTime → ✓
[C1.6] sans métriques : poids = somme edge.weight → ✓
[C1.7] keepFallbacks=true : fallbacks présents si chemins alternatifs → ✓
[C1.8] keepFallbacks=false : fallbacks=[] même si alternatives existent → ✓
[C1.9] stats cohérentes : routesCompiled + routesFiltered = totalPairs → ✓
[C1.10] weightThreshold=1 : filtre les chemins de poids > 1 → ✓

---

## Architecture Context

```
linklab build :
  GraphAssembler → raw-graph.json
  GraphTrainer   → MetricsMap
  GraphCompiler.compile(rawGraph, metrics)
  → compiled-graph.json

QueryEngine :
  const engine = new QueryEngine(compiledGraph)
  engine.generateSQL({ from:'movies', to:'people', filters:{id:278} })
  → lit compiled.routes.find(r => r.from==='movies' && r.to==='people')
  → construit SQL depuis primary.path + primary.edges
```

Les colonnes `fromCol`/`toCol` dans `primary.edges` sont exactement
les arguments des clauses `INNER JOIN` générées par `QueryEngine`.
Une erreur dans `resolveEdges()` = mauvais SQL = données incorrectes.

## Dependencies

PathFinder (findAllPaths)
Graph (nodes + edges)
MetricsMap (TrainingMetrics par clé 'from→via→to')

## Failure Modes

Graphe vide (0 edges)
→ compiled.routes = [] (pas d'exception)

Métriques avec avgTime = NaN
→ fallback sur poids théorique

weightThreshold trop bas
→ toutes les routes filtrées → compiled.routes = []
→ QueryEngine ne trouve aucune route → SQL impossible

Edge sans `via`
→ resolveEdges() utilise le fallback : `fromCol='id'`, `toCol='${from}Id'`

## Observability Impact

GraphCompiler

Impact:
compiled route count determines navigation breadth
missing route = QueryEngine returns null = HTTP 404
wrong edge metadata = invalid SQL = HTTP 500

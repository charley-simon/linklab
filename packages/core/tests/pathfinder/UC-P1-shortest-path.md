## Domain Concepts

PathFinder
GraphEdge
PathDetails
Graph

## Related Use Cases

UC-P2 — Chemin inexistant
UC-P3 — Chemin indirect multi-sauts
UC-P4 — Plusieurs chemins (findAllPaths)

---

🎯 Objectif

Garantir que `findShortestPath()` retourne le chemin optimal entre
deux nœuds en utilisant l'algorithme de Dijkstra.

C'est le contrat fondamental de PathFinder : étant donné un graphe
pondéré, trouver le chemin qui minimise la somme des poids des edges
traversés. Sans cette garantie, toute navigation LinkLab pourrait
emprunter des routes sous-optimales silencieusement — le mauvais
réalisateur associé à un film, la mauvaise ligne de métro choisie.

📥 Entrée

API testée :
```
finder.findShortestPath(from: string, to: string): PathDetails | null
```

PathDetails :
```typescript
{
  path:     string[]    // nœuds ordonnés de from à to
  edges:    GraphEdge[] // edges traversés
  weight:   number      // somme des poids
  joins:    number      // path.length - 1
  indirect: boolean     // path.length > 2
}
```

Graphes utilisés (construits en mémoire) :
```
LINEAR    — A→B (1) → C (1) → D (1)            poids total 3
TWO_PATHS — A→B (1) → D (1)   poids 2 ← optimal
            A→C (1) → D (3)   poids 4
```

⚙️ Traitement attendu

1. Initialise `dist[from] = 0`, `dist[*] = Infinity`
2. À chaque itération : prend le nœud non visité avec `dist` minimal
3. Pour chaque voisin : si `dist[current] + edge.weight < dist[neighbor]`
   → met à jour `dist[neighbor]` et `prev[neighbor]`
4. Reconstruit le chemin en remontant `prev` depuis `to`
5. Retourne `PathDetails` complet

Invariant Dijkstra : le premier chemin trouvé vers `to` est optimal.
Sur un graphe sans poids négatifs, la garantie est absolue.

📤 Sortie

```typescript
PathDetails | null
```

Null si `to` est inatteignable depuis `from`.

📏 Critères

- `path[0] === from` et `path[path.length-1] === to`
- `weight` = somme exacte des `edge.weight` traversés
- `joins === path.length - 1`
- `indirect === (path.length > 2)`
- Sur deux chemins possibles : choisit toujours celui de poids minimal
- `findShortestPath(A, A)` → `{ path: ['A'], weight: 0, joins: 0 }`

Cas de test

[P1.1] chemin direct A→B→C→D : path=['A','B','C','D'], weight=3, joins=3 → ✓
[P1.2] deux chemins disponibles : choisit A→B→D (poids 2) et non A→C→D (poids 4) → ✓
[P1.3] nœuds adjacents A→B : path=['A','B'], joins=1, indirect=false → ✓
[P1.4] nœud vers lui-même A→A : path=['A'], weight=0, joins=0 → ✓

---

## Architecture Context

PathFinder est utilisé par :
- `GraphCompiler.compile()` — phase 1 (routes physiques)
- `Graph.from().to().path()` — API niveau 2
- `train-netflix.ts` — phase d'entraînement

```
Graph (raw)
  → PathFinder.findShortestPath()
  → PathDetails
  → GraphCompiler (pondération)
  → compiled-graph.json
```

## Dependencies

Graph (nodes + edges)
GraphEdge.weight

## Failure Modes

Nœud `from` ou `to` absent du graphe
→ retourne null (pas d'exception)

Graphe vide
→ retourne null

Poids négatif
→ comportement non garanti (Dijkstra non conçu pour ça)

## Observability Impact

PathFinder

Impact:
route quality directly affects QueryEngine SQL
wrong path = wrong JOIN chain = wrong data returned

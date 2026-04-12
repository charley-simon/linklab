## Domain Concepts

PathFinder
Graph
PathDetails

## Related Use Cases

UC-P2 — Chemin inexistant

---

🎯 Objectif

Garantir que PathFinder se comporte proprement dans les cas limites :
nœud isolé, graphe vide, nœud inexistant, et que les méthodes
utilitaires (`getReachableNodes`, `getStats`) retournent des valeurs
correctes.

Ces cas ne surviennent pas dans la navigation normale mais peuvent
apparaître lors de la construction d'un graphe (`linklab build`),
d'un override mal formé, ou d'un scénario de test. L'absence de
gestion propre génère des exceptions difficiles à diagnostiquer.

📥 Entrée

API testée :
```
finder.getReachableNodes(from: string): Set<string>
finder.getStats(): { nodes: number, edges: number, avgDegree: number }
finder.findShortestPath(from, to): PathDetails | null
finder.hasPath(from, to): boolean
```

Graphes utilisés :
```
ISOLATED : A→B (1), C sans edges
EMPTY    : aucun node, aucun edge
LINEAR   : A→B→C→D
```

⚙️ Traitement attendu

`getReachableNodes(from)` :
- BFS/DFS depuis `from`
- Retourne tous les nœuds accessibles (excluant `from` lui-même)
- Si `from` est isolé → retourne `Set` vide

`getStats()` :
- `nodes` = nombre de nœuds dans le graphe
- `edges` = nombre d'edges
- `avgDegree` = `edges / nodes` (0 si nodes = 0)

Cas dégénérés :
- Graphe vide → pas d'exception sur aucune méthode
- Nœud inexistant dans `findShortestPath` → null

📤 Sortie

```typescript
getReachableNodes('C') // C isolé → Set{}
getReachableNodes('A') // LINEAR  → Set{'B','C','D'}
getStats()             // LINEAR  → { nodes:4, edges:3, avgDegree:0.75 }
```

📏 Critères

- `getReachableNodes` d'un nœud isolé → `Set` vide (pas null)
- `getReachableNodes` ne contient pas le nœud `from` lui-même
- `getStats()` sur graphe vide → `{ nodes:0, edges:0, avgDegree:0 }` (pas d'exception)
- `findShortestPath` sur nœud inexistant → null (pas de KeyError)
- `hasPath` sur nœud inexistant → false

Cas de test

[P10.1] getReachableNodes depuis nœud isolé C : retourne Set{} → ✓
[P10.2] getReachableNodes depuis A dans LINEAR : contient B, C, D — pas A → ✓
[P10.3] getStats() sur LINEAR : nodes=4, edges=3, avgDegree > 0 → ✓
[P10.4] findShortestPath sur graphe vide : retourne null sans exception → ✓

---

## Architecture Context

```
linklab build — GraphCompiler :
  finder.getReachableNodes(root)
  → détecte les nœuds isolés → warning dans linklab build output

linklab status :
  finder.getStats()
  → affiche nodes/edges/avgDegree dans le résumé du projet
```

## Dependencies

Graph (nodes + edges)

## Failure Modes

`from` absent du graphe dans `getReachableNodes`
→ Set{} (pas d'exception)

Division par zéro dans `avgDegree` si nodes = 0
→ retourner 0 explicitement

## Observability Impact

PathFinder.getStats()

Impact:
avgDegree is a graph health indicator
low avgDegree = sparse graph = fewer route options
used by linklab status to detect disconnected subgraphs

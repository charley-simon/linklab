## Domain Concepts

PathFinder
Path
ResolvedPath

## Related Use Cases

UC-P1 — Chemin le plus court
UC-P5 — TransferPenalty
UC-P6 — Via filter
UC-P7 — MinHops

---

🎯 Objectif

Garantir que `findAllPaths()` retourne plusieurs chemins alternatifs
triés par poids croissant, dans la limite de `maxPaths`.

LinkLab expose des alternatives à l'utilisateur : le métro propose
3 itinéraires, musicians affiche plusieurs chaînes d'influence.
La qualité du tri garantit que le meilleur chemin est toujours en
position [0] — l'utilisateur voit d'abord l'optimal.

📥 Entrée

API testée :
```
finder.findAllPaths(
  from:            string,
  to:              string,
  maxPaths  = 3,
  maxDepth  = 50,
  transferPenalty = 0,
  allowedVia?:     string[],
  minHops   = 0
): Path[]
```

`Path = string[]` (liste ordonnée de nœuds)

Graphes utilisés :
```
TWO_PATHS :
  A→B (1)→D (1)   poids 2  ← optimal
  A→C (1)→D (3)   poids 4

MUSICIANS_MINI :
  james-brown → kanye-west (direct + indirect via MJ)

EMPTY : aucun edge
```

⚙️ Traitement attendu

Utilise Yen's K-shortest paths simplifié :
1. Trouve le chemin optimal via Dijkstra → path[0]
2. Pénalise temporairement le dernier edge du chemin trouvé
3. Relance Dijkstra → trouve une alternative → path[1]
4. Répète jusqu'à `maxPaths` ou épuisement des alternatives
5. Trie les chemins par poids croissant avant de retourner

📤 Sortie

```typescript
Path[]  // [] si aucun chemin, jamais null
```

📏 Critères

- `paths[0]` a toujours un poids ≤ aux suivants
- `paths.length ≤ maxPaths` — jamais plus que demandé
- Retourne `[]` si aucun chemin — jamais `null`
- Chaque `path` est un tableau de strings non vide
- Deux chemins dans les résultats ne sont pas identiques

Cas de test

[P4.1] deux chemins disponibles : paths[0]=['A','B','D'] (poids 2), paths[1]=['A','C','D'] (poids 4) → ✓
[P4.2] maxPaths=2 : paths.length ≤ 2 → ✓
[P4.3] aucun chemin possible : retourne [] (pas null) → ✓

---

## Architecture Context

```
Graph.from(from, { maxPaths }).to(to).paths(strategy)
  → PathFinder.findAllPaths()
  → ResolvedPath[]
  → MetroFormatter.formatMultiple()   (métro)
  → MusicianFormatter.formatMultiple() (musicians)
```

## Dependencies

Graph (nodes + edges)
PathFinder.findShortestPath() (appelé en interne)

## Failure Modes

Graphe sans chemins entre from et to
→ [] (pas null, pas d'exception)

maxPaths = 0
→ [] (cas dégénéré accepté)

## Observability Impact

PathFinder

Impact:
number of alternatives affects UX decision quality
too many paths = UI overload
too few = user misses a better route

## Domain Concepts

PathFinder
Path
GraphEdge

## Related Use Cases

UC-P4 — Plusieurs chemins
UC-P9 — Graphe bidirectionnel

---

🎯 Objectif

Garantir que PathFinder ne boucle pas indéfiniment sur un graphe
contenant des cycles, et retourne des chemins valides et finis.

Les cycles sont intentionnels dans le graphe musicians (Daft Punk ↔ Kanye
s'influencent mutuellement) et peuvent apparaître dans tout graphe
de navigation. Sans protection, un DFS naïf boucle à l'infini.
Dijkstra gère les cycles via le marquage des nœuds visités, mais
`findAllPaths()` (Yen's K-shortest) doit aussi éviter les boucles.

📥 Entrée

API testée :
```
finder.findShortestPath(from: string, to: string): PathDetails | null
finder.findAllPaths(from, to, maxPaths): Path[]
```

Graphes utilisés :
```
CYCLIC :
  A→B (1), B→C (1), C→A (1)   ← cycle A→B→C→A
  A→C (5)                      ← chemin direct plus long

MUSICIANS_MINI (cycle bidirectionnel) :
  daft-punk → kanye-west (INFLUENCE, 1)
  kanye-west → daft-punk (INFLUENCE, 3)  ← cycle inverse
```

⚙️ Traitement attendu

`findShortestPath()` — Dijkstra :
- Marque chaque nœud visité
- Un nœud visité ne peut pas être revisité
- Le cycle est détecté implicitement

`findAllPaths()` — Yen's K-shortest :
- Chaque chemin alternatif est contraint à ne pas répéter un nœud
- `maxDepth` borne la profondeur maximale de recherche
- Si un cycle mène à une boucle → coupé par `maxDepth`

📤 Sortie

```typescript
// findShortestPath sur CYCLIC (A→C) :
{ path: ['A','B','C'], weight: 2 }   // indirect plus court que direct (poids 5)

// findAllPaths sur MUSICIANS_MINI (daft-punk → kanye-west) :
[['daft-punk','kanye-west']]         // chemin direct, pas de boucle
```

📏 Critères

- `findShortestPath()` ne boucle jamais quelle que soit la structure du graphe
- `findAllPaths()` retourne des chemins de longueur finie (< maxDepth)
- Aucun chemin retourné ne contient deux fois le même nœud
- Les deux sens d'un cycle bidirectionnel sont navigables indépendamment

Cas de test

[P8.1] graphe cyclique A→B→C→A : findShortestPath('A','C') retourne un résultat fini → ✓
[P8.2] cycle daft-punk ↔ kanye : findShortestPath dans les deux sens retourne non-null → ✓
[P8.3] findAllPaths sur graphe cyclique : tous les paths ont length < 20 → ✓

---

## Architecture Context

```
MUSICIANS scénario :
  cycle-influence query
  → PathFinder.findAllPaths('daft-punk', 'kanye-west', 4)
  → sans protection : boucle infinie
  → avec maxDepth + visited set : retourne chemins valides
```

Le `maxDepth` est le filet de sécurité ultime.
En production, il est fixé à 50 — suffisant pour tout graphe LinkLab réel.

## Dependencies

Graph (nodes + edges)
visited : Set<string> (interne à PathFinder)
maxDepth : number (paramètre de findAllPaths)

## Failure Modes

Cycle pur sans sortie possible (graphe piège)
→ null / [] après épuisement de maxDepth

maxDepth trop petit sur un grand graphe
→ certains chemins valides manquants

## Observability Impact

PathFinder

Impact:
cycle protection ensures pathfinder always terminates
without it, any cyclic graph causes infinite loop = process hang
maxDepth is the last safety net — should never trigger in practice

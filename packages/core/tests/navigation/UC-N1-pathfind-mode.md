## Domain Concepts

NavigationEngine (mode PATHFIND)
PathFinder
NavigationPath
EngineStepResult
PathQuery

## Related Use Cases

UC-P1 — findShortestPath (utilisé en interne)
UC-P4 — findAllPaths (utilisé en interne)
UC-N2 — Mode NAVIGATE (résolution de frames)

---

🎯 Objectif

Garantir que `NavigationEngine.forPathfinding()` orchestre correctement
`PathFinder` et retourne des `EngineStepResult` enrichis avec les edges
traversés et les poids totaux, triés par poids croissant.

NavigationEngine est la façade publique de PathFinder — c'est lui que
`Graph.from().to().paths()` utilise. Il ajoute l'enrichissement des
résultats (edges réels, poids total) que PathFinder seul ne fournit pas.

📥 Entrée

API testée :
```typescript
NavigationEngine.forPathfinding(graph: Graph, query: PathQuery): NavigationEngine
await engine.run(): Promise<EngineStepResult[]>

engine.getMode(): EngineMode
engine.getGraph(): Graph
engine.getState(): any
```

PathQuery :
```typescript
{
  from:             string
  to:               string
  maxPaths?:        number    // défaut 5
  minHops?:         number    // défaut 0
  transferPenalty?: number    // défaut 0
  via?:             string[]  // types d'edges autorisés
}
```

EngineStepResult (mode PATHFIND) :
```typescript
{
  time:   number
  mode:   'PATHFIND'
  path:   NavigationPath    // { nodes, edges, totalWeight }
  result: { type: 'SUCCESS', data: { rank: number, allPaths: NavigationPath[] } }
}
// ou en cas d'échec :
{ time: 0, mode: 'PATHFIND', result: { type: 'FAIL', reason: string } }
```

Graphe utilisé :
```
METRO_MINI — S1→S2→HUB→S3 (DIRECT) + S1→S4→S3 (DIRECT)
MUSICIANS_MINI — réseau sampling/influence
```

⚙️ Traitement attendu

1. `forPathfinding()` crée un `NavigationEngine` en mode PATHFIND
2. `run()` appelle `pathFinder.findAllPaths(from, to, maxPaths, 50, transferPenalty, via, minHops)`
3. Pour chaque chemin retourné :
   - Récupère les edges réels depuis `graph.edges`
   - Calcule `totalWeight` = somme des `edge.weight`
4. Trie les `NavigationPath` par `totalWeight` croissant
5. Retourne un `EngineStepResult` par chemin trouvé
6. Si aucun chemin → retourne `[{ result: { type:'FAIL' } }]`

📤 Sortie

```typescript
// Metro S1 → S3, 2 chemins
[
  {
    time: 0, mode: 'PATHFIND',
    path: { nodes: ['S1','S2','HUB','S3'], edges: [...], totalWeight: 3 },
    result: { type: 'SUCCESS', data: { rank: 1, allPaths: [...] } }
  },
  {
    time: 1, mode: 'PATHFIND',
    path: { nodes: ['S1','S4','S3'], edges: [...], totalWeight: 4 },
    result: { type: 'SUCCESS', data: { rank: 2, allPaths: [...] } }
  }
]
```

📏 Critères

- `getMode()` retourne `'PATHFIND'`
- `run()` retourne un tableau — jamais null
- Le premier résultat a le `totalWeight` le plus faible
- `result[i].path.nodes[0] === query.from`
- `result[i].path.nodes[last] === query.to`
- `result[i].path.edges.length === result[i].path.nodes.length - 1`
- Aucun chemin → `result[0].result.type === 'FAIL'`
- `maxPaths` respecté : `results.length ≤ maxPaths`

Cas de test

[N1.1] getMode() === 'PATHFIND' → ✓
[N1.2] run() retourne résultats triés par totalWeight → ✓
[N1.3] premier résultat : nodes[0]=from, nodes[last]=to → ✓
[N1.4] edges.length === nodes.length - 1 → ✓
[N1.5] aucun chemin : result.type = 'FAIL' → ✓
[N1.6] maxPaths respecté → ✓
[N1.7] via filter transmis à PathFinder → ✓
[N1.8] transferPenalty transmis à PathFinder → ✓

---

## Architecture Context

```
Graph.from('Pigalle', { maxPaths:3 }).to('Alesia').paths(Strategy.Comfort())
  → NavigationEngine.forPathfinding(graph, {
      from:'Pigalle', to:'Alesia',
      maxPaths:3, transferPenalty:8
    })
  → engine.run()
  → EngineStepResult[]
  → PathBuilder.paths() retourne ResolvedPath[]
  → MetroFormatter.formatMultiple()
```

## Dependencies

PathFinder (findAllPaths)
Graph (edges pour enrichissement)
PathQuery (paramètres de recherche)

## Failure Modes

pathQuery non fourni
→ Error lancée dans run()

Graphe vide
→ FAIL result, pas d'exception

from ou to absent du graphe
→ PathFinder retourne [] → FAIL result

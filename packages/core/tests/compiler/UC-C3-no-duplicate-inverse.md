## Domain Concepts

GraphCompiler
GraphEdge
physical_reverse
Metro Paris (graphe bidirectionnel)

## Related Use Cases

UC-C1 — Routes physiques
UC-P9 — Graphe bidirectionnel

---

🎯 Objectif

Garantir que `GraphCompiler` ne crée pas d'edges inverses synthétiques
pour les edges qui ont déjà leur inverse dans le graphe source.

Le graphe metro Paris contient 778 paires d'edges bidirectionnels
explicites (A→B et B→A tous les deux présents). Sans ce fix,
GraphCompiler v1 générait un doublon pour chacun :
`A→B` + `B→A` (original) + `B→A_inv` (synthétique) + `A→B_inv`
→ 1556 edges redondants inutiles en mémoire.

Ce fix s'applique silencieusement — le comportement de navigation
est identique, seule l'efficacité mémoire change.

📥 Entrée

API testée :
```
compiler.compile(graph: Graph, metrics: MetricsMap): CompiledGraph
```

Graphes utilisés :
```
UNIDIR — A→B→C (unidirectionnel — inverses synthétiques nécessaires)

BIDIR — A→B + B→A, B→C + C→B (bidirectionnel — inverses déjà présents)

MIXED — A→B + B→A (bidir), B→C (unidir — inverse synthétique nécessaire)

METRO_SAMPLE — 6 stations, 8 edges DIRECT bidirectionnels + 2 TRANSFER
               (représentatif du graphe metro réel : 778 bidir / 916 total)
```

⚙️ Traitement attendu

Avant de créer les inverses synthétiques, le compilateur vérifie :
```typescript
const existingPairs = new Set(fkEdges.map(e => `${e.from}→${e.to}`))
const inverseEdges = fkEdges
  .filter(e => !existingPairs.has(`${e.to}→${e.from}`))  // ← le fix
  .map(e => ({ ...e, from: e.to, to: e.from,
               name: `${e.name}_inv`,
               metadata: { ...e.metadata, type: 'physical_reverse' } }))
```

Règle : un inverse synthétique est créé si et seulement si l'inverse
n'existe pas déjà dans le graphe source.

📤 Sortie

Nombre d'edges dans `physicalGraph` selon le type de graphe :

| Graphe | Edges source | Inverses créés | Total physicalGraph |
|--------|-------------|----------------|---------------------|
| UNIDIR (3 unidir) | 3 | 3 | 6 |
| BIDIR (3 bidir = 6 edges) | 6 | 0 | 6 |
| MIXED (2 bidir + 1 unidir) | 5 | 1 | 6 |
| METRO réel (916 edges) | 916 | 31 | 947 |

📏 Critères

- Sur graphe unidirectionnel : chaque edge a un inverse synthétique créé
- Sur graphe bidirectionnel : aucun inverse synthétique créé
- Sur graphe mixte : seuls les edges sans retour ont un inverse synthétique
- Les inverses synthétiques ont `metadata.type === 'physical_reverse'`
- Le résultat de compilation (routes) est identique avec ou sans fix
  (même routes, même poids — seul physicalGraph en mémoire est plus petit)
- `compiled.routes` ne contient pas de routes en double

Cas de test

[C3.1] graphe unidirectionnel A→B→C : inverses synthétiques B→A et C→B créés → ✓
[C3.2] graphe bidirectionnel : 0 inverse synthétique créé → ✓
[C3.3] graphe mixte : inverse créé uniquement pour l'edge unidir → ✓
[C3.4] routes compilées identiques avant/après fix : même nombre de routes → ✓
[C3.5] metro sample : 31 inverses créés sur 916 edges (les 31 terminus) → ✓

---

## Architecture Context

```
Avant fix (v1) :
  metro 916 edges → 916 inverses synthétiques → 1832 edges en mémoire
  PathFinder construit adjacencyList sur 1832 edges
  → ralentissement Dijkstra, résultats corrects mais redondants

Après fix (v2) :
  metro 916 edges → 31 inverses synthétiques → 947 edges
  PathFinder adjacencyList optimisée
  → même résultats, mémoire divisée par ~2

Le fix est dans compile() avant la création de physicalGraph :
  compiled.ts ligne ~XX : existingPairs check
```

## Dependencies

GraphCompiler.compile() — étape de création des inverses
GraphEdge.from / GraphEdge.to
Set<string> — lookup O(1) pour la vérification

## Failure Modes

Edge avec `from === to` (boucle)
→ l'inverse serait identique → déjà filtré par `from !== to` dans getAllPairs

Graphe avec edges dupliqués (même from/to, metadata différente)
→ le fix ne crée pas d'inverse pour aucun des deux (correct)

## Observability Impact

GraphCompiler

Impact:
reduces memory footprint for large bidirectional graphs (metro: -48%)
no impact on route correctness or navigation behavior

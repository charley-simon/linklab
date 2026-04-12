## Domain Concepts

PathFinder
GraphEdge
PathDetails

## Related Use Cases

UC-P1 — Chemin le plus court
UC-P8 — Cycle detection

---

🎯 Objectif

Garantir que PathFinder calcule des poids symétriques sur les graphes
bidirectionnels, et gère proprement les graphes où certains arcs
n'ont pas de retour (graphes partiellement dirigés).

Le graphe metro est presque entièrement bidirectionnel (750/916 edges
ont leur inverse) mais reste un graphe dirigé — chaque edge a une
direction et une direction réelle dans le métro. La symétrie des poids
garantit que Châtelet→Nation et Nation→Châtelet prennent le même temps.

📥 Entrée

API testée :
```
finder.findShortestPath(from: string, to: string): PathDetails | null
```

Graphes utilisés :
```
BIDIR :
  A→B (1), B→A (1)
  B→C (2), C→B (2)
  C→D (1), D→C (1)
  (graphe symétrique : A→D = D→A = poids 4)

METRO_MINI :
  S1→S2→HUB→S3 (tous DIRECT, sans retour défini dans le mini-graphe)
```

⚙️ Traitement attendu

Sur un graphe symétrique :
- `findShortestPath(A, D)` = `findShortestPath(D, A)` en poids
- L'ordre `from`/`to` ne change pas le résultat sur un graphe symétrique

Sur un graphe partiellement dirigé :
- Le retour peut être `null` si les edges inverses n'existent pas
- Ce n'est pas une erreur — c'est le comportement attendu d'un graphe dirigé

📤 Sortie

```typescript
// BIDIR A→D et D→A :
{ weight: 4 }   // même poids dans les deux sens

// METRO_MINI S3→S1 :
null   // si les edges retour ne sont pas définis
```

📏 Critères

- Sur graphe symétrique : `fwd.weight === bwd.weight`
- Sur graphe dirigé sans retour : `findShortestPath(to, from)` peut retourner null
- Un null sur le retour n'est pas une erreur — c'est un graphe dirigé valide

Cas de test

[P9.1] graphe symétrique : findShortestPath(A,D).weight === findShortestPath(D,A).weight → ✓
[P9.2] graphe dirigé : findShortestPath(S3,S1) = null (pas d'exception) → ✓

---

## Architecture Context

```
Metro Paris graphe :
  750/916 edges bidirectionnels (aller + retour explicites)
  166 edges TRANSFER (correspondances, souvent unidirectionnelles)

GraphCompiler.compile() :
  crée des inverses synthétiques pour les edges sans retour
  → fix : ne pas créer si l'inverse existe déjà (ADR-0005)
```

## Dependencies

Graph (nodes + edges avec inverses explicites ou synthétiques)
GraphCompiler (crée les inverses manquants)

## Failure Modes

Graphe supposé symétrique mais edge retour manquant
→ findShortestPath(to, from) = null (comportement silencieux)
→ détectable par linklab status (drift check)

## Observability Impact

PathFinder

Impact:
asymmetric metro graph = different route times each direction
acceptable if real data is asymmetric (longer return journey)

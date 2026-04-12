## Domain Concepts

PathFinder
PathDetails
Graph

## Related Use Cases

UC-P1 — Chemin le plus court
UC-P10 — Nœud isolé et cas limites

---

🎯 Objectif

Garantir que `findShortestPath()` retourne `null` proprement
quand aucun chemin n'existe entre deux nœuds.

Un graphe réel contient des nœuds isolés, des composantes non connexes,
et des edges dirigés qui bloquent certains traversées.
PathFinder doit échouer proprement — sans exception, sans résultat
erroné — pour que l'appelant puisse gérer le cas sans crash.

Si ce contrat n'est pas respecté, un `null` non géré dans `QueryEngine`
génère un SQL invalide, et une réponse HTTP 500 au lieu d'un 404 clair.

📥 Entrée

API testée :
```
finder.findShortestPath(from: string, to: string): PathDetails | null
finder.hasPath(from: string, to: string): boolean
```

Graphes utilisés :
```
ISOLATED — A→B (1), C sans edges     ← C inatteignable
EMPTY    — aucun edge
LINEAR   — A→B→C→D (unidirectionnel) ← D→A impossible
```

⚙️ Traitement attendu

1. Dijkstra explore tous les nœuds accessibles depuis `from`
2. Si `dist.get(to) === Infinity` après exploration → retourne `null`
3. `hasPath()` = raccourci : `findShortestPath(from, to) !== null`
4. Un graphe dirigé A→B ne permet pas le chemin B→A

📤 Sortie

```
null — jamais une exception, jamais un objet vide
```

📏 Critères

- Retourne `null` — jamais une exception
- `hasPath()` = false si et seulement si `findShortestPath()` = null
- Un graphe dirigé A→B n'autorise pas B→A
- Un nœud isolé retourne null depuis n'importe quel autre nœud
- Un nœud inexistant retourne null (pas de KeyError)

Cas de test

[P2.1] nœud isolé C dans A→B : findShortestPath('A','C') = null → ✓
[P2.2] graphe sans edges : hasPath('A','B') = false → ✓
[P2.3] graphe dirigé A→B→C→D : findShortestPath('D','A') = null → ✓

---

## Architecture Context

```
QueryEngine.generateSQL()
  → compiledGraph.routes.find(from, to)
  → si null → erreur route introuvable (pas de crash)

linklabPlugin (Fastify)
  → si null → HTTP 404, pas 500
```

## Dependencies

Graph (nodes + edges)

## Failure Modes

Nœud `from` ou `to` inexistant dans le graphe
→ null (pas d'exception KeyError)

Graphe vide (0 nodes, 0 edges)
→ null

## Observability Impact

PathFinder

Impact:
null path → route not compiled → QueryEngine falls back
missing route logged as warning in linklab build

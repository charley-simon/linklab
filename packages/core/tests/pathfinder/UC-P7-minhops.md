## Domain Concepts

PathFinder
Path

## Related Use Cases

UC-P4 — Plusieurs chemins
UC-P6 — Via filter

---

🎯 Objectif

Garantir que `minHops` force PathFinder à écarter les chemins
trop directs, permettant d'explorer les connexions indirectes
même quand un raccourci existe.

Cas d'usage : James Brown a influencé Kanye West directement (1 saut)
mais aussi via Michael Jackson (2 sauts). `minHops=2` force l'exploration
du chemin indirect, révélant une relation historique riche que le chemin
direct masque. Sans ce mécanisme, `findAllPaths()` s'arrête souvent
au chemin optimal et ne cherche pas les alternatives profondes.

📥 Entrée

API testée :
```
finder.findAllPaths(
  from, to,
  maxPaths    = 3,
  maxDepth    = 50,
  transferPenalty = 0,
  allowedVia?: string[],
  minHops: number         ← clé de ce UC
): Path[]
```

`minHops` = nombre minimum de **sauts** (edges) exigés.
`minHops=0` → tous les chemins (défaut)
`minHops=1` → identique à 0 (1 saut = direct inclus)
`minHops=2` → exclut les paths de longueur 2 (direct A→B)
`minHops=N` → tous les paths ont `path.length ≥ N+1`

Graphe utilisé :
```
MUSICIANS_MINI :
  james-brown → kanye-west              (INFLUENCE, 1) ← direct
  james-brown → michael-jackson         (INFLUENCE, 1)
  michael-jackson → kanye-west          (INFLUENCE, 1) ← indirect poids 2
```

⚙️ Traitement attendu

Après qu'un chemin est trouvé par Dijkstra :
- Si `path.length - 1 < minHops` → chemin rejeté, continuer la recherche
- Sinon → chemin inclus dans les résultats

Note : minHops ne modifie pas l'algorithme Dijkstra lui-même —
il filtre les résultats a posteriori.

📤 Sortie

```typescript
Path[]  // tous les paths retournés vérifient path.length - 1 >= minHops
```

📏 Critères

- `minHops=0` : tous les chemins, y compris le direct (path.length=2)
- `minHops=2` : tous les paths retournés ont `path.length ≥ 3`
- `minHops=N` : tous les paths retournés ont `path.length ≥ N+1`
- Si aucun chemin ne respecte minHops → retourne []

Cas de test

[P7.1] minHops=0 : inclut le chemin direct james-brown→kanye (path.length=2) → ✓
[P7.2] minHops=2 : exclut le direct, tous les paths ont path.length ≥ 3 → ✓
[P7.3] minHops=3 : tous les paths ont path.length ≥ 4 → ✓

---

## Architecture Context

```
queries.ts (musicians)
  {
    from: 'artist-james-brown',
    to:   'artist-kanye-west',
    minHops: 1   ← inclut direct ET indirect
  }

queries.ts (pharrell-network)
  {
    from: 'artist-pharrell-williams',
    to:   'artist-kanye-west',
    minHops: 1   ← force les chemins indirects en plus du direct
  }

run.ts
  music.from(from, { minHops }).to(to).paths()
    → PathFinder.findAllPaths(..., minHops)
```

## Dependencies

Graph (nodes + edges)
PathFinder.findAllPaths() (minHops appliqué en post-filtre)

## Failure Modes

minHops plus grand que la profondeur maximale du graphe
→ retourne [] (pas d'exception)

minHops = maxDepth
→ [] (aucun chemin ne peut satisfaire les deux contraintes)

## Observability Impact

PathFinder

Impact:
minHops exposes indirect influence chains
valuable for understanding knowledge transfer and cultural lineage
not used in metro (all hops are meaningful by default)

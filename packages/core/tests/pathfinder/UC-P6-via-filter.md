## Domain Concepts

PathFinder
Path
GraphEdge.via
GraphEdge.metadata.type

## Related Use Cases

UC-P4 — Plusieurs chemins
UC-P7 — MinHops

---

🎯 Objectif

Garantir que le filtre `allowedVia` dans `findAllPaths()` contraint
PathFinder à n'emprunter que les edges dont le type correspond à
la liste autorisée.

Sans ce filtre, Dijkstra peut "tricher" : pour aller de Kanye à Daft Punk
via la chaîne de sampling, il pourrait emprunter l'edge INFLUENCE direct
(plus court) au lieu de la chaîne CREATED→SAMPLES→CREDITED voulue.
Le résultat serait correct techniquement mais sémantiquement faux —
la requête demandait les liens de sampling, pas les influences.

📥 Entrée

API testée :
```
finder.findAllPaths(
  from, to,
  maxPaths    = 3,
  maxDepth    = 50,
  transferPenalty = 0,
  allowedVia: string[],   ← clé de ce UC
  minHops     = 0
): Path[]
```

`allowedVia` correspond à `edge.via` ou `edge.metadata.type`.

Graphes utilisés :
```
VIA_GRAPH :
  A→B (TYPE_X), B→D (TYPE_X)   ← chemin X : A→B→D
  A→C (TYPE_Y), C→D (TYPE_Y)   ← chemin Y : A→C→D

MUSICIANS_MINI :
  kanye-west → track-stronger    (CREATED)
  track-stronger → track-harder  (SAMPLES)
  track-harder → daft-punk       (CREDITED)
  daft-punk → kanye-west          (INFLUENCE) ← à exclure si via=['CREATED','SAMPLES','CREDITED']
  kanye-west → daft-punk          (INFLUENCE) ← raccourci à exclure
```

⚙️ Traitement attendu

Lors de la construction de l'adjacency list pour Dijkstra :
- Si `allowedVia` est défini et non vide :
  ignorer tout edge dont `edge.via` (ou `edge.metadata.type`) n'est pas dans la liste
- Dijkstra opère sur ce graphe filtré
- Les edges exclus ne peuvent pas être empruntés même comme dernier recours

📤 Sortie

```typescript
Path[]  // [] si allowedVia exclut tous les chemins possibles
```

📏 Critères

- `allowedVia=['TYPE_X']` → seuls les chemins via TYPE_X sont retournés
- `allowedVia=['TYPE_Z']` (inexistant) → retourne []
- `allowedVia` non défini → tous les edges autorisés (comportement par défaut)
- Le filtre ne peut pas être contourné par un chemin alternatif

Cas de test

[P6.1] allowedVia=['TYPE_X'] : chemin A→B→D retourné, C absent → ✓
[P6.2] allowedVia=['TYPE_Y'] : chemin A→C→D retourné, B absent → ✓
[P6.3] allowedVia=['TYPE_Z'] inexistant : retourne [] → ✓
[P6.4] chaîne sampling via=['CREATED','SAMPLES','CREDITED'] :
       kanye→track-stronger→track-harder→daft-punk
       (l'edge INFLUENCE direct kanye→daft-punk est exclu) → ✓

---

## Architecture Context

```
queries.ts (musicians)
  query: {
    from: 'artist-kanye-west',
    to:   'artist-daft-punk',
    via:  ['CREATED', 'SAMPLES', 'CREDITED']
  }

run.ts
  music.from(from, { via }).to(to).paths()
    → PathFinder.findAllPaths(..., allowedVia=['CREATED','SAMPLES','CREDITED'])
    → MusicianFormatter.formatMultiple()
```

## Dependencies

Graph (nodes + edges)
GraphEdge.via
GraphEdge.metadata.type

## Failure Modes

`allowedVia` = [] (liste vide)
→ comportement à définir : [] ou identique à undefined ?
→ recommandation : traiter [] comme undefined (tous autorisés)

Edge dont `via` et `metadata.type` sont différents
→ tester les deux champs pour éviter les faux négatifs

## Observability Impact

PathFinder

Impact:
via filter ensures semantic correctness of paths
wrong filter = wrong relationship type returned
(sampling vs influence are two different business concepts)

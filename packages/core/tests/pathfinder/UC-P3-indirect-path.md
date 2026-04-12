## Domain Concepts

PathFinder
PathDetails
GraphEdge

## Related Use Cases

UC-P1 — Chemin le plus court
UC-P4 — Plusieurs chemins
UC-P6 — Via filter

---

🎯 Objectif

Garantir que PathFinder traverse correctement les chemins
multi-sauts, y compris les chaînes de sampling musicales
(artiste → track → track → artiste) et les routes SQL composées
(departments → jobs → credits → movies).

Les graphes LinkLab ont des chemins sémantiquement riches qui
traversent des tables intermédiaires invisibles pour l'utilisateur.
PathFinder doit les trouver sans se perdre — et choisir le direct
quand il est moins coûteux.

📥 Entrée

API testée :
```
finder.findShortestPath(from: string, to: string): PathDetails | null
```

Graphes utilisés :
```
SAMPLING :
  will-smith → track-jiggy (CREATED, 1)
  track-jiggy → track-wanna-be (SAMPLES, 2)
  track-wanna-be → track-soul-makossa (SAMPLES, 2)
  track-soul-makossa → manu-dibango (CREDITED, 1)
  (4 sauts, poids total 6)

MUSICIANS_MINI :
  james-brown → kanye-west (INFLUENCE, 1)      ← direct
  james-brown → michael-jackson (INFLUENCE, 1) ← indirect
  michael-jackson → kanye-west (INFLUENCE, 1)  ← indirect (poids total 2)
```

⚙️ Traitement attendu

Dijkstra explore tous les nœuds intermédiaires sans distinction de type.
Un nœud `track` est traversé exactement comme un nœud `artist`.
La chaîne est valide si chaque edge existe dans le graphe.

Quand un chemin direct (poids=1) et indirect (poids=2) mènent au même
nœud, Dijkstra sélectionne le direct — indépendamment du nombre de sauts.

📤 Sortie

```typescript
PathDetails avec :
  path    : ['will-smith', 'track-jiggy', ..., 'manu-dibango']
  joins   : 4
  indirect: true
  weight  : 6
```

📏 Critères

- Un chemin à N sauts est retourné si et seulement si chaque edge existe
- `indirect = true` si `path.length > 2`
- Dijkstra choisit le direct s'il est moins coûteux
- L'ordre des nœuds dans `path` est toujours `from → ... → to`
- Les types de nœuds intermédiaires (artist, track) n'affectent pas la traversée

Cas de test

[P3.1] chaîne sampling 4 sauts :
       path=['will-smith','track-jiggy','track-wanna-be','track-soul-makossa','manu-dibango']
       joins=4, indirect=true, weight=6 → ✓
[P3.2] chemin direct vs indirect :
       james-brown→kanye direct (poids 1) choisi sur indirect via MJ (poids 2) → ✓

---

## Architecture Context

```
GraphCompiler.compile()
  → PathFinder.findAllPaths(from, to)
  → routes avec path ['departments','jobs','credits','movies']
  → QueryEngine.generateSQL()
  → INNER JOIN jobs ON departments.id = jobs.departmentId
     INNER JOIN credits ON jobs.id = credits.jobId
     ...
```

Chaque nœud intermédiaire dans `path` devient une clause INNER JOIN.
Un chemin incorrect génère un SQL avec les mauvaises jointures.

## Dependencies

Graph (nodes + edges)
GraphEdge.weight
GraphEdge.via / metadata.type

## Failure Modes

Edge manquant dans la chaîne
→ null (chaîne interrompue)

Nœud intermédiaire isolé
→ null

## Observability Impact

PathFinder

Impact:
join depth directly maps to SQL JOIN count
4-hop path = 4 JOINs = heavier query
used by CalibrationJob to detect slow multi-hop routes

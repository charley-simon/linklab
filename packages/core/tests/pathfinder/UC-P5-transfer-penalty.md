## Domain Concepts

PathFinder
Strategy
Path
GraphEdge.metadata.type

## Related Use Cases

UC-P4 — Plusieurs chemins
UC-P1 — Chemin le plus court

---

🎯 Objectif

Garantir que `transferPenalty` dans `findAllPaths()` influe sur
le choix de l'itinéraire en pénalisant les correspondances,
sans altérer le poids réel affiché à l'utilisateur.

Dans le scénario métro, un trajet avec 1 correspondance est souvent
préférable à un trajet 5% plus court avec 3 changements.
TransferPenalty modélise le coût subjectif d'un changement de ligne
(marche jusqu'au quai, attente, stress) que les données RATP brutes
ne capturent pas.

📥 Entrée

API testée :
```
finder.findAllPaths(
  from, to,
  maxPaths    = 3,
  maxDepth    = 50,
  transferPenalty: number,   ← clé de ce UC
  allowedVia?: string[],
  minHops     = 0
): Path[]
```

`Strategy.Comfort()` = transferPenalty de 8 minutes
`Strategy.Custom(n)` = transferPenalty de n minutes
`Strategy.Shortest()` = transferPenalty de 0 (défaut)

Graphe utilisé :
```
METRO_MINI :
  S1 →[DIRECT L1, 1]→ S2 →[DIRECT L1, 1]→ HUB →[DIRECT L1, 1]→ S3
  S1 →[DIRECT L2, 2]→ S4 →[DIRECT L2, 2]→ S3
  S2 →[TRANSFER,  4]→ S4

  Sans pénalité :
    S1→S2→HUB→S3 = poids 3  ← optimal
    S1→S4→S3     = poids 4

  Avec pénalité sur TRANSFER (coût fictif >> 4) :
    S1→S2→HUB→S3 devient plus coûteux (traversée de S2 avec TRANSFER évitée)
    S1→S4→S3 devient préférable
```

⚙️ Traitement attendu

Lors du calcul du poids effectif par Dijkstra :
- Si l'edge est de type TRANSFER → `weight_effectif = weight + transferPenalty`
- Si l'edge change de `lineId` par rapport au précédent → `weight_effectif += transferPenalty`
- Le `weight` stocké dans `PathDetails` reste le poids réel RATP (sans pénalité)
- La pénalité influe uniquement sur le choix de l'itinéraire, pas sur l'affichage

📤 Sortie

```typescript
Path[]  triés par poids effectif (avec pénalité)
// mais PathDetails.weight = poids réel (sans pénalité)
```

📏 Critères

- `transferPenalty=0` : chemin sélectionné par poids brut minimal
- `transferPenalty >> 0` : les edges TRANSFER sont évités si une alternative existe
- Le `weight` dans PathDetails reflète le temps réel RATP, pas le temps perçu
- La pénalité n'est jamais exposée à l'utilisateur final

Cas de test

[P5.1] transferPenalty=0 : S1→S2→HUB→S3 (poids réel 3) choisi sur S1→S4→S3 (poids 4) → ✓
[P5.2] transferPenalty=10 : le TRANSFER coûteux est évité, S1→S4→S3 devient préférable → ✓

---

## Architecture Context

```
run.ts
  const strategy = comfort ? Strategy.Comfort()
                 : custom  ? Strategy.Custom(n)
                 :           Strategy.Shortest()

  metro.from(from, { maxPaths }).to(to).paths(strategy)
    → PathFinder.findAllPaths(..., strategy.transferPenalty)
    → MetroFormatter.formatMultiple()
```

## Dependencies

Graph (nodes + edges)
GraphEdge.metadata.type ('DIRECT' | 'TRANSFER')
GraphEdge.metadata.lineId

## Failure Modes

Graphe sans edges TRANSFER
→ transferPenalty sans effet (comportement correct)

transferPenalty négatif
→ comportement non défini (ne pas utiliser)

## Observability Impact

PathFinder / Strategy

Impact:
comfort routing = fewer transfers = lower user frustration
affects route selection only — does not affect telemetry weight

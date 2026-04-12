## Domain Concepts

PathFinder
Graph (manuel)
NavigationEngine

## Related Use Cases

UC-P3 — Chemin indirect multi-sauts
UC-P8 — Cycle detection
UC-N1 — Mode PATHFIND

---

🎯 Objectif

Valider que PathFinder trouve les chaînes de sampling réelles
dans le graphe musicians — Will Smith → Manu Dibango en 4 sauts,
et que le cycle Daft Punk ↔ Kanye ne cause pas de boucle infinie.

📥 Entrée

```
src/examples/musicians/graph.json  ← 17 nœuds, 30 arêtes
```

⚙️ Traitement attendu

Charger le graph.json et exécuter PathFinder directement.

📏 Critères

- Will Smith → Manu Dibango : chemin trouvé, longueur ≥ 4 nœuds
- James Brown → Kanye West : chemin trouvé
- Daft Punk ↔ Kanye : les deux sens trouvent un chemin (pas de boucle)
- Via filter `['CREATED','SAMPLES','CREDITED']` : trouve la chaîne de sampling

Cas de test

[I3.1] Will Smith → Manu Dibango : chemin trouvé, nodes.length ≥ 4 → ✓
[I3.2] James Brown → Kanye West : chemin trouvé → ✓
[I3.3] Daft Punk → Kanye : chemin trouvé → ✓
[I3.4] Kanye → Daft Punk : chemin trouvé (cycle géré) → ✓
[I3.5] Via ['CREATED','SAMPLES','CREDITED'] : chaîne sampling Kanye→Daft → ✓

---

## Architecture Context

```
npx tsx src/examples/musicians/run.ts --query sampling-chain
→ même logique que ce test, en automatisé
```

## Dependencies

`src/examples/musicians/graph.json`
PathFinder

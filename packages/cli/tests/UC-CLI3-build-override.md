## Domain Concepts

linklab build
raw-graph.override.json
ADR-0008 — pattern override

## Related Use Cases

UC-CLI2 — build pipeline
ADR-0008 — pattern override.json

---

🎯 Objectif

Valider que `linklab build` applique `raw-graph.override.json`
sur le graphe assemblé avant la compilation — edges, nodes et weights
custom sont intégrés dans `compiled-graph.json`.

📥 Entrée

`linklab/raw-graph.override.json` :
```json
{
  "edges": [
    {
      "name": "movies-categories-virtual",
      "from": "movies",
      "to": "categories",
      "via": "categories",
      "weight": 0.1,
      "metadata": { "type": "virtual", "note": "array inline" }
    }
  ],
  "nodes": {
    "movies": { "label": "Films", "icon": "🎬" }
  },
  "weights": {
    "movies→credits": 0.5
  }
}
```

📤 Sortie attendue

```
compiled-graph.json :
  - route movies→categories présente (ajoutée via override)
  - node movies.label === "Films"
  - route movies→credits.primary.weight === 0.5
```

📏 Critères

- Route `movies→categories` présente dans `compiled.routes`
- `compiled.nodes.find(n => n.id === 'movies').label === 'Films'`
- Poids `movies→credits` = 0.5 (override appliqué)
- Override edges ont weight ≤ 0.1 (priorité max)
- `overrides/` legacy → warning dans le build output
- `raw-graph.override.json` jamais modifié par `linklab build`

Cas de test

[CLI3.1] edge override : route movies→categories dans compiled → ✓
[CLI3.2] node override : movies.label = 'Films' → ✓
[CLI3.3] weight override : movies→credits.weight = 0.5 → ✓
[CLI3.4] raw-graph.override.json non modifié après build → ✓
[CLI3.5] overrides/ legacy déclenche warning de migration → ✓
[CLI3.6] override vide ({edges:[],nodes:{},weights:{}}) : build normal → ✓

---

## Architecture Context

```
Step 4 — Assemble :
  GraphAssembler → raw-graph.json
  + raw-graph.override.json (si présent)
    → edges : concat
    → nodes : merge par id
    → weights : appliqués sur les edges correspondants
  → GraphCompiler
```

## Dependencies

`src/commands/build.ts` — logique merge override
`linklab/raw-graph.override.json` — fichier dev

## Failure Modes

raw-graph.override.json JSON invalide → erreur parse avec message clair
Override reference node inexistant → appliqué silencieusement (no-op)
Override weight pour route inexistante → ignoré silencieusement

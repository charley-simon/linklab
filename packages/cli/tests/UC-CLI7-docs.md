## Domain Concepts

linklab docs
entities.md
routes.md
use-cases.md

## Related Use Cases

UC-CLI2 — linklab build (prérequis)
UC-CLI4 — linklab status

---

🎯 Objectif

Valider que `linklab docs` génère les trois fichiers Markdown
corrects depuis `compiled-graph.json` et `analyzed-schema.json`.

📥 Entrée

```
linklab docs
```

Depuis un projet avec `linklab/generated/compiled-graph.json` existant.

📤 Sortie attendue

```
  linklab docs

  ✔  docs/entities.md   (7 entities)
  ✔  docs/routes.md     (76 routes)
  ✔  docs/use-cases.md  (8 use cases)

  → linklab/docs/
```

📏 Critères

**entities.md :**
- 7 sections (une par entité)
- Tableau colonnes avec type, PK, FK, indexed
- FK indique la table cible (→ movies)

**routes.md :**
- Tableau Physical Routes : 20 lignes
- Tableau Semantic Routes : 56 lignes
- Poids arrondis à 2 décimales
- Colonne Condition pour les semantic routes

**use-cases.md :**
- 8 use cases depuis `src/examples/netflix/use-cases.json`
- Tableau avec #, From, To, Description

Cas de test

[CLI7.1] 3 fichiers créés dans linklab/docs/ → ✓
[CLI7.2] entities.md : 7 entités avec tableaux colonnes → ✓
[CLI7.3] routes.md : 20 physical + 56 semantic → ✓
[CLI7.4] routes.md : poids arrondis toFixed(2) → ✓
[CLI7.5] use-cases.md : 8 use cases (source scénario) → ✓
[CLI7.6] compiled-graph.json absent → erreur + suggestion build → ✓

---

## Architecture Context

```
linklab docs
  → loadConfig
  → lire compiled-graph.json + analyzed-schema.json
  → générer entities.md (colonnes depuis schema)
  → générer routes.md (routes depuis compiled)
  → générer use-cases.md (use-cases.json cascade)
```

## Dependencies

`src/commands/docs.ts`
`linklab/generated/compiled-graph.json`
`linklab/generated/analyzed-schema.json`
`use-cases.json` (cascade : scénario source > linklab/)

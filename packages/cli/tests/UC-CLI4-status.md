## Domain Concepts

linklab status
CompiledGraph
Dictionary YAML

## Related Use Cases

UC-CLI2 — linklab build
UC-CLI7 — linklab docs

---

🎯 Objectif

Valider que `linklab status` lit `compiled-graph.json` et affiche
les informations clés du projet — version, date, routes, dictionary.

📥 Entrée

```
linklab status
```

Depuis un dossier avec `linklab/generated/compiled-graph.json` existant.

📤 Sortie attendue

```
  linklab status  ·  netflix

  compiled-graph.json        2.0.9      2026-03-15 16:42
  raw-graph.json             ✔
  schema.json                ✔

  ✔  76 routes compiled (20 physical · 56 semantic)
  ·  Dictionary: empty — add YAML files to linklab/dictionary/
```

📏 Critères

- Nom du scénario lu depuis `compiled.scenario` (pas le nom du dossier)
- Version et date affichés pour `compiled-graph.json`
- `raw-graph.json` et `schema.json` : ✔ si présents
- Nombre de routes correct avec breakdown physical/semantic
- Dictionary : liste les `.yaml` de `linklab/dictionary/`
- Si `compiled-graph.json` absent : message clair + suggestion `linklab build`

Cas de test

[CLI4.1] scenario lu depuis compiled.scenario → ✓
[CLI4.2] version et date affichés → ✓
[CLI4.3] 76 routes (20 physical · 56 semantic) → ✓
[CLI4.4] dictionary vide → message informatif → ✓
[CLI4.5] dictionary avec fichiers YAML → noms listés → ✓
[CLI4.6] compiled-graph.json absent → message + suggestion build → ✓

---

## Dependencies

`src/commands/status.ts`
`linklab/generated/compiled-graph.json`
`linklab/dictionary/*.yaml`

## Domain Concepts

linklab diff
SchemaSnapshot
Drift détection

## Related Use Cases

UC-CLI6 — diff no drift
ADR-0008 — override pattern

---

🎯 Objectif

Valider que `linklab diff` détecte correctement les changements
entre `schema.json` (dernier build) et la source actuelle —
colonne ajoutée, supprimée, type modifié, nouvelle table.

📥 Entrée

Source JSON modifiée après le dernier build :
```
movies.json    : ajout colonne 'budget' (number)
credits.json   : suppression colonne 'options'
departments.json : type 'name' changé de string → text
+ new table: seasons.json ajouté
```

📤 Sortie attendue

```
  linklab diff  ·  netflix

  departments
    ~ name                   string → text

  movies
    + budget                 number

  seasons                    (nouvelle table)

  credits
    - options

  4 changes — +2 ~1 -1

  Run "linklab build" to recompile.
```

📏 Critères

- Colonne ajoutée : `+` en vert avec type
- Colonne supprimée : `-` en rouge
- Type modifié : `~` en jaune avec `from → to`
- Nouvelle table : `+` en vert avec mention "(nouvelle table)"
- Compteur final exact : `+N ~N -N`
- Suggestion `linklab build` à la fin
- Aucun bruit verbose (SynonymResolver silencé)

Cas de test

[CLI5.1] colonne ajoutée détectée (+) → ✓
[CLI5.2] colonne supprimée détectée (-) → ✓
[CLI5.3] type modifié détecté (~) avec from→to → ✓
[CLI5.4] nouvelle table détectée (+) → ✓
[CLI5.5] compteur changes correct → ✓
[CLI5.6] aucun log verbose affiché → ✓

---

## Architecture Context

```
linklab diff
  → loadConfig
  → lire schema.json (snapshot build)
  → JsonSchemaExtractor/SchemaExtractor (source actuelle)
  → computeDiff(old, current)
  → display(changes)
```

## Dependencies

`src/commands/diff.ts`
`linklab/generated/schema.json`
Source actuelle (JSON ou PostgreSQL)

## Failure Modes

schema.json absent → message + suggestion `linklab build`
Source inaccessible (postgres down) → erreur avec message clair

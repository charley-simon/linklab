## Domain Concepts

linklab diff
No drift
SchemaSnapshot

## Related Use Cases

UC-CLI5 — diff avec changements

---

🎯 Objectif

Valider que `linklab diff` affiche "No drift detected" quand la source
est identique au dernier `schema.json` — pas de faux positifs.

📥 Entrée

```
linklab diff
```

Source inchangée depuis le dernier `linklab build`.

📤 Sortie attendue

```
  linklab diff  ·  netflix

  ✔  No drift detected
```

📏 Critères

- Message "No drift detected" affiché
- Aucun changement listé
- Exit code 0
- Aucun log verbose

Cas de test

[CLI6.1] source identique au schema.json → "No drift detected" → ✓
[CLI6.2] exit code 0 → ✓
[CLI6.3] aucun bruit verbose → ✓

---

## Dependencies

`src/commands/diff.ts`
`linklab/generated/schema.json`

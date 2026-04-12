## Domain Concepts

linklab init
LinklabConfig
defineConfig
Structure projet LinkLab

## Related Use Cases

UC-CLI2 — linklab build
ADR-0003 — linklab.config.ts
ADR-0008 — pattern override.json

---

🎯 Objectif

Valider que `linklab init` crée la structure projet correcte,
génère un `linklab.config.ts` fonctionnel avec `defineConfig()` inliné,
et est idempotent (2ème exécution ne rien écraser).

📥 Entrée

```
linklab init                           ← dans un dossier vide
linklab init --source ./data --type json  ← avec source JSON
linklab init --force                   ← écraser si existe
```

📤 Sortie attendue

```
linklab/
  generated/.gitkeep
  dictionary/.gitkeep
  schemas/.gitkeep
  raw-graph.override.json   ← { edges:[], nodes:{}, weights:{} }
  use-cases.json            ← 2 use cases par défaut
linklab.config.ts           ← defineConfig() inliné, pas d'import externe
```

📏 Critères

- `linklab.config.ts` créé avec `defineConfig` inliné (pas d'import `@linklab/cli`)
- `raw-graph.override.json` créé avec sections `edges`, `nodes`, `weights`
- `linklab/generated/` créé
- `linklab/dictionary/` créé
- `linklab/schemas/` créé
- 2ème `linklab init` : fichiers existants ignorés (pas écrasés)
- `--force` : fichiers existants écrasés
- Pas de dossier `overrides/` créé (ADR-0008)

Cas de test

[CLI1.1] init dans dossier vide : tous les fichiers créés → ✓
[CLI1.2] linklab.config.ts contient defineConfig sans import externe → ✓
[CLI1.3] raw-graph.override.json contient edges/nodes/weights → ✓
[CLI1.4] 2ème init : fichiers existants non écrasés → ✓
[CLI1.5] --force : fichiers existants écrasés → ✓
[CLI1.6] pas de dossier overrides/ créé → ✓

---

## Architecture Context

```
linklab init
  → crée linklab.config.ts (defineConfig inliné)
  → crée linklab/generated/ (vide)
  → crée linklab/raw-graph.override.json
  → crée linklab/use-cases.json

linklab build lit ensuite ces fichiers
```

## Dependencies

`src/commands/init.ts`
`src/types.ts` — LinklabConfig, defineConfig

## Failure Modes

Dossier en lecture seule → erreur fs avec message clair
Fichier partiellement créé (crash en cours) → 2ème init recrée le manquant

## Domain Concepts

linklab build
Pipeline Extract→Analyze→Assemble→Train→Compile
CompiledGraph
Version bump

## Related Use Cases

UC-I1 — Netflix pipeline complet
UC-CLI3 — build avec override
ADR-0002 — CLI design

---

🎯 Objectif

Valider que `linklab build` exécute le pipeline complet sur Netflix
et produit un `compiled-graph.json` correct avec version bumped.

📥 Entrée

```
linklab build --scenario netflix
```

Config `linklab.config.ts` :
```typescript
source: { type: 'json', dataDir: '../linklab/src/examples/netflix/data' }
output: { dir: './linklab' }
```

📤 Sortie attendue

```
  ① Extract      ████  7 tables
  ② Analyze      ████  1 pivot
  ③ Dictionary   ████  64 relations
  ④ Assemble     ████  7 nodes · 64 edges
  ⑤ Train        ████  12 routes entraînées
  ⑥ Compile      ████  76 routes (20 physical · 56 semantic)

  ✔  linklab/generated/compiled-graph.json  x.x.x → x.x.(x+1)
```

📏 Critères

- 6 steps affichés dans l'ordre ①→⑥
- `compiled-graph.json` créé dans `linklab/generated/`
- `compiled.routes.length === 76`
- `compiled.nodes.length === 7`
- Version PATCH bumped (ex: 2.0.5 → 2.0.6)
- `compiled.scenario === 'netflix'`
- Aucun log verbose entre les steps (silence appliqué)
- use-cases.json du scénario source utilisé (12 routes entraînées)

Cas de test

[CLI2.1] 6 steps affichés sans bruit entre eux → ✓
[CLI2.2] compiled-graph.json créé dans linklab/generated/ → ✓
[CLI2.3] 76 routes compilées (20 physical + 56 semantic) → ✓
[CLI2.4] 7 nodes → ✓
[CLI2.5] version PATCH bumped → ✓
[CLI2.6] scenario = 'netflix' dans compiled-graph → ✓
[CLI2.7] --dry-run : rien écrit, output affiché → ✓

---

## Architecture Context

```
linklab build
  → loadConfig(linklab.config.ts)
  → JsonSchemaExtractor → schema.json
  → SchemaAnalyzer → analyzed-schema.json
  → GraphBuilder → dictionary.json
  → GraphAssembler → raw-graph.json
  → PathFinder(use-cases) → metrics.json
  → GraphCompiler v2 → compiled-graph.json
```

## Dependencies

`src/commands/build.ts`
`@linklab/core` : JsonSchemaExtractor, SchemaAnalyzer, GraphBuilder,
                  GraphAssembler, GraphCompiler, PathFinder

## Failure Modes

dataDir inexistant → erreur claire "data/ introuvable"
Source postgres sans config → erreur "connectionString ou database requis"

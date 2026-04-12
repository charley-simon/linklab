## Domain Concepts

GraphCompiler v2
JsonSchemaExtractor
SchemaAnalyzer
GraphBuilder
GraphAssembler
CompiledGraph

## Related Use Cases

UC-C1 — Routes physiques
UC-C2 — Routes sémantiques
UC-Q1 — generateSQL

---

🎯 Objectif

Valider que le pipeline complet JSON → compiled-graph produit
les artefacts corrects sur les données réelles Netflix :
7 nœuds, 64 arêtes, 20 routes physiques + 56 sémantiques.

C'est le test qui garantit que toute la chaîne fonctionne
de bout en bout sur un dataset réel, pas juste sur des graphes
minimalistes construits en mémoire.

📥 Entrée

```
src/examples/netflix/
  data/          ← 7 tables JSON réelles
  use-cases.json ← 8 use cases métier
```

⚙️ Traitement attendu

Lire le `compiled-graph.json` déjà généré par `regenerate.ts netflix`
et vérifier ses propriétés — pas besoin de relancer le pipeline dans le test.

📤 Sortie attendue

```
compiled-graph.json :
  nodes.length     = 7
  routes.length    = 76  (20 physical + 56 semantic)
  version          = '1.0.1'  (ou supérieur)
```

📏 Critères

- 7 nœuds dans le graphe
- 76 routes au total
- 20 routes physiques (semantic=false ou undefined)
- 56 routes sémantiques (semantic=true)
- Route `movies → people` existe
- Route `departments → movies` existe (3 jointures)
- Au moins une route sémantique avec label='actor'
- `compiled.stats.routesCompiled === 76`

Cas de test

[I1.1] compiled-graph charge sans erreur → ✓
[I1.2] 7 nœuds dans compiled.nodes → ✓
[I1.3] 76 routes au total → ✓
[I1.4] 20 routes physiques → ✓
[I1.5] 56 routes sémantiques → ✓
[I1.6] route movies→people existe → ✓
[I1.7] route departments→movies existe avec 3 joins → ✓
[I1.8] route sémantique actor existe → ✓

---

## Architecture Context

```
regenerate.ts netflix
  → JsonSchemaExtractor → SchemaAnalyzer → GraphBuilder
  → GraphAssembler → GraphCompiler v2
  → compiled-graph.json (76 routes)

Ce test lit le fichier produit et valide sa structure.
```

## Dependencies

`src/examples/netflix/compiled-graph.json` — doit exister (régénéré)
GraphCompiler v2 déployé

## Failure Modes

compiled-graph.json absent ou en v1 (20 routes)
→ test échoue avec message clair → lancer `regenerate.ts netflix`

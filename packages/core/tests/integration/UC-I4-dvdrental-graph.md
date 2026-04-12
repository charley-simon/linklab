## Domain Concepts

GraphCompiler v2
PathFinder
CompiledGraph DVDRental

## Related Use Cases

UC-I1 — Netflix pipeline
UC-C1 — Routes physiques

---

🎯 Objectif

Valider que le compiled-graph DVDRental produit depuis PostgreSQL
contient les routes attendues : 210 physiques, les chemins
customer→film et film→actor accessibles.

📥 Entrée

```
src/examples/dvdrental/compiled-graph.json  ← 210 routes
src/examples/dvdrental/graph.json           ← 15 nœuds, 27 edges
```

📏 Critères

- 15 nœuds dans le graphe
- 210 routes dans compiled-graph
- Route `customer → film` existe
- Route `film → actor` existe
- Route `store → customer` existe
- 0 routes sémantiques (les SEMANTIC edges ne sont pas des semantic_view)

Cas de test

[I4.1] 15 nœuds dans graph.json → ✓
[I4.2] 210 routes dans compiled-graph → ✓
[I4.3] route customer→film existe → ✓
[I4.4] route film→actor existe → ✓
[I4.5] route store→customer existe → ✓

---

## Dependencies

`src/examples/dvdrental/compiled-graph.json`
`src/examples/dvdrental/graph.json`

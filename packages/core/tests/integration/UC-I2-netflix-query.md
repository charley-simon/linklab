## Domain Concepts

QueryEngine
CompiledGraph
Dataset Netflix

## Related Use Cases

UC-I1 — Netflix pipeline
UC-Q1 — generateSQL
UC-Q2 — executeInMemory

---

🎯 Objectif

Valider que `QueryEngine` génère le bon SQL et retourne
les bons résultats sur le dataset Netflix réel.

Teste les routes clés : movies→people, departments→movies,
et une route sémantique actor.

📥 Entrée

```
src/examples/netflix/compiled-graph.json  ← 76 routes
src/examples/netflix/data/movies.json     ← 200 films
src/examples/netflix/data/people.json     ← 2363 personnes
src/examples/netflix/data/credits.json    ← 2957 crédits
src/examples/netflix/data/departments.json
src/examples/netflix/data/jobs.json
```

⚙️ Traitement attendu

Charger le compiled-graph et le dataset en mémoire,
exécuter des requêtes via QueryEngine.executeInMemory(),
vérifier les résultats contre les données connues.

Film de référence : id=278 "The Shawshank Redemption"
Département de référence : id=1 "Directing"

📏 Critères

- `movies(278) → people` retourne > 0 résultats
- `departments(Directing) → movies` retourne > 0 résultats
- `movies(278) → people [actor]` retourne ≤ résultats de la route physique
- SQL généré pour movies→people contient 2 INNER JOIN
- SQL généré pour departments→movies contient 3 INNER JOIN

Cas de test

[I2.1] executeInMemory movies(278)→people : résultats > 0 → ✓
[I2.2] executeInMemory departments('Directing')→movies : résultats > 0 → ✓
[I2.3] generateSQL movies→people : 2 INNER JOIN → ✓
[I2.4] generateSQL departments→movies : 3 INNER JOIN → ✓
[I2.5] résultats movies(278)→people[actor] ≤ movies(278)→people → ✓

---

## Architecture Context

```
Test d'intégration réel :
  QueryEngine(compiledGraph)
  .executeInMemory({ from:'movies', to:'people', filters:{id:278} }, dataset)
  → résultats vérifiés contre les données Netflix
```

## Dependencies

`src/examples/netflix/compiled-graph.json`
`src/examples/netflix/data/*.json`
QueryEngine v2

## Failure Modes

Film id=278 absent du dataset → résultats vides
→ vérifier que movies.json contient id=278

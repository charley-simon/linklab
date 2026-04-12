## Domain Concepts

QueryEngine
CompiledGraph
RouteInfo
Dataset

## Related Use Cases

UC-Q1 — generateSQL (même route, exécution différente)
UC-Q3 — SQL sémantique avec condition

---

🎯 Objectif

Garantir que `QueryEngine.executeInMemory()` retourne les bons
enregistrements depuis un dataset JSON, en appliquant les filtres
et les jointures dans l'ordre correct de la route compilée.

C'est le moteur de navigation en mode JSON — utilisé par le TUI,
par les exemples netflix/musicians, et par les tests qui n'ont pas
de base PostgreSQL disponible. Il doit produire exactement les mêmes
résultats que le SQL généré par `generateSQL()`.

📥 Entrée

API testée :
```
engine.executeInMemory(
  options: QueryOptions,
  dataset: Record<string, any[]>
): any[]
```

Dataset minimal utilisé :
```typescript
const dataset = {
  movies: [
    { id: 278, title: 'The Shawshank Redemption' },
    { id: 680, title: 'Pulp Fiction' },
  ],
  credits: [
    { movieId: 278, personId: 1 },
    { movieId: 278, personId: 2 },
    { movieId: 680, personId: 3 },
  ],
  people: [
    { id: 1, name: 'Tim Robbins' },
    { id: 2, name: 'Morgan Freeman' },
    { id: 3, name: 'John Travolta' },
  ],
  departments: [
    { id: 1, name: 'Directing' },
    { id: 2, name: 'Acting' },
  ],
  jobs: [
    { id: 1, departmentId: 1 },  // Director
    { id: 2, departmentId: 2 },  // Actor
  ],
}
```

⚙️ Traitement attendu

1. Filtre la table source avec `filters`
2. Pour chaque edge dans `primary.edges` (jointure successive) :
   - Collecte les valeurs de `fromCol` dans les résultats courants
   - Filtre la table suivante (`path[i+1]`) sur `toCol` dans ce set
3. Retourne le tableau final (enregistrements de la table `to`)

Algorithme de hash-join :
```typescript
const validKeys = new Set(results.map(r => r[edge.fromCol]))
results = nextData.filter(row => validKeys.has(row[edge.toCol]))
```

📤 Sortie

```typescript
any[]  // enregistrements de la table `to` correspondant aux filtres
// [] si aucun résultat — pas null
```

📏 Critères

- Retourne uniquement les enregistrements de la table `to`
- Applique les filtres sur la table `from` avant les jointures
- Jointures en cascade : résultats de chaque étape alimentent la suivante
- Retourne `[]` si aucun enregistrement matche — jamais `null`
- Table source manquante dans dataset → lève Error
- Table intermédiaire manquante → lève Error
- Sans filtres : retourne tous les enregistrements accessibles

Cas de test

[Q2.1] movies(278) → people : retourne Tim Robbins et Morgan Freeman → ✓
[Q2.2] movies(680) → people : retourne John Travolta uniquement → ✓
[Q2.3] sans filtre → people : retourne tous les acteurs de tous les films → ✓
[Q2.4] filtre sans résultat (id=9999) : retourne [] → ✓
[Q2.5] departments('Directing') → movies : retourne les films réalisés → ✓
[Q2.6] table source manquante : lève Error → ✓
[Q2.7] table intermédiaire manquante : lève Error → ✓

---

## Architecture Context

```
TUI Explorer (mode memory) :
  const results = engine.executeInMemory(
    { from:'movies', to:'people', filters:{id:278} },
    dataset   // chargé depuis data/*.json
  )

netflix/run.ts :
  const cast = await cinema.movies(278).people
  → NavigationEngine → executeInMemory → résultats

Test d'intégration sans BDD :
  engine.executeInMemory(...) ≡ résultat attendu de generateSQL(...)
  → les deux doivent être cohérents
```

## Dependencies

CompiledGraph.routes
RouteInfo.primary.edges (fromCol, toCol)
Dataset : Record<string, any[]>

## Failure Modes

Dataset incomplet (table manquante)
→ Error avec nom de table manquante — message actionnable

Colonne de jointure absente dans un enregistrement
→ `row[edge.fromCol]` = undefined → Set contient undefined
→ jointure silencieusement incorrecte
→ protection recommandée : filtrer les undefined avant le Set

Route avec condition (semantic v2)
→ executeInMemory v1 ignore la condition → résultats incorrects
→ voir UC-Q3 pour le comportement v2

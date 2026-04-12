## Domain Concepts

QueryEngine v2
RouteInfo.semantic
RouteStep.condition
QueryOptions.semantic

## Related Use Cases

UC-C2 — Routes sémantiques compilées
UC-Q1 — generateSQL physique
UC-Q2 — executeInMemory physique

---

🎯 Objectif

Garantir que `QueryEngine v2` supporte le paramètre `semantic`
dans `QueryOptions`, génère le SQL avec condition sur la table
de jonction, et applique cette condition dans `executeInMemory`.

Sans ce UC, `movies.actors` et `movies.directors` retournent
la même chose — tout le contenu de `credits` sans filtre jobId.
La distinction sémantique est le cœur de la valeur ajoutée de
LinkLab sur un schéma avec table de jonction typée.

📥 Entrée

API testée (v2) :
```typescript
// QueryOptions enrichi
interface QueryOptions {
  from:      string
  to:        string
  filters?:  Record<string, any>
  semantic?: string    // ← v2 : label de la route sémantique
}

engine.generateSQL(options: QueryOptions): string
engine.executeInMemory(options: QueryOptions, dataset): any[]
engine.getRoute(from: string, to: string, semantic?: string): RouteInfo
```

CompiledGraph avec route sémantique :
```typescript
// Route sémantique movies → people [actor]
{
  from: 'movies', to: 'people',
  semantic: true,
  label: 'actor',
  primary: {
    path:  ['movies', 'credits', 'people'],
    edges: [
      { fromCol: 'id', toCol: 'movieId', condition: { jobId: 1 } },
      { fromCol: 'personId', toCol: 'id' }
    ],
    weight: 0.1, joins: 2, avgTime: 0.1
  },
  fallbacks: [], alternativesDiscarded: 0
}
```

Dataset :
```typescript
{
  movies:  [{ id: 278, title: 'Shawshank' }],
  credits: [
    { movieId: 278, personId: 1, jobId: 1 },  // actor
    { movieId: 278, personId: 2, jobId: 2 },  // director
  ],
  people:  [
    { id: 1, name: 'Tim Robbins' },
    { id: 2, name: 'Frank Darabont' },
  ],
}
```

⚙️ Traitement attendu

**`getRoute(from, to, semantic)` v2 :**
1. Si `semantic` fourni : cherche `routes.find(r => r.from===from && r.to===to && r.label===semantic)`
2. Si non trouvé : fallback sur route physique
3. Si `semantic` absent : comportement v1 (route physique)

**`generateSQL` v2 avec condition :**
- Si `edge.condition` présent → ajouter `AND {joinTable}.{key} = {val}` sur le JOIN
```sql
INNER JOIN credits ON movies.id = credits.movieId AND credits.jobId = 1
```

**`executeInMemory` v2 avec condition :**
- Si `edge.condition` présent → filtrer les résultats intermédiaires
```typescript
const conditionFilter = edge.condition
  ? (row: any) => Object.entries(conditionFilter).every(([k,v]) => row[k] === v)
  : () => true
results = nextData.filter(row => validKeys.has(row[edge.toCol]) && conditionFilter(row))
```

📤 Sortie

```sql
-- generateSQL({ from:'movies', to:'people', filters:{id:278}, semantic:'actor' })
SELECT people.*
FROM movies
  INNER JOIN credits ON movies.id = credits.movieId AND credits.jobId = 1
  INNER JOIN people  ON credits.personId = people.id
WHERE movies.id = 278
```

```typescript
// executeInMemory({ ..., semantic:'actor' }, dataset)
[{ id: 1, name: 'Tim Robbins' }]  // jobId=1 seulement, pas Frank Darabont
```

📏 Critères

- `semantic:'actor'` → route avec `label==='actor'` utilisée
- `semantic` absent → route physique (comportement v1 inchangé)
- `semantic` non trouvé → fallback sur route physique (pas d'erreur)
- SQL avec condition : `AND credits.jobId = 1` sur le bon INNER JOIN
- executeInMemory filtre les enregistrements intermédiaires par condition
- Résultats `semantic:'actor'` ≠ résultats sans semantic (validation clé)

Cas de test

[Q3.1] getRoute avec semantic='actor' : retourne la route sémantique → ✓
[Q3.2] getRoute semantic absent : retourne la route physique → ✓
[Q3.3] generateSQL semantic='actor' : SQL contient 'AND credits.jobId = 1' → ✓
[Q3.4] generateSQL sans semantic : SQL sans condition AND → ✓
[Q3.5] executeInMemory semantic='actor' : retourne uniquement les acteurs → ✓
[Q3.6] executeInMemory sans semantic : retourne tous (acteurs + réalisateurs) → ✓
[Q3.7] résultats semantic != résultats physique sur même dataset → ✓

---

## Architecture Context

```
TUI Explorer v2 :
  tree affiche 'actor', 'director', 'writer' comme nœuds distincts
  clic sur 'actor' → executeInMemory({ semantic:'actor' })
  → Tim Robbins, Morgan Freeman (pas Frank Darabont)

API fluente v2 :
  cinema.movies(278).actors   → semantic:'actor'
  cinema.movies(278).directors → semantic:'director'
  cinema.movies(278).people   → physique (tous)
```

## Dependencies

QueryEngine v1 (étendu — rétrocompatible)
CompiledGraph avec routes sémantiques (UC-C2)
RouteStep.condition : Record<string, any>

## Failure Modes

semantic label inexistant dans compiled.routes
→ fallback route physique silencieux — pas d'erreur
→ résultats corrects mais non filtrés (comportement dégradé acceptable)

condition avec valeur string vs number
→ `credits.jobId === '1'` vs `=== 1` → mismatch silencieux
→ protection : normaliser les types dans la condition

Route sémantique sans condition
→ comportement identique à la route physique
→ label présent mais aucun filtre appliqué (correct — pas de filtre voulu)

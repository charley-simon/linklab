## Domain Concepts

Trail query SQL — CTE globale
_executeQueryCTE
Sous-requêtes WITH ... AS (...)
Pas de IN géants

## Related Use Cases

UC-T2 — Trail query SQL (allers-retours)

---

🎯 Objectif

Vérifier que `_executeQueryCTE` génère une seule requête SQL WITH ... AS (...)
au lieu de N allers-retours avec des clauses IN potentiellement géantes.

📥 Entrée

```typescript
// dvdrental — mode Postgres
dvdrental.film('Academy Dinosaur').actor
dvdrental.film('Academy Dinosaur').actor.film
dvdrental.customer('MARY').rental.film           // route longue (3 entités)
dvdrental.actor('PENELOPE').film.actor.film      // 4 étapes
```

📤 Sortie

```sql
-- film('Academy Dinosaur').actor
WITH
  step0 AS (SELECT DISTINCT film.* FROM film WHERE film.title ILIKE 'Academy Dinosaur'),
  step1 AS (
    SELECT DISTINCT actor.*
    FROM actor
    INNER JOIN film_actor ON film_actor.actor_id = actor.actor_id
    INNER JOIN step0      ON step0.film_id = film_actor.film_id
  )
SELECT * FROM step1
```

📏 Critères

- Une seule requête SQL (pas d'allers-retours)
- Pas de clause IN avec des milliers d'IDs
- ILIKE pour les filtres string (case-insensitive)
- Court-circuit si étape précédente retourne 0 rows
- Résultats identiques au mode in-memory pour les données testées

Cas de test

[T3.1] film→actor → 1 CTE, 10 acteurs → ✓
[T3.2] film→actor→film → 2 CTEs, 244 films → ✓
[T3.3] customer→rental→film → 2 CTEs, films loués → ✓
[T3.4] ILIKE case-insensitive → 'penelope' matche 'PENELOPE' → ✓
[T3.5] court-circuit si 0 rows → pas de requête suivante → ✓

---

## Architecture Context

```
_executeQuery (provider present)
  ↓ délègue à _executeQueryCTE
  ↓ buildCTEStep pour chaque étape du Trail
  ↓ Une seule requête SQL WITH ... AS (...)
  ↓ provider.query(sql)
```

## Dependencies

- PostgresProvider
- CompiledGraph (routes, edges, path)
- QueryEngine.getRoute()

## Failure Modes

- Route introuvable → step vide (WHERE 1=0)
- Table intermédiaire manquante → erreur SQL

## Observability Impact

- Réduction dramatique du nombre de requêtes SQL (N → 1)
- Élimination des IN géants (ex: IN(16044) → CTE)
- Temps de réponse réduit sur les Trails profonds

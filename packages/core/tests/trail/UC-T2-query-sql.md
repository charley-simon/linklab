## Domain Concepts

Trail query mode (SQL)
_fetchStep mode SQL
Contexte cumulatif via sous-requête IN
PK inférée depuis colonnes

## Related Use Cases

UC-T1 — Trail query mode in-memory (Netflix)
UC-Q2 — executeInMemory
UC-Q3 — SQL sémantique

---

🎯 Objectif

Garantir que le mode query cumulatif fonctionne en mode SQL (PostgreSQL),
en utilisant dvdrental comme base de données réelle.

Sans ce UC, le mode query ne serait validé qu'en mémoire.
Avec ce UC, on valide que `_fetchStep` génère du SQL correct avec
contraintes `IN (ids)` entre les étapes.

📥 Entrée

API testée (dvdrental via PostgreSQL) :
```typescript
import { loadGraph } from '@linklab/core'
import { PostgresProvider } from '@linklab/core/providers'

const provider = new PostgresProvider({ ...pgConfig })
const dvd = await loadGraph('./dvdrental.json', { provider })

// Trail 2 étapes
await dvd.film('Academy Dinosaur').actor

// Trail 3 étapes — contexte cumulatif
await dvd.film('Academy Dinosaur').actor.film

// Customer → films loués
await dvd.customer('MARY SMITH').rental.film

// Mode nav — comportement stateless
await dvd.nav.film('Academy Dinosaur').actor.film
```

Données de référence (dvdrental réel) :
- 'Academy Dinosaur' : film_id à déterminer via SQL
- 'MARY SMITH' : customer connue dans dvdrental
- film→actor via film_actor (pivot)
- customer→film via rental→inventory→film (3 jointures)

⚙️ Traitement attendu

**Trail film('Academy Dinosaur').actor.film :**
```
Étape 1 : film WHERE title='Academy Dinosaur'     → [film_id: X]
Étape 2 : actor WHERE film_id IN [X]              → [actor_id: A, B, ...]
Étape 3 : film WHERE actor_id IN [A, B, ...]      → films avec ces acteurs
```

SQL étape 3 (attendu) :
```sql
SELECT DISTINCT film.*
FROM actor
  JOIN film_actor ON actor.actor_id = film_actor.actor_id
  JOIN film ON film_actor.film_id = film.film_id
WHERE actor.actor_id IN (A, B, ...)
```

**Mode nav — stateless :**
```
film('Academy Dinosaur') → actor → film (TOUS les films de ces acteurs, sans contrainte)
```
Résultat identique au mode query dans ce cas (pas de semantic perdu).

📤 Sortie

```typescript
// T2.1 — acteurs d'Academy Dinosaur
const actors = await dvd.film('Academy Dinosaur').actor
actors.length > 0
actors[0].first_name !== undefined  // champs actor présents

// T2.2 — films partageant des acteurs (contexte cumulatif SQL)
const films = await dvd.film('Academy Dinosaur').actor.film
films.length > 0
films.some(f => f.title === 'Academy Dinosaur')  // le film lui-même est inclus

// T2.3 — films loués par Mary Smith
const rentals = await dvd.customer('MARY SMITH').rental.film
rentals.length > 0

// T2.4 — nav = query sur ce cas (pas de semantic entre étapes)
const navFilms   = await dvd.nav.film('Academy Dinosaur').actor.film
const queryFilms = await dvd.film('Academy Dinosaur').actor.film
navFilms.length === queryFilms.length
```

📏 Critères

- Trail SQL 2 étapes : résultat non vide avec champs corrects
- Trail SQL 3 étapes : contexte d'étape 1 préservé dans étape 3
- PK inférée correctement depuis columns (`film_id`, `actor_id`)
- `IN (ids)` correctement injecté dans le SQL généré
- Sans provider → erreur explicite (pas de fallback silencieux)
- Mode nav préserve le comportement original

Cas de test

[T2.1] film('Academy Dinosaur').actor → acteurs non vides avec first_name → ✓
[T2.2] film('Academy Dinosaur').actor.film → films non vides, inclut Academy Dinosaur → ✓
[T2.3] customer('MARY SMITH').rental.film → films loués non vides → ✓
[T2.4] nav = query sur trail sans semantic → même nombre de résultats → ✓
[T2.5] actor.film.length < total films (contexte restreint les résultats) → ✓

---

## Architecture Context

```
_fetchStep SQL avec idConstraint :
  film('Academy Dinosaur')
    ↓ SQL₁: SELECT DISTINCT film.* FROM film WHERE film.title = 'Academy Dinosaur'
    ↓ ids = [film_id de Academy Dinosaur]
  .actor
    ↓ SQL₂: SELECT DISTINCT actor.* FROM film
              JOIN film_actor ON film.film_id = film_actor.film_id
              JOIN actor ON film_actor.actor_id = actor.actor_id
              WHERE film.film_id IN (ids)
    ↓ ids = [actor_ids]
  .film
    ↓ SQL₃: SELECT DISTINCT film.* FROM actor
              JOIN film_actor ON actor.actor_id = film_actor.actor_id
              JOIN film ON film_actor.film_id = film.film_id
              WHERE actor.actor_id IN (actor_ids)  ← contexte préservé
    ↓ result = films partageant des acteurs avec Academy Dinosaur
```

## Dependencies

PostgresProvider (connexion dvdrental)
DomainNode._fetchStep mode SQL
DomainNode._getPK — inférence depuis columns
compiled-graph dvdrental (sans routes sémantiques, PKs custom)

## Failure Modes

PK non trouvée → fallback 'id' → SQL incorrect
→ mitigation : `_getPK` infère depuis `{entity}_id` dans columns

Provider absent → exception explicite depuis _executeQuery
→ message clair avec suggestion d'utiliser dataset ou provider

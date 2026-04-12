## Domain Concepts

DomainProxy (mode query — défaut)
DomainProxy (mode nav — préfixe explicite)
Trail cumulatif
Contexte préservé entre pivots
Égalités sémantiques

## Related Use Cases

UC-D1 — DomainProxy résolution sémantique
UC-D2 — Méthodes Array natives
UC-L1 — loadGraph usage minimal

---

🎯 Objectif

Garantir que le Trail en mode **query** (défaut) est **déclaratif et cumulatif** :
le contexte est préservé à chaque pivot, et les expressions sémantiquement
équivalentes retournent les mêmes résultats.

Sans ce UC :
- `cinema.movies('Inception').director.movies` retourne TOUS les films de Nolan
  (le contexte 'Inception' est perdu après le pivot `director`)
- Les égalités sémantiques ne tiennent pas
- La distinction `people` vs `directors` n'a pas d'effet cumulatif

Avec ce UC :
- `cinema.movies('Inception').director.movies` retourne uniquement les films
  de Nolan **en tant que director** — contexte cumulatif préservé
- Les trois expressions suivantes sont équivalentes :
  ```
  cinema.movies('Inception').director.movies
  cinema.directors('Nolan').movies
  cinema.people('Nolan').director.movies
  ```

📥 Entrée

API testée (données Netflix réelles) :
```typescript
import { loadGraph } from '@linklab/core'

// Graphe Netflix compilé avec routes sémantiques
const cinema = await loadGraph('./src/examples/simple/cinema.json', {
  dataDir: './src/examples/netflix/data'
})

// Mode query (défaut)
await cinema.movies('Inception').director
await cinema.movies('Inception').director.movies
await cinema.directors('Nolan').movies
await cinema.people('Nolan').director.movies
await cinema.people('Nolan').movies

// Mode nav (explicite — comportement actuel)
await cinema.nav.movies('Inception').director.movies
```

Données de référence (Netflix réel) :
- Christopher Nolan : `personId = 525`
- Inception : `movieId = 27205`
- Director : `jobId = 2`
- Nolan a dirigé **6 films** (jobId=2)
- Nolan a **12 crédits au total** (jobIds 2, 3, 5)
- Nolan est Director ET Writer sur Inception (jobIds 2 et 3)

⚙️ Traitement attendu

**Mode query (défaut) :**

Chaque étape préserve le contexte précédent en passant les IDs trouvés
comme contrainte à l'étape suivante.

```
movies('Inception')           → [movieId: 27205]
.director                     → people WHERE credits.movie_id IN [27205]
                                        AND credits.job_id = 2
                              → [personId: 525 (Nolan)]
.movies                       → movies WHERE credits.person_id IN [525]
                                        AND credits.job_id = 2  ← contexte préservé
                              → 6 films dirigés par Nolan
```

**Mode nav (préfixe `.nav`) :**

Comportement actuel — chaque pivot repart de zéro :

```
movies('Inception')           → [movieId: 27205]
.director                     → [personId: 525]
.movies                       → TOUS les films de personId 525 (tous jobs)
                              → 12 films (pas seulement les 6 dirigés)
```

📤 Sortie

```typescript
// T1.1 — director d'Inception = Nolan
const director = await cinema.movies('Inception').director
director.length === 1  // Nolan uniquement (jobId=2)
director[0].name === 'Christopher Nolan'

// T1.2 — films de Nolan en tant que director (query cumulatif)
const films1 = await cinema.movies('Inception').director.movies
films1.length === 6  // films dirigés par Nolan

// T1.3 — égalité sémantique
const films2 = await cinema.directors('Nolan').movies
const films3 = await cinema.people('Nolan').director.movies
films1.length === films2.length === films3.length  // tous = 6

// T1.4 — people vs directors
const peopleMovies = await cinema.people('Nolan').movies
peopleMovies.length > films1.length  // tous crédits > director seul

// T1.5 — nav préserve l'ancien comportement
const navFilms = await cinema.nav.movies('Inception').director.movies
navFilms.length > films1.length  // nav = tous les films de Nolan (tous jobs)
```

📏 Critères

- `cinema.movies('Inception').director` → uniquement Nolan (jobId=2)
- `cinema.movies('Inception').director.movies` → 6 films (contexte cumulatif)
- Les trois expressions équivalentes retournent le même nombre de films
- `cinema.people('Nolan').movies` > `cinema.directors('Nolan').movies`
- `cinema.nav.movies('Inception').director.movies` retourne plus de films que le mode query
- `cinema.nav` préserve l'ancien comportement sans régression

Cas de test

[T1.1] movies('Inception').director → Nolan uniquement (jobId=2) → ✓
[T1.2] movies('Inception').director.movies → 6 films (contexte cumulatif) → ✓
[T1.3] director.movies = directors('Nolan').movies (égalité sémantique A=B) → ✓
[T1.4] director.movies = people('Nolan').director.movies (égalité sémantique A=C) → ✓
[T1.5] people('Nolan').movies > directors('Nolan').movies (people ≠ directors) → ✓
[T1.6] nav.movies('Inception').director.movies ≠ query (nav perd le contexte) → ✓
[T1.7] nav.directors('Nolan').movies = directors('Nolan').movies (nav = query sur 1 pivot) → ✓

---

## Architecture Context

```
Mode query — _execute() cumulatif :
  movies('Inception')
    ↓ anchor = { entity: 'movies', filters: {title: 'Inception'} }
    ↓ executeStep → ids = [27205]
  .director
    ↓ executeStep avec constraint: movieId IN [27205] AND jobId = 2
    ↓ ids = [525]
  .movies
    ↓ executeStep avec constraint: personId IN [525] AND jobId = 2  ← clé
    ↓ result = 6 films

Mode nav — _execute() actuel (stateless) :
  movies('Inception')
    ↓ anchor = movies, filters = {title: 'Inception'}
  .director
    ↓ new anchor = people, semantic = director_in
    ↓ OUBLIE le contexte movies
  .movies
    ↓ tous les films de personId 525 (jobId ignoré)
    ↓ result = N films (> 6)
```

## Dependencies

DomainProxy — mode query (nouveau) + mode nav (préfixe)
Graph.domain() — expose `.nav` comme sous-proxy en mode nav
compiled-graph.json Netflix — routes sémantiques avec condition jobId

## Failure Modes

`cinema.nav` non trouvé
→ undefined silencieux — pas de régression sur le mode actuel

Égalité sémantique avec données absentes
→ les trois expressions retournent [] — cohérent, pas d'exception

Contexte vide entre étapes (aucun ID trouvé à l'étape N)
→ l'étape N+1 retourne [] — propagation correcte du vide

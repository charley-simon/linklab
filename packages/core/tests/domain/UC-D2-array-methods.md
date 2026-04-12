## Domain Concepts

DomainNode
DomainProxy
LinkLabResult (tableau enrichi)
Méthodes Array natives

## Related Use Cases

UC-D1 — DomainProxy résolution sémantique
UC-L1 — loadGraph usage minimal

---

🎯 Objectif

Garantir que les méthodes Array natives (`map`, `filter`, `find`, `forEach`,
`some`, `every`, `reduce`, `slice`, `flat`, `flatMap`, `includes`, `findIndex`,
`reduceRight`) sont directement chaînables sur un DomainNode sans `await`
intermédiaire.

Sans ce UC, le dev est forcé d'écrire :
```typescript
const films = await cinema.movies   // étape intermédiaire obligatoire
films.forEach(f => ...)             // seulement ensuite
```

Avec ce UC, l'API est vraiment fluente :
```typescript
await cinema.movies.forEach(f => console.log(f.title))
await cinema.movies.map(f => f.title)
await cinema.movies.filter(f => f.rating === 'PG')
```

📥 Entrée

API testée :
```typescript
// Toutes ces formes déclenchent l'exécution et appliquent la méthode
await domain.movies.forEach(fn)
await domain.movies.map(fn)
await domain.movies.filter(fn)
await domain.movies.find(fn)
await domain.movies.findIndex(fn)
await domain.movies.some(fn)
await domain.movies.every(fn)
await domain.movies.reduce(fn, init)
await domain.movies.reduceRight(fn, init)
await domain.movies.slice(start, end)
await domain.movies.flat()
await domain.movies.flatMap(fn)
await domain.movies.includes(value)
```

Mêmes fixtures que UC-D1 (COMPILED + DATASET).

⚙️ Traitement attendu

Le Proxy intercepte chaque méthode Array avant l'`await` :
```typescript
if (ARRAY_METHODS.includes(prop)) {
  return (...args) =>
    target._execute().then(result => result[prop](...args))
}
```

1. `cinema.movies.map(fn)` → le Proxy intercepte `map`
2. Retourne une fonction qui appelle `_execute()` puis `.map(fn)` sur le `LinkLabResult`
3. `await` résout la Promise — le dev obtient directement le résultat de `.map(fn)`

📤 Sortie

```typescript
// forEach — undefined (comme Array.forEach)
await domain.movies.forEach(f => console.log(f.title))
// → undefined, effets de bord exécutés

// map — tableau transformé
const titles = await domain.movies.map(f => f.title)
// → ['Shawshank', 'Pulp Fiction']

// filter — sous-tableau
const pg = await domain.movies.filter(f => f.id > 100)
// → [{ id: 278, ... }, ...]  ou []

// find — premier élément ou undefined
const film = await domain.movies.find(f => f.id === 278)
// → { id: 278, title: 'Shawshank' }

// findIndex — indice ou -1
const idx = await domain.movies.findIndex(f => f.id === 278)
// → 0

// some — boolean
const hasFilm = await domain.movies.some(f => f.id === 278)
// → true

// every — boolean
const allHaveId = await domain.movies.every(f => f.id != null)
// → true

// reduce — valeur accumulée
const ids = await domain.movies.reduce((acc, f) => [...acc, f.id], [])
// → [278, 680]

// slice — sous-tableau
const first = await domain.movies.slice(0, 1)
// → [{ id: 278, title: 'Shawshank' }]

// includes — boolean (sur valeurs primitives)
// flat, flatMap — sur tableaux imbriqués
```

📏 Critères

- Toutes les méthodes Array listées sont interceptées par le Proxy
- Chaque méthode déclenche `_execute()` exactement une fois
- Le résultat est identique à appeler la méthode sur `LinkLabResult` directement
- `forEach` retourne `undefined` (comportement Array natif)
- `find` retourne `undefined` si non trouvé (pas d'exception)
- `filter` retourne `[]` si aucun résultat (pas d'exception)
- Méthode inconnue → `undefined` (comportement Proxy existant)

Cas de test

[D2.1] forEach — exécute l'effet de bord pour chaque élément → ✓
[D2.2] map — retourne un tableau transformé → ✓
[D2.3] filter — retourne les éléments correspondants → ✓
[D2.4] filter — retourne [] si aucun résultat → ✓
[D2.5] find — retourne le premier élément correspondant → ✓
[D2.6] find — retourne undefined si non trouvé → ✓
[D2.7] findIndex — retourne l'indice correct → ✓
[D2.8] some — retourne true si un élément correspond → ✓
[D2.9] every — retourne true si tous les éléments correspondent → ✓
[D2.10] reduce — accumule correctement → ✓
[D2.11] slice — retourne le sous-tableau correct → ✓
[D2.12] includes — détecte une valeur dans le tableau → ✓
[D2.13] flatMap — aplatit et transforme → ✓
[D2.14] méthode inconnue → undefined sans exception → ✓

---

## Architecture Context

```
await cinema.movies.map(f => f.title)
  ↓ Proxy.get(target, 'map')
  ↓ 'map' ∈ ARRAY_METHODS → intercepté
  ↓ retourne (...args) => target._execute().then(r => r.map(...args))
  ↓ appel avec (f => f.title)
  ↓ _execute() → LinkLabResult (tableau enrichi)
  ↓ LinkLabResult.map(f => f.title)
  ↓ ['Shawshank', 'Pulp Fiction']
```

## Dependencies

DomainNode.Proxy (interception ARRAY_METHODS)
LinkLabResult (tableau enrichi — base pour les méthodes)
_execute() (déclenché une seule fois par méthode)

## Failure Modes

Méthode Array appelée sans arguments requis
→ comportement natif JavaScript (ex: reduce sans init sur tableau vide → TypeError)
→ pas de protection spécifique — comportement identique à Array

find/filter sur dataset vide
→ find → undefined, filter → [] — jamais d'exception

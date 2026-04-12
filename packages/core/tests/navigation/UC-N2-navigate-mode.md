## Domain Concepts

NavigationEngine (mode NAVIGATE)
Resolver
Frame
Trail
EngineStepResult

## Related Use Cases

UC-N1 — Mode PATHFIND
Trail Model — `docs/ai/trail-model.md`

---

🎯 Objectif

Garantir que `NavigationEngine.forNavigation()` résout correctement
une stack de frames sémantiques étape par étape, en trouvant l'edge
du graphe qui connecte chaque frame UNRESOLVED à la précédente RESOLVED.

C'est le moteur du Trail — il transforme une intention de navigation
(`directors(2) → movies → actors`) en une série de résolutions concrètes.
Sans lui, l'API fluente `cinema.directors('Nolan').movies.actors` ne
peut pas fonctionner.

📥 Entrée

API testée :
```typescript
NavigationEngine.forNavigation(graph, { stack: Frame[] }): NavigationEngine
await engine.run(maxSteps?: number): Promise<EngineStepResult[]>
engine.getCurrentStack(): Frame[]
```

Frame :
```typescript
{
  entity:     string                          // nom de l'entité (table)
  id?:        any                             // id si sélectionné
  state?:     'RESOLVED' | 'UNRESOLVED' | 'DEFERRED'
  resolvedBy?: {
    relation: string                          // nom de l'edge utilisé
    via:      string                          // colonne de jointure
    filters:  FrameFilter[]                  // conditions appliquées
  }
}
```

Stack initiale pour `directors(2).movies` :
```typescript
[
  { entity: 'directors', id: 2,         state: 'RESOLVED'   },
  { entity: 'movies',                   state: 'UNRESOLVED' },
]
```

Graphe utilisé :
```
CINEMA_MINI :
  directors → credits (via directorId)
  credits → movies (via movieId)
  movies → credits (via movieId)
  credits → people (via personId)
```

⚙️ Traitement attendu

À chaque step de `run(maxSteps)` :
1. `Resolver.resolve(stack)` traite la première frame UNRESOLVED
2. Le Resolver remonte la stack pour trouver une frame RESOLVED
3. Cherche l'edge du graphe qui va de l'entité RESOLVED vers l'UNRESOLVED
4. Résout la frame : `state:'RESOLVED'`, `resolvedBy` renseigné
5. Si aucun edge trouvé → `state:'DEFERRED'`
6. `run()` s'arrête quand toutes les frames sont RESOLVED ou DEFERRED

📤 Sortie

```typescript
// Après run(10) sur stack [directors(2) RESOLVED, movies UNRESOLVED]
[
  {
    time: 0, mode: 'NAVIGATE', phase: 'RESOLVE',
    resolvedCount: 1, unresolvedCount: 1
  },
  {
    time: 1, mode: 'NAVIGATE', phase: 'COMPLETE',
    resolvedCount: 2, unresolvedCount: 0,
    result: { type: 'SUCCESS' }
  }
]

// Stack finale :
[
  { entity: 'directors', id: 2, state: 'RESOLVED' },
  { entity: 'movies', state: 'RESOLVED',
    resolvedBy: { relation: '...', via: 'movieId', filters: [...] } }
]
```

📏 Critères

- `getMode()` retourne `'NAVIGATE'`
- Après `run()`, les frames RESOLVED ont `resolvedBy` renseigné
- Une frame avec edge disponible passe à `'RESOLVED'`
- Une frame sans edge disponible passe à `'DEFERRED'` (pas d'exception)
- `getCurrentStack()` reflète l'état après les résolutions
- `run()` s'arrête dès que plus rien à résoudre (phase COMPLETE)
- `maxSteps` borne le nombre d'itérations

Cas de test

[N2.1] getMode() === 'NAVIGATE' → ✓
[N2.2] frame UNRESOLVED avec edge disponible → passe à RESOLVED → ✓
[N2.3] resolvedBy renseigné : relation, via, filters → ✓
[N2.4] frame UNRESOLVED sans edge → passe à DEFERRED (pas d'exception) → ✓
[N2.5] getCurrentStack() reflète l'état après run() → ✓
[N2.6] run() s'arrête à phase COMPLETE quand tout résolu → ✓
[N2.7] maxSteps respecté même si frames restent UNRESOLVED → ✓

---

## Architecture Context

```
cinema.directors('Nolan').movies.actors
  ↓ DomainProxy construit la stack
  [
    { entity:'directors', id:2,    state:'RESOLVED'   },
    { entity:'movies',             state:'UNRESOLVED' },
    { entity:'actors',             state:'UNRESOLVED' },
  ]
  ↓ NavigationEngine.forNavigation(graph, { stack })
  ↓ engine.run(10)
  ↓ Resolver résout movies (via credits.directorId = 2)
  ↓ Resolver résout actors (via credits.personId)
  ↓ Stack finale : toutes RESOLVED
  ↓ QueryEngine.executeInMemory() sur chaque frame
  ↓ Résultats
```

## Dependencies

Resolver (résolution edge par edge)
Graph (edges pour trouver les connexions)
Frame (état de résolution)

## Failure Modes

Stack vide
→ run() retourne [] sans erreur

Toutes les frames déjà RESOLVED
→ run() retourne immédiatement [COMPLETE]

Cycle dans la stack (A → B → A)
→ Resolver marque en DEFERRED au lieu de boucler
→ maxSteps évite la boucle infinie

Frame avec entity inexistante dans le graphe
→ Resolver ne trouve pas d'edge → DEFERRED

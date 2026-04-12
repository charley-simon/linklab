## Domain Concepts

loadGraph
Graph (niveau bas)
NavigationLink
DomainProxy
GraphSource (string | GraphSourceObject)

## Related Use Cases

UC-D1 — DomainProxy résolution sémantique
UC-Q2 — executeInMemory
UC-Q3 — SQL sémantique

---

🎯 Objectif

Garantir que `loadGraph()` est le point d'entrée minimal de LinkLab :
une ligne pour obtenir un domain proxy opérationnel depuis un graphe compilé.

Sans ce UC, l'usage impose de manipuler `new Graph()`, `compiled`, `rawGraph`
et `.domain()` séparément — friction inutile pour 80% des cas.
Le dev ne doit pas savoir ce qu'est un raw-graph pour naviguer ses données.

📥 Entrée

API testée :
```typescript
import { loadGraph } from '@linklab/core'

// Cas 1 — objet mémoire (tests)
const domain = await loadGraph({ compiled }, { dataset })

// Cas 2 — dataDir automatique
const domain = await loadGraph({ compiled }, { dataDir: './data' })

// Cas 3 — Graph sous-jacent via .graph
domain.graph.from('movies').to('people').path()
domain.graph.linksFrom('movies')
domain.graph.entities
```

CompiledGraph minimal :
```typescript
{
  version: '2.0.0',
  compiledAt: '...',
  config: { weightThreshold: 1000, keepFallbacks: true, maxFallbacks: 2 },
  nodes: [
    { id: 'movies',  type: 'table', primaryKey: 'id' },
    { id: 'credits', type: 'table', primaryKey: 'id' },
    { id: 'people',  type: 'table', primaryKey: 'id' },
  ],
  routes: [
    // route physique movies → people
    { from: 'movies', to: 'people', primary: { path: ['movies','credits','people'], ... } },
    // route sémantique movies → people [actor]
    { from: 'movies', to: 'people', semantic: true, label: 'actor', primary: { ... } },
  ],
  stats: { ... }
}
```

Dataset :
```typescript
{
  movies:  [{ id: 278, title: 'Shawshank' }, { id: 680, title: 'Pulp Fiction' }],
  credits: [
    { id: 1, movieId: 278, personId: 1, jobId: 1 },
    { id: 2, movieId: 278, personId: 2, jobId: 2 },
  ],
  people: [{ id: 1, name: 'Tim Robbins' }, { id: 2, name: 'Frank Darabont' }],
}
```

⚙️ Traitement attendu

**`loadGraph({ compiled }, { dataset })`**
1. Construit un rawGraph minimal depuis `compiled.nodes` (edges vides)
2. Crée un `new Graph(rawGraph, { compiled, dataset })`
3. Retourne `graph.domain()` — le proxy sémantique directement

**`domain.graph`**
- Proxy intercepte `'graph'` → retourne le `Graph` sous-jacent
- Donne accès aux niveaux 2/3/4 sans rompre l'API niveau 1

**`graph.linksFrom(nodeId)`**
- Routes physiques depuis `graphData.edges`
- Routes sémantiques depuis `compiled.routes` (semantic=true)
- Retourne `NavigationLink[]` triés : physiques d'abord, sémantiques ensuite

📤 Sortie

```typescript
// loadGraph retourne le domain proxy directement
const domain = await loadGraph({ compiled }, { dataset })
typeof domain  // 'object' — proxy navigable

// Navigation fonctionne immédiatement
const result = await domain.movies(278).people
result.data.length  // > 0

// .graph accessible
domain.graph instanceof Graph  // true
domain.graph.entities.length   // 3

// linksFrom retourne physiques + sémantiques
domain.graph.linksFrom('movies')
// [
//   { to: 'people', label: 'people', semantic: false },
//   { to: 'people', label: 'actor',  semantic: true  },
// ]
```

📏 Critères

- `loadGraph()` retourne un proxy navigable — pas un `Graph`
- `domain.movies` fonctionne sans appel à `.domain()`
- `domain.graph` retourne le `Graph` sous-jacent
- `domain.graph.linksFrom()` retourne physiques ET sémantiques
- `loadGraph({ compiled })` fonctionne sans rawGraph explicite
- Sans dataset ni provider → navigation retourne données vides sans exception
- `NavigationLink.semantic` distingue vues filtrées des tables physiques

Cas de test

[L1.1] loadGraph({ compiled }, { dataset }) → proxy navigable directement → ✓
[L1.2] domain.movies(278) → QueryResult avec data → ✓
[L1.3] domain.graph → instance Graph → ✓
[L1.4] domain.graph.entities → nodes du graphe → ✓
[L1.5] domain.graph.linksFrom('movies') → routes physiques présentes → ✓
[L1.6] domain.graph.linksFrom('movies') → routes sémantiques présentes → ✓
[L1.7] NavigationLink.semantic=false pour route physique → ✓
[L1.8] NavigationLink.semantic=true pour route sémantique → ✓
[L1.9] loadGraph sans dataset → pas d'exception, data=[] → ✓
[L1.10] domain.graph.linksFrom('unknown') → [] sans exception → ✓

---

## Architecture Context

```
loadGraph({ compiled }, { dataset })
  ↓ rawGraph = { nodes: compiled.nodes, edges: [] }
  ↓ new Graph(rawGraph, { compiled, dataset })
  ↓ graph.domain(graph)           ← passe l'instance pour .graph
  ↓ createDomain(ctx, graphInstance)
  ↓ Proxy { get: 'graph' → graphInstance, 'movies' → DomainNode, ... }
  ↓ retourné à l'appelant — prêt à naviguer

domain.graph.linksFrom('movies')
  ↓ graphData.edges.filter(e => e.from === 'movies')   ← physiques
  ↓ compiled.routes.filter(r => r.from === 'movies' && r.semantic)  ← sémantiques
  ↓ NavigationLink[]
```

## Dependencies

loadGraph (src/api/loadGraph.ts)
Graph.domain() avec graphInstance (src/api/Graph.ts)
createDomain avec .graph (src/api/DomainNode.ts)
Graph.linksFrom() (src/api/Graph.ts)

## Failure Modes

compiled absent ou malformé
→ erreur explicite : "graphe introuvable" ou TypeError sur compiled.nodes
→ jamais silencieux

dataset absent, provider absent
→ domain retourné, navigation retourne data=[]
→ pas d'exception — mode dégradé acceptable pour l'introspection

linksFrom sur entité inconnue
→ retourne [] sans exception

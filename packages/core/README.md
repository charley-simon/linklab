# @linklab/core

> **The graph is the map. The Trail is the traveler.**

> "The Trail defines the path, the history, and the intention.  
> The graph knows the possibilities."

LinkLab associates two concepts:

- **The compiled graph** — the map: entities, relations, optimal routes
- **The Trail** — the traveler: navigation, context, history, intention

The map knows all paths. The traveler decides where to go — and by traveling, enriches the map.

---

## The problem LinkLab solves

In every application, we write the same SQL joins by hand:

```sql
-- Get all actors in films directed by Nolan
SELECT people.*
FROM directors
  INNER JOIN credits ON directors.id = credits.personId AND credits.jobId = 2
  INNER JOIN movies  ON credits.movieId = movies.id
  INNER JOIN credits c2 ON movies.id = c2.movieId AND c2.jobId = 1
  INNER JOIN people  ON c2.personId = people.id
WHERE directors.name = 'Nolan'
```

With LinkLab:

```typescript
cinema.directors('Nolan').movies.actors
```

LinkLab generates the SQL, finds the optimal path in the graph, and improves continuously from usage traces.

---

## Installation

```bash
npm install @linklab/core
```

---

## Quick start

```typescript
import { Graph } from '@linklab/core'
import compiledGraph from './linklab/netflix/netflix.json'
import * as dataset from './data'

const graph = new Graph(compiledGraph, { dataset })
const netflix = graph.domain()

// Fluent navigation
const actors    = await netflix.movies(278).actors
const films     = await netflix.directors('Nolan').movies
const colleagues = await netflix.actors('DiCaprio').movies.directors
```

The result is a plain JavaScript array — map, filter, sort as usual:

```typescript
const titles = await netflix.directors('Nolan').movies
  .then(films => films.filter(f => f.release_year > 2000))
  .then(films => films.map(f => f.title))
// ['Interstellar', 'Inception', 'The Dark Knight'...]
```

---

## How it works

```
Your database or JSON files
    ↓  linklab build
{alias}.json          (compiled graph — precalculated routes)
    ↓  QueryEngine
SQL generated automatically
    ↓  NavigationEngine
Fluent API: cinema.directors('Nolan').movies.actors
```

`linklab build` is a CLI command from `@linklab/cli`. It produces the compiled graph that `@linklab/core` consumes at runtime.

---

## Semantic views

When the same entity appears in multiple roles — actors, directors, writers all being `people` — LinkLab detects this at compile time and generates semantic views automatically:

```
netflix.movies(278).people      → everyone (all roles)
netflix.movies(278).actors      → actors only
netflix.movies(278).director    → director only
netflix.movies(278).writers     → writers only
```

`people('Christopher Nolan').director` and `directors('Christopher Nolan')` are equivalent — same entity, filtered by role. No separate endpoint to maintain.

---

## API levels

```
Level 1  cinema.directors('Nolan').movies.actors
         → semantic facade, transparent, 80% of use cases

Level 2  graph.from('Pigalle').to('Alesia').path(Strategy.Shortest)
         → paths, strategies, Dijkstra

Level 3  graph.entities / .relations / .weights
         → introspection, debug, dashboards

Level 4  graph.weight(edge).set(value) / .compile()
         → metaprogramming, CalibrationJob
```

---

## Level 1 — Semantic facade

### `new Graph(compiledGraph, options?)` → `Graph`

Main entry point. Builds a navigable graph.

```typescript
import { Graph } from '@linklab/core'

const graph = new Graph(compiledGraph, {
  compiled?: CompiledGraph,           // precalculated routes
  dataset?:  Record<string, any[]>,   // JSON data in memory
  provider?: Provider,                // PostgresProvider for real database
})
```

### `graph.domain()` → `DomainProxy`

Returns the transparent semantic proxy (Level 1).

```typescript
const cinema = graph.domain()

const cast   = await cinema.movies(278).people
const films  = await cinema.directors('Nolan').movies
const found  = await cinema.movies({ title: 'Inception' })
```

---

## Level 2 — Pathfinding

### `graph.from(nodeId)` → `PathBuilder`

```typescript
const builder = graph.from('Pigalle').to('Alesia')

builder.paths()                   // all paths — Shortest by default
builder.paths(Strategy.Comfort()) // +8 min per transfer
builder.path()                    // best path only
builder.links                     // subgraph between two nodes
```

### `Strategy`

```typescript
import { Strategy } from '@linklab/core'

Strategy.Shortest()       // minimal raw weight (default)
Strategy.Comfort()        // +8 min per transfer
Strategy.Custom(penalty)  // +penalty per transfer
```

---

## Level 3 — Introspection

```typescript
graph.entities   // GraphNode[]  — all nodes
graph.relations  // GraphEdge[]  — all edges
graph.schema     // Record<string, string>  — node types
graph.weights    // Map<string, number>  — current weights
```

---

## Fastify plugin — REST + HATEOAS

```typescript
import Fastify from 'fastify'
import { linklabPlugin } from '@linklab/core'

const app = Fastify()

await app.register(linklabPlugin, {
  graph:      compiledGraph,
  prefix:     '/api',
  dataLoader: { provider: postgresProvider },
  onEngine:   (engine, req) => {
    engine.hooks.on('access.check', async (ctx) => {
      if (!req.user) return { cancelled: true, reason: 'unauthenticated' }
    })
  }
})

// These routes work automatically — no configuration:
// GET /api/movies
// GET /api/movies/278
// GET /api/movies/278/people
// GET /api/directors/2/movies
```

Response includes `_links` generated from the graph:

```json
{
  "id": 504,
  "name": "Tim Robbins",
  "_links": {
    "self":    { "href": "/api/movies/278/people/504" },
    "up":      { "href": "/api/movies/278" },
    "movies":  { "href": "/api/movies/278/people/504/movies" },
    "credits": { "href": "/api/movies/278/people/504/credits" }
  }
}
```

---

## Low-level API

### `QueryEngine`

```typescript
import { QueryEngine } from '@linklab/core'

const engine = new QueryEngine(compiledGraph)

engine.getRoute(from, to)                        // RouteInfo
engine.generateSQL(options: QueryOptions)         // string — readable SQL
engine.executeInMemory(options, dataset)          // any[] — JSON execution
engine.generateJSONPipeline(options)              // object — debug
```

```typescript
interface QueryOptions {
  from:      string
  to:        string
  filters?:  Record<string, any>   // WHERE conditions
  semantic?: string                // semantic view label — ex: 'actor'
}
```

### `PathFinder`

```typescript
import { PathFinder } from '@linklab/core'

const finder = new PathFinder(graph)

finder.findShortestPath(from, to)           // PathDetails | null
finder.findAllPaths(from, to, maxPaths?)    // Path[]
finder.hasPath(from, to)                    // boolean
finder.getReachableNodes(from, maxDepth?)   // Set<string>
finder.getPathWeight(path)                  // number
finder.getStats()                           // { nodes, edges, avgDegree }
```

### `GraphCompiler`

```typescript
import { GraphCompiler } from '@linklab/core'

const compiler = new GraphCompiler({
  weightThreshold?: number,   // pruning threshold (default: 1000)
  keepFallbacks?:   boolean,  // keep alternative routes
  maxFallbacks?:    number,   // max alternatives per route
})

compiler.compile(graph, metrics): CompiledGraph
```

---

## Core types

```typescript
interface GraphNode {
  id:      string
  type:    string
  label?:  string
  [key: string]: any
}

interface GraphEdge {
  from:     string
  to:       string
  weight:   number
  name?:    string
  via?:     string
  metadata?: Record<string, any>
}

interface CompiledGraph {
  version:     string
  compiledAt:  string
  nodes:       GraphNode[]
  routes:      RouteInfo[]
}

interface RouteInfo {
  from:      string
  to:        string
  semantic?: boolean
  label?:    string
  primary: {
    path:    string[]
    edges:   RouteStep[]
    weight:  number
    joins:   number
  }
  fallbacks: RouteInfo['primary'][]
}

interface Provider {
  query<T>(sql: string, params?: any[]): Promise<T[]>
  close(): Promise<void>
}
```

---

## Recommended imports

```typescript
import {
  Graph,
  Strategy,
  PathFinder,
  QueryEngine,
  GraphCompiler,
  NavigationEngine,
  linklabPlugin,
} from '@linklab/core'

import type {
  GraphNode,
  GraphEdge,
  CompiledGraph,
  RouteInfo,
  QueryOptions,
} from '@linklab/core'
```

---

## Examples

| Example | Source | Demonstrates |
|---------|--------|-------------|
| `dvdrental` | PostgreSQL | FK relations, semantic views, full pipeline |
| `netflix` | JSON | Pivot detection, semantic views (actors/directors/writers) |
| `cinema` | JSON | Minimal graph, REPL starting point |
| `metro` | GTFS open data | Dijkstra, real RATP weights, strategies |
| `musicians` | Manual | Cycles, minHops, via filter |

See the [examples](./src/examples) folder.

---

## Custom formatters

Extend `BaseFormatter` to transform raw navigation results into domain-readable output:

```typescript
import { BaseFormatter } from '@linklab/core'
import type { NavigationPath } from '@linklab/core'

export class MyFormatter extends BaseFormatter {
  format(path: NavigationPath): string {
    return [
      `Path: ${path.nodes.join(' → ')}`,
      `Weight: ${path.totalWeight}`,
    ].join('\n')
  }
}
```

---

## Not an ORM

LinkLab does not map tables to objects. It does not manage migrations. It does not hide your SQL.

It compiles a navigation graph from your existing schema and resolves paths through it. The generated SQL is readable — visible in the REPL and in `QueryEngine.generateSQL()`.

---

- [GitHub](https://github.com/charley-simon/linklab)
- [Report an issue](https://github.com/charley-simon/linklab/issues)

---

## License

MIT — Charley Simon
# @linklab/cli

> Explore, navigate and expose your data — zero application code.

LinkLab compiles a weighted graph from your existing schema and lets you traverse it as a fluent API, an interactive REPL, or a REST + HATEOAS server.

No ORM. No migrations. No hidden SQL.

---

## Installation

```bash
npm install -g @linklab/cli
```

---

## Quick start

### PostgreSQL

```bash
linklab init dvdrental --source postgres://localhost/dvdrental
linklab build dvdrental
linklab repl dvdrental
```

### JSON files

```bash
linklab init netflix
# edit netflix.linklab.ts
linklab build netflix
linklab repl netflix
```

---

## Project configuration

`linklab init <alias>` creates an `{alias}.linklab.ts` file and a `linklab/{alias}/` directory.

**JSON source:**

```typescript
// netflix.linklab.ts
function defineConfig<T>(config: T): T { return config }

export default defineConfig({
  alias: 'netflix',
  source: {
    type: 'json',
    dataDir: './data'
  }
})
```

**PostgreSQL source:**

```typescript
// dvdrental.linklab.ts
function defineConfig<T>(config: T): T { return config }

export default defineConfig({
  alias: 'dvdrental',
  source: {
    type: 'postgres',
    host: 'localhost',
    port: 5432,
    database: 'dvdrental',
    user: 'postgres',
    password: process.env.PGPASSWORD
  },
  output: {
    dir: './linklab/dvdrental'
  }
})
```

`defineConfig()` is a pass-through for IDE autocompletion — no external import required.

**Environment variables** (PostgreSQL):

| Variable | Usage |
|----------|-------|
| `DATABASE_URL` | Full connection string |
| `PGHOST` | Host |
| `PGPORT` | Port |
| `PGDATABASE` | Database name |
| `PGUSER` | User |
| `PGPASSWORD` | Password |

---

## Generated file structure

```
{alias}.linklab.ts                         ← your config (never overwritten)
linklab/{alias}/
  {alias}.json                             ← compiled graph (generated)
  {alias}.reference.gen.json              ← raw graph (generated)
  {alias}.dictionary.gen.json             ← labels + relations (generated)
  {alias}.metrics.gen.json               ← calibrated weights (generated)
  {alias}.override.json                   ← your overrides (never overwritten)
  {alias}.use-cases.json                  ← your use cases (never overwritten)
  {alias}.use-cases.gen.json             ← generated use cases (generated)
  {alias}.test.gen.json                   ← test results (generated)
  .linklab/
    {alias}.schema.gen.json              ← raw schema (generated)
    {alias}.analyzed-schema.gen.json     ← analyzed schema (generated)
```

Files marked **generated** are overwritten on each build. Never edit them.

---

## Commands

### `linklab init <alias>`

Creates `{alias}.linklab.ts` and `linklab/{alias}/` structure.

```bash
linklab init cinema
linklab init dvdrental --source postgres://localhost/dvdrental
linklab init cinema --force    # overwrite if exists
```

---

### `linklab build <alias>`

Runs the full pipeline and compiles the graph.

```bash
linklab build cinema
linklab build dvdrental --dry-run    # simulate without writing
linklab build                        # auto-detect if single *.linklab.ts
```

**Pipeline:**

```
① Extract      ████████████  15 tables                     1229ms
② Analyze      ████████████  1 pivot · 3 warnings             5ms
③ Dictionary   ████████████  36 relations                      3ms
④ Assemble     ████████████  15 nodes · 36 edges               3ms
⑤ Train        ████████████  12 routes trained                 4ms
⑥ Compile      ████████████  210 routes                       36ms

✔  linklab/dvdrental/dvdrental.json  2.0.0 → 2.0.1
   Run "linklab repl dvdrental" to navigate your graph
```

---

### `linklab repl <alias>`

Opens the interactive REPL with tab completion.

```bash
linklab repl cinema
linklab repl dvdrental
```

```
LinkLab REPL  ·  postgres:dvdrental  ·  15 entities

▸ dvdrental.film('Academy Dinosaur').actor
  ↳ film → film_actor → actor
  10 results — 93ms

▸ dvdrental.film('Academy Dinosaur').actor.film
  ↳ film → film_actor → actor → film_actor → film
  244 results — 98ms
```

Tab shows only entities reachable from the current context. The generated SQL is displayed — nothing is hidden.

---

### `linklab server <alias>`

Starts a REST + HATEOAS Level 3 server from the compiled graph.

```bash
linklab server dvdrental
linklab server dvdrental --port 4000
linklab server dvdrental --host 0.0.0.0
linklab server dvdrental --prefix /v1
```

```
LinkLab Server  ·  postgres:dvdrental
210 compiled routes  ·  15 entities
URL  http://localhost:3000/api
```

```bash
curl http://localhost:3000/api/film/1/actor
```

```json
{
  "data": [
    {
      "actor_id": 1,
      "first_name": "Penelope",
      "last_name": "Guiness",
      "_links": {
        "self":  { "href": "/api/film/1/actor/1" },
        "up":    { "href": "/api/film/1" },
        "film":  { "href": "/api/film/1/actor/1/film" }
      }
    }
  ],
  "_trail": "film(1).actor",
  "_meta": { "count": 10, "timing": 80 }
}
```

Links are inferred from the graph — not configured manually.

> `linklab server` is for development and demos. For production, use `linklabPlugin` directly in your own Fastify server. See [@linklab/core](../linklab/README.md).

---

### `linklab generate <alias>`

Generates `{alias}.use-cases.gen.json` from the compiled graph — all physical, semantic and composed routes.

```bash
linklab generate cinema
```

---

### `linklab test <alias>`

Tests every use case against real data.

```bash
linklab test cinema
linklab test cinema --filter physical    # physical routes only
linklab test cinema --fail-fast          # stop on first failure
```

```
Testing 1645 use cases...

✔  OK    :   434  (26%)
○  Empty :  1210  (74%)   ← candidates for removal
✖  Errors:     1   (0%)
```

---

### `linklab train <alias>`

Calibrates weights from test results and recompiles.

```bash
linklab train cinema
```

Routes with no results get a disqualifying weight and are removed from the compiled graph. Routes with results are weighted by usage frequency.

---

### `linklab refresh <alias>`

Macro: `generate` + `test` + `train` + `build` in one command.

```bash
linklab refresh cinema
```

---

### `linklab stress <alias>`

Performance and load testing.

```bash
linklab stress cinema --runs 100
linklab stress cinema --load --concurrent --vu 10
linklab stress cinema --watch
```

---

### `linklab diff <alias>`

Detects schema changes since last build.

```bash
linklab diff cinema
```

---

### `linklab docs <alias>`

Generates Markdown documentation in `linklab/docs/`.

```bash
linklab docs cinema
```

Generates `entities.md`, `routes.md`, `use-cases.md`.

---

### `linklab doctor <alias>`

Diagnoses config, source connection, and generated files.

```bash
linklab doctor dvdrental
```

---

### `linklab status`

Shows status of all projects found in the current directory.

```bash
linklab status
```

---

### `linklab observe <alias>`

Real-time observability — trails, spans, metrics.

```bash
linklab observe cinema
linklab observe cinema --record
linklab observe cinema --replay <id>
linklab observe cinema --duckdb
```

---

## Recommended workflow

```bash
# First setup
linklab init cinema
# edit cinema.linklab.ts
linklab build cinema          # 1644 routes
linklab generate cinema       # 1644 use cases
linklab test cinema           # 434 OK, 1210 empty
linklab train cinema          # 436 calibrated routes

# Daily development
linklab repl cinema           # explore

# After schema or data changes
linklab diff cinema           # check what changed
linklab refresh cinema        # regenerate + test + train + build
```

---

## Not an ORM

LinkLab does not map tables to objects. It does not manage migrations. It does not hide your SQL.

It compiles a navigation graph from your existing schema and resolves paths through it. The generated SQL is readable and visible in the REPL.

---

## Try it on your own data

You don't need to rewrite your project. Point LinkLab at an existing database, explore what it finds, and decide from there.

```bash
linklab init myproject --source postgres://localhost/mydb
linklab build myproject
linklab repl myproject
```

If something doesn't work, open an issue. If you have an idea, same. This is a solo project — human feedback is what's missing most.

---

## License

MIT — Charley Simon
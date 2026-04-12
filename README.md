# LinkLab

> Explore, navigate and expose your data — zero application code.

LinkLab compiles a weighted semantic graph from your existing schema and lets you traverse it as a fluent API, an interactive REPL, or a REST + HATEOAS server.

No ORM. No migrations. No hidden SQL.

```bash
linklab init dvdrental --source postgres://localhost/dvdrental
linklab build dvdrental
linklab repl dvdrental
```

```
▸ dvdrental.film('Academy Dinosaur').actor
  ↳ film → film_actor → actor
  10 results — 93ms

▸ dvdrental.film('Academy Dinosaur').actor.film
  ↳ film → film_actor → actor → film_actor → film
  244 results — 98ms
```

---

## Packages

| Package | Description |
|---------|-------------|
| [`@linklab/core`](./packages/core) | Graph engine, fluent API, Fastify plugin |
| [`@linklab/cli`](./packages/cli) | CLI — build, repl, server, test, train |
| [`@linklab/telemetry`](./packages/telemetry) | Observability pipeline, metrics, calibration |

---

## Examples

| Example | Source | Demonstrates |
|---------|--------|-------------|
| `dvdrental` | PostgreSQL | FK relations, semantic views, full pipeline |
| `netflix` | JSON | Pivot detection, semantic views (actors/directors/writers) |
| `cinema` | JSON | Minimal graph, REPL starting point |

See the [examples](./examples) folder.

---

## Quick install

```bash
npm install -g @linklab/cli
```

Then point it at your own database:

```bash
linklab init myproject --source postgres://localhost/mydb
linklab build myproject
linklab repl myproject
```

You don't need to rewrite your project. Point LinkLab at an existing schema, explore what it finds, and decide from there.

---

## Status

`v0.1` — API is functional and tested. Some edges are still rough.
If something doesn't work, open an issue. If you have an idea, same.

---

- [GitHub](https://github.com/charley-simon/linklab)
- [Report an issue](https://github.com/charley-simon/linklab/issues)
- [npm](#) *(coming soon)* 

---

## License

MIT — Charley Simon
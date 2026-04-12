# @linklab/telemetry

Observability pipeline for LinkLab navigation engine.

Captures execution traces, computes semantic health metrics, and feeds the calibration loop that keeps your graph weights accurate over time.

---

## How it works

Every navigation resolved by the LinkLab engine produces a span. Those spans flow through a lightweight internal pipeline:

```
NavigationEngine
  → SpanBuilder       (builds structured spans)
  → TraceBus          (broadcasts to subscribers)
  → MetricsCalculator (computes Tension, Pressure, Comfort)
  → CalibrationJob    (adjusts graph weights from observed data)
  → DuckDB            (stores trace history for analysis)
```

No external collector required. The pipeline runs in-process and stays out of your way.

---

## Metrics

LinkLab telemetry uses three semantic health metrics rather than raw technical counters.

**Tension** — gap between expected and actual latency

```
Tension = actual_latency / expected_latency
```

Tension > 1 means the system is under strain.

**Pressure** — load on critical resources

```
Pressure = (pending_upgrades + cache_misses) / capacity
```

Pressure approaching 1 signals saturation risk.

**Comfort** — composite health index

```
Comfort = cache_hit_rate × (1 - Tension) × (1 - Pressure)
```

This is the single metric to watch first. One number that tells you how the system breathes.

```
┌─────────────────────────────────────┐
│  LinkLab Health                     │
│                                     │
│  Comfort   ████████░░  78%  ↑       │
│  Tension   ██░░░░░░░░  0.3  ✓       │
│  Pressure  ███░░░░░░░  32%  ✓       │
│                                     │
│  Cache hit     94%                  │
│  Active paths  847                  │
└─────────────────────────────────────┘
```

---

## Why DuckDB, not OpenTelemetry

OpenTelemetry standards are too rigid for the semantic richness of LinkLab traces. A Trail carries contextual meaning — entity, depth, semantic label, resolved path — that doesn't map cleanly onto OTel spans.

DuckDB gives us:
- Native JSON querying for complex trace structures
- Exceptional performance on baseline aggregations
- Portable debugging — download a `.duckdb` file from production and replay it locally

An OTel shim is available if you need to forward traces to an existing collector. But the internal pipeline is the primary path.

---

## Core concepts

**Span** — a single measurable execution unit: route, timestamp, duration, metadata.

**Trace** — a collection of spans representing one complete navigation.

**Baseline** — reference values used to evaluate metrics. Two types: `LatencyBaseline`, `CapacityBaseline`.

**Calibration** — adaptive process that adjusts baselines from observed data. Runs as a background job after each trace batch.

---

## Installation

```bash
npm install @linklab/telemetry
```

Requires `@linklab/core`.

---

## Status

`@linklab/telemetry` is stable for internal use. The DuckDB storage layer and CalibrationJob are production-ready. The real-time dashboard integration is under active development.

---

## More

- [LinkLab core →](../linklab/README.md)
- [CLI →](../linklab-cli/README.md)
- [Article: Semantic navigation in a REST API](https://dev.to) *(coming soon)*
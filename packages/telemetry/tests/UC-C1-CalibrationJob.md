## Domain Concepts

CalibrationJob
LatencyBaselineStore
TraceBus
DuckDBDriver

---

## Related Use Cases

UC-D1 DuckDBDriver  
UC-T5 MetricsCalculator

---

🎯 Objectif
Valider la boucle de feedback : DuckDB → CalibrationJob → LatencyBaselineStore.

CalibrationJob est le mécanisme d'auto-ajustement de LinkLab.
Il lit périodiquement les percentiles réels par route depuis DuckDB
et recalibre la LatencyBaselineStore utilisée par MetricsCalculator
pour calculer Tension. Sans lui, Tension se baserait sur des valeurs
statiques qui dérivent avec le temps.

📥 Entrée
API testée :
job.start() → void (démarre le scheduler)
job.stop() → void (arrête le scheduler)
job.isRunning → boolean
job.runOnce() → Promise<CalibrationResult | null>

Options :
duckdb DuckDBDriver connecté
latency LatencyBaselineStore cible
bus TraceBus (pour émettre calibration:done)
windowMs Fenêtre d'analyse DuckDB (ms)
intervalMs Intervalle entre deux calibrations
initialDelayMs Délai avant la première calibration
minSamples Nb minimum de spans/route pour calibrer

⚙️ Traitement attendu
runOnce() :

1. Appelle duckdb.latencyPercentiles(windowMs)
2. Filtre les routes avec count >= minSamples
3. Si aucune route qualifiée → retourne null
4. Pour chaque route :
   a. Récupère la baseline précédente (latency.get)
   b. Calcule le delta % vs p90 précédent (null si première fois)
   c. Met à jour la baseline (latency.set)
   d. Log si dérive > 20%
5. Émet calibration:done sur le bus
6. Retourne CalibrationResult { timestamp, routeCount, routes[] }

start() :
Planifie runOnce() après initialDelayMs, puis toutes les intervalMs

stop() :
Annule les timers

📤 Sortie
CalibrationResult :
{ timestamp, routeCount, routes: [{ route, p50, p90, p99, count, delta }] }

Null si DuckDB non connecté ou pas assez de données.

calibration:done émis sur le bus avec la baseline agrégée (p90 moyen).

📏 Critères

- runOnce() sans données → null
- runOnce() sous minSamples → null
- runOnce() avec données → CalibrationResult non null
- runOnce() met à jour LatencyBaselineStore
- runOnce() calcule delta vs baseline précédente
- runOnce() émet calibration:done sur le bus
- runOnce() multi-routes → chaque route calibrée indépendamment
- runOnce() sans DuckDB connecté → null
- start() / stop() → isRunning correct
- start() idempotent

Cas de test
[c-1] runOnce() sans données → retourne null → ✓
[c-2] runOnce() sous minSamples → retourne null → ✓
[c-3] runOnce() avec données suffisantes → CalibrationResult → ✓
[c-4] runOnce() injecte dans LatencyBaselineStore → ✓
[c-5] runOnce() calcule delta vs baseline précédente → ✓
[c-6] runOnce() émet calibration:done sur le bus → ✓
[c-7] runOnce() multi-routes — calibre chaque route séparément → ✓
[c-8] runOnce() sans DuckDB connecté → retourne null → ✓
[c-9] start() / stop() → isRunning correct → ✓
[c-10] start() idempotent — double appel sans effet → ✓

Notes

- Tests avec DuckDB ':memory:' — même pattern que UC-D1.
- initialDelayMs et intervalMs réglés à 999_999 en test pour éviter
  tout déclenchement automatique — seul runOnce() est appelé explicitement.
- Le bus émet calibration:done avec une baseline agrégée (p90 moyen
  sur toutes les routes) — les abonnés (CLI Rust, dashboard) reçoivent
  un signal unique par cycle de calibration.
- La dérive > 20% est loggée en console.warn — elle pourrait alimenter
  une alerte dans une version future.

---

## Architecture Context

Ce use case fait partie du pipeline Telemetry :

NavigationEngine
→ SpanBuilder
→ TraceBus
→ MetricsCalculator
→ Calibration

## Dependencies

DuckDBDriver
LatencyBaselineStore
TraceBus
MetricsCalculator

## Produced Events

calibration:done

## Failure Modes

DuckDB non connecté
→ runOnce() retourne null

Baseline absente
→ tension = 1.0

Fenêtre vide
→ métriques neutres

## Observability Impact

CalibrationJob

Impact:
improves latency baseline accuracy
reduces false positive tension alerts

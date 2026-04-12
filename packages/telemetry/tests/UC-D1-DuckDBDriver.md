🎯 Objectif
Valider le driver de persistence analytique DuckDB : écriture,
lecture, requêtes OLAP (percentiles, yoyo, trails instables), rotation.

DuckDBDriver est le cerveau analytique de LinkLab.
Il persiste les spans entre redémarrages (contrairement à GraphDriver in-memory)
et expose des requêtes OLAP que GraphDriver ne peut pas faire :
PERCENTILE_CONT, fenêtres temporelles longues, calibration des poids.

📥 Entrée
API testée :
  driver.connect()                          → Promise<void>
  driver.disconnect()                       → Promise<void>
  driver.isConnected                        → boolean
  driver.write(span)                        → Promise<void>
  driver.readRecent(limit)                  → Promise<Span[]>
  driver.readErrors(limit)                  → Promise<Span[]>
  driver.readByTrail(trail, limit)          → Promise<Span[]>
  driver.aggregate(windowMs)               → Promise<SystemMetrics>
  driver.latencyPercentiles(windowMs)      → Promise<LatencyPercentileRow[]>
  driver.yoyoRateByRoute(windowMs)         → Promise<YoyoRateRow[]>
  driver.unstableTrails(windowMs, minVariants) → Promise<UnstableTrailRow[]>
  driver.rotate()                           → Promise<number>

⚙️ Traitement attendu
connect() :
  Crée l'instance DuckDB (fichier ou :memory:)
  Initialise le schéma (CREATE TABLE IF NOT EXISTS spans)
  Crée les index timestamp / route / trail

write(span) :
  INSERT OR REPLACE via conn.run() avec valeurs interpolées
  Calcule cache_hits / cache_misses / yoyo_events depuis span.cacheEvents[]
  Déclenche maybeRotate() en async (non bloquant)

readRecent / readErrors / readByTrail :
  SELECT * FROM spans avec ORDER BY timestamp DESC LIMIT N
  Reconstitue les Span depuis les lignes (JSON round-trip pour path[] et filters)

aggregate(windowMs) :
  COUNT, SUM, PERCENTILE_CONT sur la fenêtre [now-windowMs, now]
  Calcule Tension / Pression / Confort
  Retourne emptyMetrics si totalSpans = 0

latencyPercentiles(windowMs) :
  GROUP BY from_node || '→' || to_node
  PERCENTILE_CONT p50 / p90 / p99 par route

yoyoRateByRoute(windowMs) :
  SUM(yoyo_events) / COUNT(*) par route

unstableTrails(windowMs, minVariants) :
  COUNT(DISTINCT path) par trail
  HAVING >= minVariants

rotate() :
  Compte les spans, supprime les 10% les plus anciens si maxRows dépassé

📤 Sortie
Span[], SystemMetrics, LatencyPercentileRow[], YoyoRateRow[], UnstableTrailRow[].

📏 Critères
- connect() → isConnected = true
- connect() idempotent — double appel sans crash
- disconnect() → isConnected = false
- write() + readRecent(1) → span retrouvé
- readRecent(2) sur 5 spans → les 2 plus récents (tri DESC)
- readRecent sur base vide → []
- readErrors → uniquement spans avec error
- readErrors sur base sans erreurs → []
- readByTrail → filtre par trail exact
- readByTrail limit respectée
- champs scalaires préservés après write + read
- path[] préservé (JSON round-trip)
- aggregate sur base vide → emptyMetrics (tension=1, confort=0)
- aggregate.totalSpans = nb spans dans la fenêtre
- aggregate.errorRate correct
- aggregate.cacheHitRate correct
- latencyPercentiles → route correcte avec p50/p90/p99
- latencyPercentiles filtre la fenêtre temporelle
- yoyoRateByRoute → taux correct
- unstableTrails → trails avec plusieurs paths distincts remontés
- unstableTrails → trail stable absent du résultat
- rotate supprime les plus anciens quand maxRows dépassé
- rotate retourne 0 si maxRows non atteint
- write sans connect → no-op silencieux
- readRecent sans connect → []

Cas de test
  [db-1]   connect() → isConnected = true                             → ✓
  [db-2]   connect() idempotent — double appel sans crash             → ✓
  [db-3]   disconnect() → isConnected = false                         → ✓
  [db-4]   write + readRecent(1) → span retrouvé                      → ✓
  [db-5]   readRecent(2) sur 5 spans → les 2 plus récents             → ✓
  [db-6]   readRecent sur base vide → []                              → ✓
  [db-7]   readErrors → uniquement spans avec error                   → ✓
  [db-8]   readErrors sur base sans erreurs → []                      → ✓
  [db-9]   readByTrail → filtre par trail exact                       → ✓
  [db-10]  readByTrail limit respectée                                → ✓
  [db-11]  champs scalaires préservés après write+read                → ✓
  [db-12]  path[] préservé (JSON round-trip)                          → ✓
  [db-13]  aggregate sur base vide → emptyMetrics                     → ✓
  [db-14]  aggregate.totalSpans = nb spans dans la fenêtre            → ✓
  [db-15]  aggregate.errorRate correct                                → ✓
  [db-16]  aggregate.cacheHitRate correct                             → ✓
  [db-17]  latencyPercentiles → route movies→people présente          → ✓
  [db-18]  latencyPercentiles filtre la fenêtre temporelle            → ✓
  [db-19]  yoyoRateByRoute → taux correct                             → ✓
  [db-20]  unstableTrails → trails avec plusieurs paths distincts     → ✓
  [db-21]  unstableTrails → trail stable absent du résultat           → ✓
  [db-22]  rotate supprime les plus anciens quand maxRows dépassé     → ✓
  [db-23]  rotate retourne 0 si maxRows non atteint                   → ✓
  [db-24]  write sans connect → no-op silencieux                      → ✓
  [db-25]  readRecent sans connect → []                               → ✓

Notes
- Tests avec dbPath: ':memory:' — base fraîche à chaque beforeEach.
- @duckdb/node-api 1.5.x : conn.run(sql) pour les écritures (interpolation directe),
  conn.runAndReadAll(sql) → DuckDBResultReader pour les lectures.
- INSERT OR REPLACE garantit l'idempotence sur spanId (PRIMARY KEY).
- BOOLEAN stocké comme true/false littéral dans le SQL interpolé.

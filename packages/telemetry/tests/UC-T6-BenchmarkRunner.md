🎯 Objectif
Valider le benchmark de calibration initiale des baselines :
distribution Zipf, calibration de latence, calibration de capacité.

BenchmarkRunner est le pont entre l'observation passive (MetricsCalculator)
et la calibration active (mesures contrôlées). Il doit produire des baselines
fiables et des rapports lisibles, comme UC14 pour les caches.

Pourquoi Zipf ici ?
  Même principe que UC14 : les trails populaires (films blockbusters)
  représentent 80% des accès. Calibrer sur une distribution uniforme
  produirait une baseline irréaliste (trop optimiste pour les trails populaires).

📥 Entrée
API testée :
  runner.calibrateLatency(trails, execute, opts) → BenchmarkLatencyResult
  runner.calibrateCapacity(execute, opts)        → BenchmarkCapacityResult
  zipfPick(items) → distribution 80/20            (fonction interne)

⚙️ Traitement attendu
calibrateLatency :
  1 - Warmup silencieux (10 runs, non comptés)
  2 - iterations runs avec distribution Zipf
  3 - Pour chaque run : appeler execute(trail) → durée en ms
  4 - Appeler latencyStore.record(route, ms)
  5 - Retourner baselines + rapport formaté

Distribution Zipf (vérification statistique) :
  Sur 1000 accès avec 100 trails :
    - top 20 trails (20% du pool) → 70–90% des accès
    - long tail (80 trails) → 10–30% des accès

calibrateCapacity :
  1 - Paliers croissants de concurrence (stepSize par stepSize)
  2 - À chaque palier : mesurer throughput + p90
  3 - Verdict : nominal / dégradé / rupture (latence > 2× p90ref)
  4 - Capacité nominale = 70% du throughput au point de rupture
  5 - Appeler capacityStore.set(baseline)

Rapport latence :
  Tableau avec colonnes Route | p50 ms | p90 ms | p99 ms | Samples
  Ligne de synthèse : Total N runs en X ms

Rapport capacité :
  Tableau avec colonnes Concurrency | RPS | p90 (ms) | Verdict
  Ligne de synthèse : Nominal X rps / Max Y rps

📤 Sortie
BenchmarkLatencyResult :
{
  baselines:  [{ route, p50Ms, p90Ms, p99Ms, sampleCount }],
  totalRuns:  100,
  durationMs: 245,
  report:     "┌─...─┐\n..."
}

BenchmarkCapacityResult :
{
  baseline: { nominalRps, maxRps, breakingPoint, lastUpdated },
  paliers:  [{ concurrency, throughput, p90Ms, verdict }],
  report:   "┌─...─┐\n..."
}

📏 Critères
- Zipf : top 20% = 70–90% des accès sur 1000 tirages
- calibrateLatency avec N trails → N routes dans baselines
- totalRuns = iterations (hors warmup)
- report contient des bordures de table (┌ ou ┐)
- Baselines stockées dans latencyStore après calibration
- calibrateCapacity : palier rupture → verdict "rupture"
- nominalRps = 70% du maxRps mesuré au point de rupture
- Baseline stockée dans capacityStore après calibration
- Tableau vide si trails = [] (pas de crash)

Cas de test
  [bench-1]  Zipf top 20% = 70–90% des accès sur 1000 tirages    → ✓
  [bench-2]  calibrateLatency 2 trails → 2 routes dans baselines  → ✓
  [bench-3]  totalRuns = iterations demandées                     → ✓
  [bench-4]  report contient un tableau formaté                   → ✓
  [bench-5]  baselines dans latencyStore après calibration        → defined
  [bench-6]  calibrateLatency trails vides → 0 baselines, pas de crash → ✓
  [bench-7]  calibrateCapacity → verdict rupture détecté          → ✓
  [bench-8]  nominalRps ≈ 70% du maxRps                           → ✓
  [bench-9]  baseline capacité dans capacityStore après bench     → hasBaseline = true
  [bench-10] rapport capacité contient les colonnes attendues     → ✓

Notes
- Pour les tests de calibrateCapacity, on utilise une fonction execute()
  mockée dont la latence augmente avec la concurrence simulée.
- Les tests de distribution Zipf sont statistiques : on vérifie les tendances
  (70–90%), pas la valeur exacte (aléatoire).
- calibrateLatency est async — on utilise vitest avec await.

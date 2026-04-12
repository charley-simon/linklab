🎯 Objectif
Valider l'intégration de tous les composants dans TelemetryService :
cycle de vie, enrichissement automatique des spans, détection yoyo,
émission périodique des métriques, rapport de session.

TelemetryService est la seule surface publique que Netflix-backend
utilise directement. Tout le reste est orchestré en interne.

📥 Entrée
API testée :
  service = new TelemetryService(opts)
  await service.start()
  await service.stop()
  service.bus.emit('span:end', span)
  service.metrics()            → SystemMetrics
  service.sessionReport()      → string
  service.graph.size           → number
  service.graph.summary()      → SessionSummary

Options :
  windowMs          défaut=60_000
  metricsIntervalMs défaut=5_000  (fake timer)
  maxSpans          défaut=10_000

⚙️ Traitement attendu
Après start() :
  - Les listeners sur span:end et span:error sont actifs
  - L'interval de metrics:update est lancé

Quand span:end est émis :
  1 - Le span est enrichi avec span.metrics (Tension/Pression/Confort)
  2 - Le span est écrit dans graph (GraphDriver)
  3 - Le span est ingéré dans MetricsCalculator (fenêtre glissante)
  4 - Si yoyo détecté → yoyo:detected émis sur le bus

Interval metrics:update :
  Avec fake timers, avancer de metricsIntervalMs → metrics:update émis

Après stop() :
  - Les listeners sont retirés
  - L'interval est arrêté
  - Nouveaux spans émis → ignorés

sessionReport() :
  - Contient un tableau avec Tension, Pression, Confort
  - Contient le nombre total de spans
  - Contient le hit rate cache

📤 Sortie
Aucune sortie disque (DuckDB désactivé par défaut).
Effets : spans enrichis, métriques disponibles, yoyo events émis.

📏 Critères
- start() → listeners actifs
- span:end → span.metrics défini après passage dans le service
- span:end → span dans graph
- span:end avec yoyo → yoyo:detected émis
- span:error → traité comme span:end (enrichissement + stockage)
- Fake timer → metrics:update émis après l'interval
- stop() → span émis après stop ignoré
- sessionReport() → contient les chiffres clés
- metrics() après N spans → totalSpans = N

Cas de test
  [srv-1]  start() → bus a des listeners                          → ✓
  [srv-2]  span:end → span.metrics défini                         → defined
  [srv-3]  span:end → span stocké dans graph                      → graph.size = 1
  [srv-4]  span:end × 3 → metrics().totalSpans = 3                → ✓
  [srv-5]  span avec yoyo → yoyo:detected émis sur le bus        → ✓
  [srv-6]  span:error → traité (graph.size incrémenté)            → ✓
  [srv-7]  fake timer → metrics:update émis après interval        → ✓
  [srv-8]  stop() → span émis après stop pas stocké               → ✓
  [srv-9]  sessionReport() contient "Tension"                     → ✓
  [srv-10] sessionReport() contient le nb de spans                → ✓

Notes
- Les tests utilisent vi.useFakeTimers() pour contrôler l'interval.
- Appeler vi.useRealTimers() dans afterEach pour ne pas polluer les autres tests.
- span.metrics est enrichi en place (mutation de l'objet span) —
  le test doit garder une référence au span pour vérifier l'enrichissement.

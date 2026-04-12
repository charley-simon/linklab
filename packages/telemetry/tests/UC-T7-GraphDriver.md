🎯 Objectif
Valider le driver in-memory de la session courante : écriture,
lecture, requêtes spécialisées, LRU par count, agrégation locale.

GraphDriver est le miroir in-memory de ce que DuckDB persiste.
Il répond aux requêtes live du CLI et du dashboard sans toucher le disque.
Sa capacité est bornée par maxSpans (LRU simplifié — les plus anciens sortent).

📥 Entrée
API testée :
  driver.write(span)                   → Promise<void>
  driver.readRecent(limit)             → Promise<Span[]>
  driver.readErrors(limit)             → Promise<Span[]>
  driver.readByTrail(trail, limit)     → Promise<Span[]>
  driver.aggregate(windowMs)          → Promise<SystemMetrics>
  driver.trails()                      → string[]
  driver.byRoute(from, to, limit)     → Span[]
  driver.latencySamples(route, limit) → number[]
  driver.yoyoSpans(limit)             → Span[]
  driver.summary()                     → SessionSummary
  driver.flush()                       → void
  driver.size                          → number

⚙️ Traitement attendu
write(span) :
  Ajoute le span en queue
  Si size > maxSpans → retire le plus ancien (shift)

readRecent(limit) :
  Retourne les N derniers spans dans l'ordre inverse (plus récent en premier)

readErrors(limit) :
  Retourne les spans avec .error défini, ordre inverse chronologique

readByTrail(trail, limit) :
  Filtre par trail exact, ordre inverse

aggregate(windowMs) :
  Calcule les métriques globales sur les spans dans la fenêtre
  (même logique que MetricsCalculator mais sans baseline)

latencySamples(route, limit) :
  Retourne les totalMs des derniers spans de la route "from→to"

yoyoSpans(limit) :
  Retourne les spans qui ont au moins un cacheEvent avec yoyo=true

summary() :
  { total, errors, yoyos, trails, routes, avgLatencyMs }

📤 Sortie
Spans[], SystemMetrics, SessionSummary.

📏 Critères
- write() + readRecent() → span retrouvé
- readRecent(2) sur 5 spans → les 2 derniers
- readErrors → uniquement les spans en erreur
- readByTrail → uniquement le trail demandé
- LRU : write au-delà de maxSpans → les plus anciens disparaissent
- size = nb spans dans le buffer
- flush() → size = 0
- trails() → liste dédupliquée
- byRoute filtre correctement
- latencySamples → tableau de totalMs
- yoyoSpans → uniquement les spans avec cacheEvent.yoyo=true
- summary.errors = nb spans avec .error
- summary.yoyos = nb spans avec au moins un yoyo
- aggregate windowMs → totalSpans = spans dans la fenêtre

Cas de test
  [gd-1]   write + readRecent(1) → span retrouvé            → ✓
  [gd-2]   readRecent(2) sur 5 spans → les 2 derniers       → ✓
  [gd-3]   readErrors → uniquement spans avec .error        → ✓
  [gd-4]   readByTrail → filtre par trail exact             → ✓
  [gd-5]   LRU : maxSpans=3, écriture de 4 → 1er disparaît  → ✓
  [gd-6]   size correct après write et flush                → ✓
  [gd-7]   flush() → size = 0                               → ✓
  [gd-8]   trails() → liste dédupliquée                     → ✓
  [gd-9]   byRoute filtre from+to                           → ✓
  [gd-10]  latencySamples → tableau totalMs                 → ✓
  [gd-11]  yoyoSpans → uniquement les spans yoyo            → ✓
  [gd-12]  summary.errors = nb erreurs                      → ✓
  [gd-13]  summary.yoyos = nb spans avec yoyo               → ✓
  [gd-14]  summary.avgLatencyMs correct                     → ✓
  [gd-15]  aggregate → totalSpans dans la fenêtre           → ✓

Notes
- aggregate() utilise Date.now() pour le cutoff de la fenêtre.
  Pour tester la fenêtre, on injecte des spans avec des timestamps
  passés (Date.now() - 2 * windowMs) qui doivent être exclus.

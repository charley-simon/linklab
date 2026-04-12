🎯 Objectif
Valider la construction fluente d'un Span — identité, timings par étape,
cache events, finalisation en succès et en erreur.

SpanBuilder est le seul moyen de créer un Span dans le système.
Il garantit que chaque span est complet, cohérent, et auto-suffisant
pour le diagnostic et le rejeu.

📥 Entrée
API testée :
  SpanBuilder.start({ trail, from, to, traceId? }) → SpanBuilder
  builder.withFilters(filters)    → this
  builder.withPath(path)          → this
  builder.stepStart(step)         → this
  builder.stepEnd(step)           → this
  builder.addCacheEvent(event)    → this
  builder.end({ rowCount })       → Span
  builder.endWithError(err, engineState) → Span
  builder.routeKey                → string  ("from→to")

⚙️ Traitement attendu
Identité :
  - Chaque span a un spanId uuid unique
  - traceId partagé si fourni en option, sinon uuid séparé
  - timestamp = Date.now() au moment de .start()

Timings :
  - stepStart/stepEnd autour d'un bloc → StepTiming dans span.timings
  - stepEnd sans stepStart → ignoré silencieusement
  - end() ajoute automatiquement un timing 'Total'
  - totalMs = Date.now() - timestamp (pas la somme des steps)

Cache events :
  - addCacheEvent() accumule dans span.cacheEvents[]
  - L'ordre est préservé

Finalisation :
  - end({ rowCount }) → span sans .error, rowCount correct
  - endWithError(err, state) → span avec .error défini, rowCount = 0
  - .error.type = err.constructor.name
  - .error.engineState = l'état fourni

📤 Sortie
Objet Span complet, prêt pour traceBus.emit('span:end', span).

📏 Critères
- spanId différent sur deux builders distincts
- traceId partagé si fourni
- timings contient le step demandé + 'Total'
- totalMs ≥ durée mesurée
- cacheEvents dans l'ordre d'ajout
- end() → error undefined
- endWithError() → error défini, rowCount = 0
- stepEnd sans stepStart → pas de crash, timing absent
- routeKey = "from→to"

Cas de test
  [sb-1]  spanId unique sur deux builders                → not equal
  [sb-2]  traceId partagé si fourni                      → equal
  [sb-3]  traceId auto si absent                         → defined
  [sb-4]  withFilters                                    → filters dans le span
  [sb-5]  withPath                                       → path dans le span
  [sb-6]  stepStart + stepEnd → timing présent           → step dans timings
  [sb-7]  end() → timing Total ajouté automatiquement    → Total dans timings
  [sb-8]  totalMs ≥ 0                                    → ≥ 0
  [sb-9]  addCacheEvent × 2 → ordre préservé             → [L1, L2]
  [sb-10] end() → error absent                           → undefined
  [sb-11] endWithError() → error.message, error.type     → corrects
  [sb-12] endWithError() → rowCount = 0                  → 0
  [sb-13] endWithError() → engineState transmis          → deepEqual
  [sb-14] stepEnd sans stepStart → silencieux            → pas de crash
  [sb-15] routeKey = "movies→people"                     → correct

Notes
- On ne teste pas les valeurs exactes de durationMs (non déterministe).
  On teste uniquement la présence du timing et que durationMs ≥ 0.
- Le champ dataset est réservé et non testé ici.

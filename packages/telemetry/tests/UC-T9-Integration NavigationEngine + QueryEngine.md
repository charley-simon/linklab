🎯 Objectif
Valider la chaîne complète d'instrumentation :
@linklab/core → TelemetryShim → @linklab/telemetry → traceBus.

Ce UC est le seul test qui traverse les deux packages.
Il vérifie que les spans produits par NavigationEngine et QueryEngine
sont bien reçus sur le traceBus de @linklab/telemetry, avec les
bons champs et les bons step timings.

Il teste aussi le comportement opt-in : sans preloadTelemetry(),
aucun span n'est émis et les moteurs fonctionnent normalement.

Architecture testée :
  NavigationEngine.run()         → shim.startSpan()
    PathFinder.findAllPaths()    → spanBuilder.stepStart/End('PathFinder')
    Resolver.resolve()           → spanBuilder.stepStart/End('Resolver')
    Scheduler.step()             → spanBuilder.stepStart/End('Scheduler')
  QueryEngine.executeInMemory()  → shim.startSpan()
    _executeInMemoryCore()       → spanBuilder.stepStart/End('QueryEngine')

📥 Entrées
Fixtures auto-suffisantes (pas de fichiers JSON externes) :

  GRAPH_MINI — 3 nœuds : movies, credits, people
    Arêtes :
      movies  → credits  (weight 2)
      credits → movies   (weight 2)
      credits → people   (weight 2)
      people  → credits  (weight 2)

  COMPILED_MINI — CompiledGraph avec 1 route :
    movies → people via [movies, credits, people]
    edges : [{ fromCol:'movie_id', toCol:'movie_id' },
             { fromCol:'person_id', toCol:'person_id' }]

  DATASET_MINI — dataset in-memory pour QueryEngine :
    movies  : [{ movie_id:1, title:'Inception' }]
    credits : [{ movie_id:1, person_id:10, role:'director' }]
    people  : [{ person_id:10, name:'Christopher Nolan' }]

⚙️ Traitement attendu
Mode PATHFIND + preload :
  1 - preloadTelemetry() charge @linklab/telemetry
  2 - NavigationEngine.forPathfinding(graph, { from:'movies', to:'people' }).run()
  3 - → span émis sur traceBus('span:end')
  4 - span.from = 'movies', span.to = 'people'
  5 - span.timings contient un step 'PathFinder' avec durationMs ≥ 0
  6 - span.timings contient un step 'Total'
  7 - span.totalMs ≥ 0

Mode NAVIGATE + preload :
  1 - NavigationEngine.forNavigation(graph, { stack:[...] }).run(2)
  2 - → span émis sur traceBus('span:end')
  3 - span.timings contient 'Resolver'

Mode SCHEDULE + preload :
  1 - NavigationEngine.forScheduling(graph, { actions:[...] }).run(1)
  2 - → span émis sur traceBus('span:end')
  3 - span.timings contient 'Scheduler'

QueryEngine + preload :
  1 - engine.executeInMemory({ from:'movies', to:'people', trail:'movies.people' }, DATASET_MINI)
  2 - → span émis sur traceBus('span:end')
  3 - span.timings contient 'QueryEngine'
  4 - span.rowCount = 1 (1 résultat : Nolan)
  5 - span.from = 'movies', span.to = 'people'

Sans preload (opt-in) :
  1 - Réinitialiser le shim (module non chargé)
  2 - NavigationEngine.run() → aucun span émis
  3 - Le moteur retourne quand même ses résultats normalement

Erreur capturée :
  1 - QueryEngine.executeInMemory() avec dataset vide → résultats vides
  2 - NavigationEngine vers route inexistante → résultat FAIL mais pas de throw
  3 - span:error émis si le moteur lève une exception

📤 Sortie
Spans reçus sur traceBus, vérifiés par un listener de test.

📏 Critères
- PATHFIND → span:end avec step 'PathFinder' dans timings
- NAVIGATE → span:end avec step 'Resolver' dans timings
- SCHEDULE → span:end avec step 'Scheduler' dans timings
- QueryEngine → span:end avec step 'QueryEngine', rowCount correct
- shim.active = true après preloadTelemetry()
- Sans preload → 0 spans émis, moteur fonctionne quand même
- span.from / span.to cohérents avec la requête
- span.totalMs ≥ 0
- span.timings contient toujours 'Total'
- rowCount QueryEngine = nb de résultats réels

Cas de test
  [t9-1]  preloadTelemetry() → shim.active = true           → ✓
  [t9-2]  PATHFIND → span:end reçu sur traceBus             → ✓
  [t9-3]  PATHFIND → span.timings contient 'PathFinder'     → ✓
  [t9-4]  PATHFIND → span.from='movies', span.to='people'   → ✓
  [t9-5]  PATHFIND → span.timings contient 'Total'          → ✓
  [t9-6]  NAVIGATE → span:end avec step 'Resolver'          → ✓
  [t9-7]  SCHEDULE → span:end avec step 'Scheduler'         → ✓
  [t9-8]  QueryEngine → span:end, rowCount = 1              → ✓
  [t9-9]  QueryEngine → span.timings contient 'QueryEngine' → ✓
  [t9-10] Sans preload → 0 spans émis                       → ✓
  [t9-11] Sans preload → moteur retourne des résultats      → ✓
  [t9-12] span.totalMs ≥ 0 pour tous les modes             → ✓
  [t9-13] QueryEngine dataset vide → rowCount = 0, pas de throw → ✓

Notes
- preloadTelemetry() est appelé UNE FOIS dans beforeAll (pas beforeEach).
  Le shim est un singleton — recharger entre les tests causerait des
  comportements non déterministes.
- Le test [t9-10] "sans preload" utilise une instance fraîche du shim
  via une factory ou en mockant le module (voir implémentation).
- Les listeners traceBus sont nettoyés dans afterEach pour éviter
  la contamination entre tests (même pattern que UC-T1 et UC-T8).
- Les fixtures GRAPH_MINI et COMPILED_MINI sont déclarées dans le fichier
  de test — pas de dépendance vers les JSON du projet netflix.

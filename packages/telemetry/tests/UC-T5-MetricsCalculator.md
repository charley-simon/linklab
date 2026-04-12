🎯 Objectif
Valider le calcul des métriques sémantiques Tension / Pression / Confort
sur une fenêtre glissante de spans, et le calcul par span individuel.

Les trois composites sont le cœur de @linklab/telemetry.
Ce UC valide leur comportement sous différentes conditions :
fenêtre vide, fenêtre normale, dégradation cache, yoyo, instabilité de path.

Formules de référence :
  Tension  = p90_réel / p90_baseline (par route, moyenne globale)
             > 1 → le système souffre ; clamped [0..5]
  Pression = (cache_misses + yoyo_events) / capacité_nominale_sur_fenêtre
             clamped [0..1]
  Confort  = cache_hit_rate × (1 - tension_norm) × (1 - pression)
             tension_norm = clamp(tension/2, 0, 1)

PathStability = proportion de trails ayant un seul chemin observé

📥 Entrée
API testée :
  new MetricsCalculator({ windowMs, latency, capacity })
  calculator.ingest(span)          → void  (alimentation)
  calculator.compute(windowMs)     → SystemMetrics
  calculator.forSpan(span)         → SpanMetrics
  calculator.windowSize            → number

⚙️ Traitement attendu
compute() sur fenêtre vide :
  → tension=1, pression=0, confort=0, throughput=0

Tension sans baseline :
  → 1.0 (valeur neutre — on ne sait pas si c'est dégradé)

Tension avec baseline et latences nominales :
  → ≈ 1.0 (les spans durent ≈ p90 de la baseline)

Tension avec baseline et latences élevées (2× p90) :
  → ≈ 2.0

Pression avec yoyo events :
  → augmente proportionnellement aux yoyos

Confort avec cache hits élevé et tension nominale :
  → élevé (> 0.7)

Confort avec cache miss total et tension élevée :
  → proche de 0

pathStability :
  → 1.0 si tous les trails empruntent toujours le même chemin
  → < 1.0 si un trail a pris deux chemins différents

forSpan(span) :
  → metrics calculées uniquement sur les cacheEvents du span
  → tension basée sur la baseline de sa route

📤 Sortie
SystemMetrics avec tous les champs renseignés.
SpanMetrics { tension, pression, confort }.

📏 Critères
- Fenêtre vide → defaults sains (tension=1, pression=0, confort=0)
- Tension sans baseline → 1.0
- Tension avec baseline nominale → [0.8..1.2]
- Tension 2× baseline → ≥ 1.8
- Pression augmente avec cache misses
- Pression augmente avec yoyo events
- Confort ∈ [0..1]
- Confort élevé avec bon cache hit rate + tension nominale
- pathStability = 1.0 quand tous les trails sont stables
- pathStability < 1.0 quand un trail a deux chemins
- windowSize = nb de spans dans la fenêtre

Cas de test
  [mc-1]  Fenêtre vide → defaults                         → ✓
  [mc-2]  Tension sans baseline → 1.0                     → ✓
  [mc-3]  Tension nominale avec baseline                   → ≈ 1.0
  [mc-4]  Tension dégradée (latences 2×) → ≥ 1.8          → ✓
  [mc-5]  Pression monte avec cache misses                 → > 0
  [mc-6]  Pression monte avec yoyo events                  → > pression sans yoyo
  [mc-7]  Confort ∈ [0..1]                                 → ✓
  [mc-8]  Confort élevé → > 0.5 avec bon hit rate          → ✓
  [mc-9]  Confort proche de 0 avec miss total + tension ×2 → < 0.2
  [mc-10] pathStability = 1.0 quand stable                 → ✓
  [mc-11] pathStability < 1.0 quand instable               → ✓
  [mc-12] windowSize = nb spans ingérés (dans la fenêtre)  → ✓
  [mc-13] forSpan : tension basée sur la route du span     → ✓
  [mc-14] forSpan : pression = ratio miss/total du span    → ✓
  [mc-15] ingest recalibre automatiquement la baseline     → ✓

Notes
- Les tests de Tension avec baseline nécessitent d'injecter une baseline via
  latency.set() pour contrôler la valeur de référence.
- On utilise des spans synthétiques avec totalMs fixe pour éviter
  la non-déterminisme des mesures de temps.
- windowMs est passé à compute(), pas au constructeur, pour pouvoir
  tester différentes fenêtres dans le même test.

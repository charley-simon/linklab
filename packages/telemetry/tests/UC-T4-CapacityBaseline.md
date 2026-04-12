🎯 Objectif
Valider le stockage de la baseline de capacité et le calcul du ratio
de pression (throughput actuel / capacité nominale).

La baseline de capacité répond à : "à quel throughput le système se dégrade ?"
Sans benchmark explicite, une estimation conservative est fournie à partir
des mesures récentes (fenêtre glissante de 60 échantillons de throughput).

📥 Entrée
API testée :
  store.set(baseline)              → void
  store.get()                      → CapacityBaseline | null
  store.recordThroughput(rps)      → void
  store.nominalRps()               → number
  store.pressureRatio(currentRps)  → number
  store.hasBaseline()              → boolean

⚙️ Traitement attendu
Sans baseline explicite (hasBaseline = false) :
  nominalRps() = moyenne des throughputSamples / 0.80
  Si aucun sample → nominalRps() = 100 (fallback initial)

Avec baseline explicite :
  nominalRps() = baseline.nominalRps

pressureRatio(currentRps) :
  = currentRps / nominalRps()
  < 1 → en dessous de la capacité nominale
  = 1 → à la limite
  > 1 → en surcharge (clamped à [0..1] par MetricsCalculator, pas ici)

recordThroughput :
  Fenêtre glissante de 60 samples
  Au-delà de 60 → les plus anciens sont écartés (shift)

📤 Sortie
CapacityBaseline :
{
  nominalRps:    70,
  maxRps:        100,
  breakingPoint: 250,
  lastUpdated:   1709123456789
}

📏 Critères
- hasBaseline() = false avant set()
- set() → hasBaseline() = true
- get() avant set() → null
- nominalRps() sans baseline et sans samples → 100
- nominalRps() sans baseline, avec samples → estimation
- nominalRps() avec baseline → baseline.nominalRps
- pressureRatio(0) → 0
- pressureRatio(nominalRps) → ≈ 1.0
- pressureRatio(2× nominalRps) → ≈ 2.0
- Fenêtre 60 samples — le 61e pousse le 1er dehors

Cas de test
  [cap-1]  hasBaseline() avant set() → false               → ✓
  [cap-2]  set() → hasBaseline() = true                    → ✓
  [cap-3]  get() avant set() → null                        → ✓
  [cap-4]  nominalRps() sans rien → 100                    → ✓
  [cap-5]  nominalRps() avec baseline → baseline.nominalRps → ✓
  [cap-6]  pressureRatio(0) → 0                            → ✓
  [cap-7]  pressureRatio(nominalRps) → ≈ 1.0               → ✓
  [cap-8]  pressureRatio(2× nominalRps) → ≈ 2.0            → ✓
  [cap-9]  Fenêtre glissante : 61e sample écrase le 1er    → ✓
  [cap-10] nominalRps() sans baseline, avec samples → avg / 0.80 → ✓

Notes
- pressureRatio n'est pas clampé à [0..1] dans ce store —
  c'est MetricsCalculator qui applique le clamp pour Pression.
  Ici on teste la valeur brute.

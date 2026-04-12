🎯 Objectif
Valider le stockage et le calcul des baselines de latence par route.

La baseline est la valeur de référence pour calculer Tension.
Elle doit refléter les conditions réelles de production, pas les pics.
La fenêtre glissante garantit une recalibration automatique sans intervention.

Principe de calcul :
  - Les N dernières mesures de latence par route sont conservées
  - Quand on a ≥ 10 mesures → on (re)calcule p50 / p90 / p99
  - p90 est la valeur de référence pour Tension
  - Si on a < 10 mesures → pas de baseline (undefined)
  - La fenêtre est glissante : au-delà de windowSize, les plus anciennes
    sont écartées au profit des nouvelles

📥 Entrée
API testée :
  store.record(route, latencyMs)   → void
  store.get(route)                 → LatencyBaseline | undefined
  store.p90(route)                 → number | undefined
  store.set(baseline)              → void  (injection manuelle)
  store.all()                      → LatencyBaseline[]
  store.size                       → number

Options de construction :
  windowSize   défaut=100   nombre de mesures conservées par route

⚙️ Traitement attendu
record() :
  1 - Ajouter la mesure au buffer de la route
  2 - Si buffer > windowSize → retirer les plus anciennes (shift)
  3 - Si buffer.length ≥ 10 → recalcul des percentiles

Calcul percentiles :
  Trier les mesures, prendre l'indice ceil(p × n) - 1
  p50 = médiane, p90 = 90e percentile, p99 = 99e percentile

Fenêtre glissante :
  windowSize = 5, on enregistre 10 mesures [1,2,3,4,5,6,7,8,9,10]
  → seules les 5 dernières [6,7,8,9,10] sont conservées
  → p50 doit refléter les mesures récentes, pas les anciennes

📤 Sortie
LatencyBaseline :
{
  route:       "movies→people",
  p50Ms:       45,
  p90Ms:       90,
  p99Ms:       120,
  sampleCount: 100,
  lastUpdated: 1709123456789
}

📏 Critères
- < 10 mesures → get() retourne undefined
- ≥ 10 mesures → get() retourne la baseline
- p90 croissant avec les mesures
- p50 ≤ p90 ≤ p99 (ordre des percentiles)
- Fenêtre glissante : les vieilles mesures sont évictées
- set() manuel écrase la baseline
- all() retourne toutes les baselines connues
- size = nombre de routes distinctes

Cas de test
  [lat-1]  < 10 mesures → undefined                          → ✓
  [lat-2]  exactement 10 mesures → baseline calculée         → defined
  [lat-3]  p50 ≤ p90 ≤ p99                                   → ordre correct
  [lat-4]  Fenêtre glissante : vieilles mesures évictées     → p50 reflète le récent
  [lat-5]  Route inconnue → p90() = undefined                → ✓
  [lat-6]  set() manuel → get() retourne la baseline injectée → ✓
  [lat-7]  all() → retourne toutes les baselines             → length correct
  [lat-8]  size = nombre de routes distinctes                → ✓
  [lat-9]  Deux routes indépendantes                         → pas d'interférence
  [lat-10] sampleCount = nb de mesures dans la fenêtre       → ✓

Notes
- Les valeurs exactes de percentiles varient selon le jeu de données.
  On teste les propriétés ordinales (p50 ≤ p90 ≤ p99), pas les valeurs exactes.
- lastUpdated est testé uniquement par "est un timestamp récent"
  (> Date.now() - 1000), pas la valeur exacte.

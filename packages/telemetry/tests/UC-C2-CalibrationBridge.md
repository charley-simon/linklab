🎯 Objectif
Valider bridge-utils.ts (computeNewWeight) et le wiring onCalibrated
qui simule l'intégration telemetry ↔ @linklab/core.

Deux groupes de tests sans dépendance sur @linklab/core :
  A) bridge-utils — computeNewWeight() : logique pure, calcul des poids
  B) onCalibrated wiring : simulation du bridge via CalibrationJob

📥 Entrée
API testée :
  computeNewWeight(p90, currentWeight, opts) → number

  opts :
    strategy?     'direct' | 'normalized' | 'smoothed'  (défaut: 'smoothed')
    minWeight?    number   (défaut: 0.5)
    maxWeight?    number   (défaut: 1000)
    smoothFactor? number   (défaut: 0.3)

  job.onCalibrated = async (result: CalibrationResult) => { ... }

⚙️ Traitement attendu
computeNewWeight() :
  direct     → raw = p90
  normalized → raw = p90 / 100
  smoothed   → raw = (1 - α) × currentWeight + α × p90
  retourne   clamp(raw, minWeight, maxWeight)

wiring onCalibrated :
  Le callback reçoit le CalibrationResult de runOnce()
  Simule le bridge : met à jour les edges correspondants
  Déclenche un mock de recompilation si des edges ont été mis à jour

📤 Sortie
number — nouveau poids clamped.
Mutation des edges du Graph (via callback).

📏 Critères computeNewWeight
- direct → p90 brut
- normalized → p90 / 100
- smoothed → lissage exponentiel avec smoothFactor
- smoothed défaut (α=0.3) : w = 0.7×old + 0.3×p90
- clamping minWeight
- clamping maxWeight
- p90=0 → clampé à minWeight
- smoothFactor=0 → weight inchangé (tout le poids sur l'ancien)
- smoothFactor=1 → weight = p90 brut (tout le poids sur le nouveau)

📏 Critères wiring
- onCalibrated reçoit le résultat et met à jour les edges
- hot reload déclenché après mise à jour
- route sans edge correspondant → pas de reload
- smoothed sur deux cycles → convergence progressive

Cas de test
  [c-13a]  direct → weight = p90 brut                                → ✓
  [c-13b]  normalized → weight = p90 / 100                           → ✓
  [c-13c]  smoothed → lissage exponentiel                            → ✓
  [c-13d]  smoothed défaut — facteur 0.3                             → ✓
  [c-13e]  clamping minWeight                                        → ✓
  [c-13f]  clamping maxWeight                                        → ✓
  [c-13g]  p90 = 0 → clampé à minWeight                             → ✓
  [c-13h]  smoothFactor = 0 → weight inchangé                        → ✓
  [c-13i]  smoothFactor = 1 → weight = p90 brut                     → ✓
  [c-14a]  onCalibrated reçoit le résultat et met à jour les edges   → ✓
  [c-14b]  hot reload déclenché après mise à jour des edges          → ✓
  [c-14c]  route sans edge correspondant → pas de reload             → ✓
  [c-14d]  smoothed sur deux cycles → convergence progressive        → ✓

Notes
- computeNewWeight() est dans src/calibration/bridge-utils.ts,
  exporté depuis @linklab/telemetry/index.ts.
- telemetry-graph-bridge.ts (netflix-backend) importe computeNewWeight
  et @linklab/core — c'est le seul fichier qui couple les deux packages.
- Les tests UC-C2 ne testent jamais le bridge complet (pas de @linklab/core
  en dépendance de @linklab/telemetry). Les tests c-14 simulent le wiring
  avec des objets littéraux et des vi.fn() comme mocks de compiler/reload.
- La convergence en deux cycles (c-14d) valide que le lissage exponentiel
  fonctionne correctement sur plusieurs passes de calibration successives.

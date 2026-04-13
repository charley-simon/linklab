/**
 * bridge-utils.ts — Utilitaires de conversion p90 → weight
 *
 * Extrait de telemetry-graph-bridge.ts pour être testable indépendamment
 * de @linklab/core.
 *
 * À placer dans : src/calibration/bridge-utils.ts
 */
/**
 * Calcule le nouveau poids d'un edge à partir du p90 réel.
 * Applique ensuite le clamping [minWeight, maxWeight].
 */
export function computeNewWeight(p90, currentWeight, opts = {}) {
    const { strategy = 'smoothed', minWeight = 0.5, maxWeight = 1000, smoothFactor = 0.3, } = opts;
    let raw;
    switch (strategy) {
        case 'direct':
            raw = p90;
            break;
        case 'normalized':
            raw = p90 / 100;
            break;
        case 'smoothed':
            raw = (1 - smoothFactor) * currentWeight + smoothFactor * p90;
            break;
    }
    return Math.min(maxWeight, Math.max(minWeight, raw));
}
//# sourceMappingURL=bridge-utils.js.map
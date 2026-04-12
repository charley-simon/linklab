/**
 * bridge-utils.ts — Utilitaires de conversion p90 → weight
 *
 * Extrait de telemetry-graph-bridge.ts pour être testable indépendamment
 * de @linklab/core.
 *
 * À placer dans : src/calibration/bridge-utils.ts
 */
/**
 * Stratégie de conversion p90 → weight.
 *
 * 'direct'     : weight = p90 ms bruts (cohérent avec GraphTrainer)
 * 'normalized' : weight = p90 / 100   (100ms = poids 1.0)
 * 'smoothed'   : weight = (1-α) × old + α × p90  (lissage exponentiel)
 */
export type WeightStrategy = 'direct' | 'normalized' | 'smoothed';
export interface WeightUpdateOptions {
    strategy?: WeightStrategy;
    minWeight?: number;
    maxWeight?: number;
    smoothFactor?: number;
}
/**
 * Calcule le nouveau poids d'un edge à partir du p90 réel.
 * Applique ensuite le clamping [minWeight, maxWeight].
 */
export declare function computeNewWeight(p90: number, currentWeight: number, opts?: WeightUpdateOptions): number;
//# sourceMappingURL=bridge-utils.d.ts.map
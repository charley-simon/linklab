/**
 * CapacityBaseline.ts — Baseline de capacité du système
 *
 * Stocke le throughput nominal (rps) mesuré par BenchmarkRunner.
 * Utilisé par MetricsCalculator pour calculer Pression.
 *
 * Principe (calqué sur UC14 / benchmark yoyo) :
 *   - Envoyer des requêtes parallèles croissantes
 *   - Mesurer la latence à chaque palier
 *   - Point de rupture = premier palier où latence > 2× p90 baseline
 *   - Capacité nominale = 70% du throughput au point de rupture
 *     (marge de sécurité — même ratio que evictToRatio dans les caches)
 */
// ── CapacityBaselineStore ─────────────────────────────────────────────────────
export class CapacityBaselineStore {
    baseline = null;
    /** Fenêtre glissante des mesures de throughput (rps observés) */
    throughputSamples = [];
    windowSize = 60; // 60 secondes de mesures
    // ── Écriture ─────────────────────────────────────────────────────────────
    /** Résultat d'un benchmark de capacité */
    set(baseline) {
        this.baseline = baseline;
    }
    /**
     * Enregistre le throughput observé sur la dernière seconde.
     * Appelé par MetricsCalculator à chaque fenêtre glissante.
     */
    recordThroughput(rps) {
        this.throughputSamples.push(rps);
        if (this.throughputSamples.length > this.windowSize) {
            this.throughputSamples.shift();
        }
    }
    // ── Lecture ───────────────────────────────────────────────────────────────
    get() {
        return this.baseline;
    }
    /**
     * Throughput nominal courant.
     * Si baseline connue → valeur calibrée.
     * Sinon → moyenne des mesures récentes × 1.3 (estimation conservative).
     */
    nominalRps() {
        if (this.baseline)
            return this.baseline.nominalRps;
        if (this.throughputSamples.length === 0)
            return 100; // fallback initial
        const avg = this.throughputSamples.reduce((a, b) => a + b, 0)
            / this.throughputSamples.length;
        // Estimation : on suppose qu'on tourne à ~80% de la capacité nominale
        return avg / 0.80;
    }
    /**
     * Pression de capacité — ratio throughput_actuel / capacité_nominale.
     * ]0..1] nominal, > 1 saturé.
     */
    pressureRatio(currentRps) {
        const cap = this.nominalRps();
        if (cap === 0)
            return 0;
        return currentRps / cap;
    }
    hasBaseline() {
        return this.baseline !== null;
    }
}
//# sourceMappingURL=CapacityBaseline.js.map
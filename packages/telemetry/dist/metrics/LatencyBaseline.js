/**
 * LatencyBaseline.ts — Baseline de latence par route
 *
 * Stocke les percentiles (p50/p90/p99) par route "from→to".
 * Utilisé par MetricsCalculator pour calculer Tension.
 *
 * Mise à jour par CalibrationJob sur fenêtre glissante des
 * 100 dernières exécutions réelles de chaque route.
 * Même logique que la calibration des poids de graphe.
 */
// ── LatencyBaselineStore ──────────────────────────────────────────────────────
export class LatencyBaselineStore {
    /** baseline par route — clé = "from→to" */
    baselines = new Map();
    /** historique brut des latences par route (fenêtre glissante) */
    samples = new Map();
    windowSize;
    constructor(opts = {}) {
        // 100 derniers échantillons par route — même fenêtre que les poids de graphe
        this.windowSize = opts.windowSize ?? 100;
    }
    // ── Enregistrement ────────────────────────────────────────────────────────
    /** Ajoute une mesure de latence pour une route donnée */
    record(route, latencyMs) {
        if (!this.samples.has(route)) {
            this.samples.set(route, []);
        }
        const buf = this.samples.get(route);
        buf.push(latencyMs);
        // Fenêtre glissante — on garde les N derniers
        if (buf.length > this.windowSize) {
            buf.splice(0, buf.length - this.windowSize);
        }
        // Recalculer la baseline si on a assez d'échantillons
        if (buf.length >= 10) {
            this.recalculate(route, buf);
        }
    }
    // ── Lecture ───────────────────────────────────────────────────────────────
    get(route) {
        return this.baselines.get(route);
    }
    /** p90 pour une route — valeur de référence pour Tension */
    p90(route) {
        return this.baselines.get(route)?.p90Ms;
    }
    /** Toutes les baselines connues */
    all() {
        return [...this.baselines.values()];
    }
    /** Nombre de routes connues */
    get size() { return this.baselines.size; }
    // ── Calibration manuelle ─────────────────────────────────────────────────
    /**
     * Injecte une baseline pré-calculée (issue de BenchmarkRunner).
     * Écrase la baseline existante.
     */
    set(baseline) {
        this.baselines.set(baseline.route, baseline);
    }
    // ── Calcul des percentiles ────────────────────────────────────────────────
    recalculate(route, samples) {
        const sorted = [...samples].sort((a, b) => a - b);
        const n = sorted.length;
        this.baselines.set(route, {
            route,
            p50Ms: percentile(sorted, 0.50),
            p90Ms: percentile(sorted, 0.90),
            p99Ms: percentile(sorted, 0.99),
            sampleCount: n,
            lastUpdated: Date.now(),
        });
    }
}
// ── Utilitaire ────────────────────────────────────────────────────────────────
function percentile(sorted, p) {
    if (sorted.length === 0)
        return 0;
    const idx = Math.min(Math.ceil(p * sorted.length) - 1, sorted.length - 1);
    return sorted[idx];
}
//# sourceMappingURL=LatencyBaseline.js.map
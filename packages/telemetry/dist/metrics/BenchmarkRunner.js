/**
 * BenchmarkRunner.ts — Calibration initiale des baselines
 *
 * Transposition directe de UC14 au contexte des trails LinkLab.
 *
 * Deux benchmarks :
 *
 *   calibrateLatency(trails, execute)
 *     → Exécute chaque trail N fois
 *     → Calcule p50/p90/p99 par route "from→to"
 *     → Alimente LatencyBaselineStore
 *
 *   calibrateCapacity(execute, opts)
 *     → Envoie des vagues de requêtes parallèles croissantes
 *     → Mesure le throughput et la latence à chaque palier
 *     → Identifie le point de rupture (latence > 2× p90 baseline)
 *     → Capacité nominale = 70% du throughput au point de rupture
 *     → Alimente CapacityBaselineStore
 *
 * Distribution Zipf (UC14) :
 *   80% des accès sur les 20% de trails les plus populaires.
 *   Utilisée pour la calibration de latence afin que la baseline
 *   reflète les conditions réelles de production.
 */
// ── BenchmarkRunner ───────────────────────────────────────────────────────────
export class BenchmarkRunner {
    latencyStore;
    capacityStore;
    constructor(latencyStore, capacityStore) {
        this.latencyStore = latencyStore;
        this.capacityStore = capacityStore;
    }
    // ── Calibration de latence ────────────────────────────────────────────────
    /**
     * Exécute chaque trail N fois (distribution Zipf) et calibre les baselines.
     *
     * @param trails   - descripteurs des trails à tester
     * @param execute  - fonction d'exécution d'un trail → durée en ms
     * @param opts     - iterations (défaut: 100), warmup (défaut: 10)
     */
    async calibrateLatency(trails, execute, opts = {}) {
        const iterations = opts.iterations ?? 100;
        const warmup = opts.warmup ?? 10;
        const startedAt = Date.now();
        if (trails.length === 0) {
            return { baselines: [], totalRuns: 0, durationMs: 0, report: 'Aucun trail à calibrer.' };
        }
        // Warmup — pas comptabilisé
        for (let i = 0; i < warmup; i++) {
            const trail = zipfPick(trails);
            await execute(trail).catch(() => { });
        }
        // Distribution Zipf sur les iterations
        let totalRuns = 0;
        for (let i = 0; i < iterations; i++) {
            const trail = zipfPick(trails);
            try {
                const ms = await execute(trail);
                this.latencyStore.record(`${trail.from}→${trail.to}`, ms);
                totalRuns++;
            }
            catch {
                // On ignore les erreurs de calibration
            }
        }
        const baselines = this.latencyStore.all();
        const durationMs = Date.now() - startedAt;
        return {
            baselines,
            totalRuns,
            durationMs,
            report: formatLatencyReport(baselines, totalRuns, durationMs),
        };
    }
    // ── Calibration de capacité ───────────────────────────────────────────────
    /**
     * Benchmark de saturation progressif.
     * Concurrency croissante jusqu'au point de rupture.
     *
     * @param execute     - fonction d'exécution → durée en ms
     * @param opts.p90ref - latence p90 de référence (issue de calibrateLatency)
     */
    async calibrateCapacity(execute, opts) {
        const maxConcurrency = opts.maxConcurrency ?? 50;
        const stepSize = opts.stepSize ?? 5;
        const durationPerStep = opts.durationPerStep ?? 2_000;
        const breakThreshold = opts.p90ref * 2; // rupture si latence > 2× p90
        const paliers = [];
        let breakingRps = 0;
        let breakingMs = 0;
        for (let concurrency = stepSize; concurrency <= maxConcurrency; concurrency += stepSize) {
            const palier = await this.measurePalier(execute, concurrency, durationPerStep);
            const verdict = palier.p90Ms > breakThreshold ? 'rupture'
                : palier.p90Ms > opts.p90ref ? 'dégradé'
                    : 'nominal';
            paliers.push({ ...palier, verdict });
            if (verdict === 'rupture') {
                breakingRps = palier.throughput;
                breakingMs = palier.p90Ms;
                break;
            }
            // Dernier palier non-rupture → on le prend comme max
            breakingRps = palier.throughput;
            breakingMs = palier.p90Ms;
        }
        const nominalRps = breakingRps * 0.70; // 70% du max — même ratio qu'evictToRatio
        const baseline = {
            nominalRps,
            maxRps: breakingRps,
            breakingPoint: breakingMs,
            lastUpdated: Date.now(),
        };
        this.capacityStore.set(baseline);
        return {
            baseline,
            paliers,
            report: formatCapacityReport(baseline, paliers),
        };
    }
    // ── Mesure d'un palier de concurrence ─────────────────────────────────────
    async measurePalier(execute, concurrency, durationMs) {
        const latencies = [];
        const deadline = Date.now() + durationMs;
        // Lancer des vagues de `concurrency` requêtes jusqu'à la deadline
        while (Date.now() < deadline) {
            const batch = Array.from({ length: concurrency }, () => execute().then(ms => { latencies.push(ms); }).catch(() => { latencies.push(durationMs); }));
            await Promise.all(batch);
        }
        const actualDuration = durationMs / 1_000;
        const throughput = latencies.length / actualDuration;
        const sorted = [...latencies].sort((a, b) => a - b);
        const p90Ms = sorted[Math.min(Math.ceil(0.90 * sorted.length) - 1, sorted.length - 1)] ?? 0;
        return { concurrency, throughput, p90Ms };
    }
}
// ── Distribution Zipf (UC14) ──────────────────────────────────────────────────
/**
 * Sélectionne un trail selon la distribution Zipf 80/20.
 * 80% de chance de tomber dans les 20% premiers (les plus populaires).
 */
function zipfPick(items) {
    if (items.length === 0)
        throw new Error('zipfPick: tableau vide');
    const top20Boundary = Math.max(1, Math.floor(items.length * 0.20));
    // Zipf simple : 80% → top 20%, 20% → long tail
    const idx = Math.random() < 0.80
        ? Math.floor(Math.random() * top20Boundary)
        : top20Boundary + Math.floor(Math.random() * (items.length - top20Boundary));
    return items[Math.min(idx, items.length - 1)];
}
// ── Formatage console (UC14-style) ────────────────────────────────────────────
function formatLatencyReport(baselines, totalRuns, durationMs) {
    const lines = [
        '┌─────────────────────────────┬──────────┬──────────┬──────────┬─────────┐',
        '│ Route                       │   p50 ms │   p90 ms │   p99 ms │ Samples │',
        '├─────────────────────────────┼──────────┼──────────┼──────────┼─────────┤',
    ];
    for (const b of baselines) {
        const route = b.route.padEnd(27).slice(0, 27);
        lines.push(`│ ${route} │ ${String(b.p50Ms).padStart(8)} │ ${String(b.p90Ms).padStart(8)} │ ${String(b.p99Ms).padStart(8)} │ ${String(b.sampleCount).padStart(7)} │`);
    }
    lines.push('└─────────────────────────────┴──────────┴──────────┴──────────┴─────────┘');
    lines.push(`Total : ${totalRuns} runs en ${durationMs} ms`);
    return lines.join('\n');
}
function formatCapacityReport(baseline, paliers) {
    const lines = [
        '┌─────────────┬───────────┬──────────┬───────────────┐',
        '│ Concurrency │ RPS       │ p90 (ms) │ Verdict       │',
        '├─────────────┼───────────┼──────────┼───────────────┤',
    ];
    for (const p of paliers) {
        const conc = String(p.concurrency).padStart(11);
        const rps = p.throughput.toFixed(1).padStart(9);
        const p90 = String(Math.round(p.p90Ms)).padStart(8);
        const verdict = p.verdict.padEnd(13).slice(0, 13);
        lines.push(`│ ${conc} │ ${rps} │ ${p90} │ ${verdict} │`);
    }
    lines.push('└─────────────┴───────────┴──────────┴───────────────┘');
    lines.push(`Nominal : ${baseline.nominalRps.toFixed(1)} rps   Max : ${baseline.maxRps.toFixed(1)} rps   Breaking point : ${Math.round(baseline.breakingPoint)} ms`);
    return lines.join('\n');
}
//# sourceMappingURL=BenchmarkRunner.js.map
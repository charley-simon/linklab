/**
 * TelemetryShim.ts — Pont opt-in entre @linklab/core et @linklab/telemetry
 *
 * @linklab/core ne dépend PAS de @linklab/telemetry.
 *
 * Deux modes d'activation :
 *
 * 1. INJECTION (recommandé, toujours fiable) :
 *    L'appelant qui connaît les deux packages injecte les modules directement.
 *    Utilisé dans les tests (@linklab/telemetry) et en production (Netflix-backend).
 *
 *      import { injectTelemetry } from '@linklab/core'
 *      import { SpanBuilder, traceBus } from '@linklab/telemetry'
 *      injectTelemetry({ SpanBuilder, traceBus })
 *
 * 2. PRELOAD (production uniquement) :
 *    Import dynamique — fonctionne si @linklab/telemetry est installé ET
 *    accessible depuis le même module resolver que @linklab/core.
 *    Ne pas utiliser dans les tests (résolution cross-package impossible sous Vitest).
 *
 *      import { preloadTelemetry } from '@linklab/core'
 *      await preloadTelemetry()
 *
 * Sans activation → toutes les opérations sont des no-ops silencieux.
 */
// ── Registre interne ──────────────────────────────────────────────────────────
let _module = null;
let _attempted = false;
// ── API d'injection ───────────────────────────────────────────────────────────
/**
 * Injecte les composants de @linklab/telemetry dans le shim.
 * Méthode universelle — fonctionne dans tous les contextes (tests, prod).
 * Prend effet immédiatement et de manière synchrone.
 */
export function injectTelemetry(module) {
    _module = module;
    _attempted = true; // bloquer tout preloadTelemetry() ultérieur
}
/**
 * Réinitialise le shim — utile pour les tests d'isolation.
 */
export function resetTelemetry() {
    _module = null;
    _attempted = false;
}
/**
 * Précharge le module telemetry via import dynamique.
 * Uniquement pour la production (Netflix-backend) où les deux packages
 * partagent le même module resolver Node.js.
 * Ne pas utiliser dans les tests — préférer injectTelemetry().
 */
export async function preloadTelemetry() {
    if (_attempted)
        return;
    _attempted = true;
    try {
        const specifier = '@linklab/telemetry';
        const mod = await new Function('s', 'return import(s)')(specifier);
        _module = mod;
    }
    catch {
        _module = null;
    }
}
// ── API du shim ───────────────────────────────────────────────────────────────
export const shim = {
    startSpan(opts) {
        if (!_module)
            return null;
        try {
            const builder = _module.SpanBuilder.start({
                trail: opts.trail,
                from: opts.from,
                to: opts.to,
                traceId: opts.traceId
            });
            if (opts.path)
                builder.withPath?.(opts.path);
            if (opts.filters)
                builder.withFilters?.(opts.filters);
            return builder;
        }
        catch {
            return null;
        }
    },
    emitEnd(span) {
        if (!_module)
            return;
        try {
            _module.traceBus.emit('span:end', span);
        }
        catch { }
    },
    emitError(span) {
        if (!_module)
            return;
        try {
            _module.traceBus.emit('span:error', span);
        }
        catch { }
    },
    get active() {
        return _module !== null;
    }
};
//# sourceMappingURL=TelemetryShim.js.map
/**
 * EventBus — Bus générique pour hooks, events et errors
 *
 * Trois bus distincts, trois contrats clairs :
 *
 *   HookBus    — awaitable, peut modifier/annuler le flux
 *   EventBus   — fire-and-forget, observationnel, ne bloque pas
 *   ErrorBus   — synchrone, jamais silencieux
 *
 * Usage :
 *   const bus = new EventBus<MyEvents>()
 *   bus.on('traversal.complete', handler)
 *   bus.emit('traversal.complete', data)
 *   bus.off('traversal.complete', handler)
 */
// ── EventBus — fire-and-forget ────────────────────────────────
export class EventBus {
    handlers = new Map();
    on(event, handler) {
        if (!this.handlers.has(event)) {
            this.handlers.set(event, new Set());
        }
        this.handlers.get(event).add(handler);
        // Retourne une fonction de désinscription
        return () => this.off(event, handler);
    }
    off(event, handler) {
        this.handlers.get(event)?.delete(handler);
    }
    emit(event, data) {
        const handlers = this.handlers.get(event);
        if (!handlers?.size)
            return;
        // Fire-and-forget — les erreurs dans les handlers ne propagent pas
        for (const handler of handlers) {
            try {
                handler(data);
            }
            catch (err) {
                console.error(`[EventBus] Handler error on "${event}":`, err);
            }
        }
    }
    clear(event) {
        if (event) {
            this.handlers.delete(event);
        }
        else {
            this.handlers.clear();
        }
    }
    listenerCount(event) {
        return this.handlers.get(event)?.size ?? 0;
    }
}
export class HookBus {
    handlers = new Map();
    on(hook, handler) {
        if (!this.handlers.has(hook)) {
            this.handlers.set(hook, []);
        }
        this.handlers.get(hook).push(handler);
        return () => this.off(hook, handler);
    }
    off(hook, handler) {
        const list = this.handlers.get(hook);
        if (!list)
            return;
        const idx = list.indexOf(handler);
        if (idx !== -1)
            list.splice(idx, 1);
    }
    /**
     * Appelle les handlers en séquence.
     * Chaque handler peut retourner une valeur modifiée — elle est passée au suivant.
     * Si un handler retourne { cancelled: true }, la chaîne s'arrête.
     */
    async call(hook, data) {
        const handlers = this.handlers.get(hook);
        if (!handlers?.length)
            return { value: data };
        let current = data;
        for (const handler of handlers) {
            const result = await handler(current);
            // Si le handler retourne un objet avec cancelled, on stoppe
            if (result && typeof result === 'object' && 'cancelled' in result && result.cancelled) {
                return { value: current, cancelled: true, reason: result.reason };
            }
            // Si le handler retourne une valeur, elle remplace le contexte courant
            if (result !== undefined && result !== null) {
                current = result;
            }
        }
        return { value: current };
    }
    listenerCount(hook) {
        return this.handlers.get(hook)?.length ?? 0;
    }
}
// ── ErrorBus — synchrone, jamais silencieux ──────────────────
export class ErrorBus {
    handlers = new Map();
    fallback;
    /**
     * Handler de fallback si aucun handler n'est enregistré pour cette erreur.
     * Par défaut : console.error.
     */
    setFallback(fn) {
        this.fallback = fn;
    }
    on(event, handler) {
        if (!this.handlers.has(event)) {
            this.handlers.set(event, new Set());
        }
        this.handlers.get(event).add(handler);
        return () => this.off(event, handler);
    }
    off(event, handler) {
        this.handlers.get(event)?.delete(handler);
    }
    emit(event, data) {
        const handlers = this.handlers.get(event);
        if (!handlers?.size) {
            // Jamais silencieux — fallback ou console.error
            if (this.fallback) {
                this.fallback(event, data);
            }
            else {
                console.error(`[LinkLab Error] ${event}:`, data);
            }
            return;
        }
        for (const handler of handlers) {
            try {
                handler(data);
            }
            catch (err) {
                // Les erreurs dans les error handlers ne doivent jamais être avalées
                console.error(`[ErrorBus] Handler threw on "${event}":`, err);
            }
        }
    }
    listenerCount(event) {
        return this.handlers.get(event)?.size ?? 0;
    }
}
//# sourceMappingURL=EventBus.js.map
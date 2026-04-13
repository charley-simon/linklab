/**
 * Scheduler - Exécution d'actions par priorité (mode SCHEDULE)
 *
 * À chaque step :
 *   1. Filtre les actions disponibles (condition when + cooldown + terminal)
 *   2. Sélectionne la plus prioritaire (weight le plus élevé)
 *   3. L'exécute et met à jour l'état interne
 *
 * C'est le cœur du moteur d'agent : une boucle de décision
 * déterministe basée sur les poids et l'état de la stack.
 */
export class Scheduler {
    actions;
    graph;
    actionStates;
    constructor(actions, graph) {
        this.actions = actions;
        this.graph = graph;
        // Initialise l'état de chaque action
        this.actionStates = new Map(actions.map(a => [
            a.name,
            { cooldownUntil: 0, executionCount: 0, executed: false }
        ]));
    }
    /**
     * Exécute un step du scheduler.
     * Retourne null si aucune action n'est disponible (terminaison naturelle).
     */
    async step(time, stack) {
        const available = this.getAvailableActions(time, stack);
        if (available.length === 0)
            return null;
        // Sélection déterministe : weight le plus élevé
        const selected = available.reduce((best, action) => action.weight > best.weight ? action : best);
        console.log(`  ⚙️  [Scheduler t=${time}] → ${selected.name} (weight: ${selected.weight})`);
        let result;
        let updatedStack = stack;
        try {
            updatedStack = await selected.execute(stack, this.graph);
            result = { type: 'SUCCESS', data: updatedStack };
        }
        catch (err) {
            result = {
                type: 'FAIL',
                reason: err instanceof Error ? err.message : String(err)
            };
            console.error(`  ❌ [Scheduler] Action échouée: ${selected.name}`, err);
        }
        // Callback optionnel (analytics, logging externe...)
        if (selected.onUse) {
            try {
                selected.onUse(stack, result);
            }
            catch {
                // Silencieux — le callback ne doit pas planter le scheduler
            }
        }
        // Mise à jour de l'état de l'action
        this.updateState(selected, result, time);
        return {
            selectedAction: selected.name,
            result,
            updatedStack: result.type === 'SUCCESS' ? updatedStack : stack
        };
    }
    /**
     * Retourne les actions disponibles à un instant t pour une stack donnée.
     * Filtre : terminal déjà exécuté, cooldown, maxExecutions, condition when().
     */
    getAvailableActions(time, stack) {
        return this.actions.filter(action => {
            const state = this.actionStates.get(action.name);
            // Action terminale déjà exécutée
            if (action.terminal && state.executed)
                return false;
            // En cooldown
            if (state.cooldownUntil > time)
                return false;
            // Limite d'exécutions atteinte
            if (action.maxExecutions !== undefined && state.executionCount >= action.maxExecutions) {
                return false;
            }
            // Condition métier
            if (!action.when)
                return true;
            try {
                return action.when(stack);
            }
            catch {
                return false;
            }
        });
    }
    updateState(action, result, time) {
        const current = this.actionStates.get(action.name);
        this.actionStates.set(action.name, {
            cooldownUntil: result.type === 'DEFER' ? time + (action.cooldown ?? 0) : 0,
            executionCount: current.executionCount + 1,
            executed: action.terminal ? true : current.executed,
            lastResult: result
        });
    }
    getActionState(name) {
        return this.actionStates.get(name);
    }
}
//# sourceMappingURL=Scheduler.js.map
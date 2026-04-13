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
import type { ScheduleAction, ActionState, Frame, Graph, NavigationResult } from '../types/index.js';
export interface SchedulerStepResult {
    selectedAction: string;
    result: NavigationResult;
    updatedStack: Frame[];
}
export declare class Scheduler {
    private actions;
    private graph;
    private actionStates;
    constructor(actions: ScheduleAction[], graph: Graph);
    /**
     * Exécute un step du scheduler.
     * Retourne null si aucune action n'est disponible (terminaison naturelle).
     */
    step(time: number, stack: Frame[]): Promise<SchedulerStepResult | null>;
    /**
     * Retourne les actions disponibles à un instant t pour une stack donnée.
     * Filtre : terminal déjà exécuté, cooldown, maxExecutions, condition when().
     */
    getAvailableActions(time: number, stack: Frame[]): ScheduleAction[];
    private updateState;
    getActionState(name: string): ActionState | undefined;
}
//# sourceMappingURL=Scheduler.d.ts.map
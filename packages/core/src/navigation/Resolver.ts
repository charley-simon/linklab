/**
 * Resolver - Résolution sémantique de frames (mode NAVIGATE)
 *
 * Parcourt la stack, trouve la première frame UNRESOLVED,
 * identifie la meilleure arête dans le graphe V3 (nodes/edges)
 * et résout la frame avec les filtres appropriés.
 */

import type { Frame, Graph, GraphEdge, FrameFilter } from '../types/index.js'

export class Resolver {
  constructor(private graph: Graph) {}

  /**
   * Résout la prochaine frame UNRESOLVED dans la stack.
   * Retourne une nouvelle stack avec la frame résolue (ou DEFERRED si impossible).
   */
  async resolve(stack: Frame[]): Promise<Frame[]> {
    const unresolved = stack.filter(f => f.state === 'UNRESOLVED')

    if (unresolved.length === 0) return stack

    const frame = unresolved[0]

    // Frame racine (en position 0, aucune frame résolue avant elle) :
    // c'est une collection ou un point d'entrée — pas besoin d'arête entrante.
    const frameIndex = stack.indexOf(frame)
    const hasPriorResolved = stack
      .slice(0, frameIndex)
      .some(f => f.state === 'RESOLVED' && f.id !== undefined && f.id !== null)

    if (!hasPriorResolved) {
      return stack.map(f => (f === frame ? { ...f, state: 'RESOLVED' as const } : f))
    }

    const candidate = this.selectBestEdge(frame, stack)

    if (!candidate) {
      console.warn(`[Resolver] Aucune arête trouvée pour "${frame.entity}"`)
      return stack.map(f => (f === frame ? { ...f, state: 'DEFERRED' as const } : f))
    }

    const { edge, sourceFrame } = candidate

    const resolved: Frame = {
      ...frame,
      state: 'RESOLVED',
      resolvedBy: {
        relation: edge.name ?? `${edge.from}→${edge.to}`,
        via: edge.via ?? edge.from,
        filters: [
          {
            field: `${sourceFrame.entity.toLowerCase()}Id`,
            operator: 'equals',
            value: sourceFrame.id!
          },
          // Filtres portés par l'arête elle-même (ex: condition sémantique)
          ...this.extractEdgeFilters(edge)
        ]
      }
    }

    return stack.map(f => (f === frame ? resolved : f))
  }

  /**
   * Trouve l'arête la plus pertinente pour résoudre une frame.
   *
   * Logique : on cherche parmi les frames RESOLVED (en remontant la stack),
   * une arête qui va de cette entité source vers l'entité cible.
   */
  private selectBestEdge(
    frame: Frame,
    stack: Frame[]
  ): { edge: GraphEdge; sourceFrame: Frame } | null {
    // Frames résolues, les plus récentes en premier (dernier contexte connu)
    const resolvedFrames = [...stack]
      .reverse()
      .filter(f => f.state === 'RESOLVED' && f.id !== undefined && f.id !== null)

    for (const source of resolvedFrames) {
      const candidates = this.graph.edges.filter(edge => {
        // L'arête doit partir de l'entité source et arriver à l'entité cible
        const matchesDirection = edge.from === source.entity && edge.to === frame.entity

        // Si la frame a une intention, on vérifie la compatibilité sémantique
        if (matchesDirection && frame.intent && edge.metadata?.condition) {
          return this.intentMatchesCondition(frame.intent, edge.metadata.condition)
        }

        return matchesDirection
      })

      // On prend la candidate avec le poids le plus faible (chemin le plus direct)
      if (candidates.length > 0) {
        const best = candidates.sort((a, b) => a.weight - b.weight)[0]
        return { edge: best, sourceFrame: source }
      }
    }

    return null
  }

  /**
   * Vérifie si l'intention de la frame est compatible avec
   * les conditions sémantiques portées par l'arête.
   */
  private intentMatchesCondition(
    intent: Record<string, any>,
    condition: string | Record<string, any>
  ): boolean {
    if (typeof condition === 'string') return true // Pas de condition structurée

    return Object.entries(condition).every(([key, value]) => {
      if (intent[key] === undefined) return true // On ne filtre pas ce qu'on ne connaît pas
      return intent[key] === value
    })
  }

  /**
   * Extrait les filtres implicites portés par les métadonnées d'une arête.
   * Ex: une arête sémantique { condition: { jobId: 2 } } devient un filtre.
   */
  private extractEdgeFilters(edge: GraphEdge): FrameFilter[] {
    const condition = edge.metadata?.condition
    if (!condition || typeof condition === 'string') return []

    return Object.entries(condition).map(([field, value]) => ({
      field,
      operator: 'equals' as const,
      value
    }))
  }
}

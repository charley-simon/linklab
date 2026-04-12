/**
 * GraphOptimizer — Analyse et rapport sur la qualité du graphe
 *
 * PRINCIPE : signaler, jamais détruire silencieusement.
 *
 * Chaque étape produit un rapport (warnings, suggestions).
 * Le dev décide ensuite de ce qu'il fait.
 *
 * Seules deux opérations sont automatiques et non destructives :
 *   - Suppression des nœuds orphelins (aucune arête — objectivement inutiles)
 *   - Suppression des nœuds dead-end stricts (aucune arête entrante ET sortante)
 *
 * Les cycles sont DÉTECTÉS et CLASSIFIÉS, jamais supprimés :
 *   - SELF_LOOP         : arête A → A (ex: Station-chatelet → Station-chatelet TRANSFER)
 *   - BIDIRECTIONAL     : A → B et B → A (ex: CREATED + CREDITED — intentionnel)
 *   - STRUCTURAL_CYCLE  : A → B → C → A (même type de relation — potentiellement problématique)
 */

import type { Graph, GraphEdge, GraphNode } from '../types/index.js'
import { PathFinder } from '../core/PathFinder.js'

// ==================== TYPES ====================

export type CycleType = 'SELF_LOOP' | 'BIDIRECTIONAL' | 'STRUCTURAL_CYCLE'
export type WarningSeverity = 'INFO' | 'WARNING'

export interface CycleWarning {
  type: CycleType
  severity: WarningSeverity
  edges: string[]           // noms des arêtes impliquées
  nodes: string[]           // nœuds impliqués
  note: string
}

export interface DuplicatePathWarning {
  from: string
  to: string
  paths: string[][]         // tous les chemins entre ces deux nœuds
  note: string
}

export interface GraphOptimizationReport {
  graph: Graph              // graphe inchangé (ou avec suppressions safe uniquement)
  summary: {
    nodes: { before: number; after: number; removed: number }
    edges: { before: number; after: number; removed: number }
  }
  cycles: CycleWarning[]
  duplicatePaths: DuplicatePathWarning[]
  removedOrphans: string[]
  removedDeadEnds: string[]
  isClean: boolean          // true si aucun warning
}

// ==================== OPTIMIZER ====================

export interface GraphOptimizerConfig {
  /**
   * Types de relations bidirectionnelles considérés comme intentionnels (INFO, pas WARNING).
   * Ex: ['DIRECT', 'TRANSFER', 'physical_reverse', 'INFLUENCE']
   * Par défaut : ['physical_reverse'] — les inverses FK sont toujours intentionnels.
   */
  intentionalBidirectional?: string[]

  /**
   * Types de self-loops considérés comme intentionnels (INFO, pas WARNING).
   * Ex: ['TRANSFER'] — les correspondances métro sont des self-loops normaux.
   * Par défaut : [] — tout self-loop est signalé.
   */
  intentionalSelfLoops?: string[]
}

const DEFAULT_CONFIG: Required<GraphOptimizerConfig> = {
  intentionalBidirectional: ['physical_reverse'],
  intentionalSelfLoops: []
}

export class GraphOptimizer {

  private config: Required<GraphOptimizerConfig>

  constructor(private graph: Graph, config: GraphOptimizerConfig = {}) {
    this.config = {
      intentionalBidirectional: config.intentionalBidirectional ?? DEFAULT_CONFIG.intentionalBidirectional,
      intentionalSelfLoops:     config.intentionalSelfLoops     ?? DEFAULT_CONFIG.intentionalSelfLoops
    }
  }

  /**
   * Pipeline complet — retourne un rapport, ne modifie pas le graphe original.
   * Seuls orphelins et dead-ends stricts sont supprimés (safe).
   */
  optimize(): GraphOptimizationReport {
    console.log('🔧 GraphOptimizer — analyse du graphe...')

    const before = {
      nodes: this.graph.nodes.length,
      edges: this.graph.edges.length
    }

    // Travailler sur une copie
    const working: Graph = {
      nodes: [...this.graph.nodes],
      edges: [...this.graph.edges]
    }

    // Opérations safe (non destructives sémantiquement)
    const removedOrphans   = this.removeOrphans(working)
    const removedDeadEnds  = this.removeStrictDeadEnds(working)

    // Analyse — rapport uniquement, pas de suppression
    const cycles           = this.detectCycles(working)
    const duplicatePaths   = this.detectDuplicatePaths(working)

    const after = {
      nodes: working.nodes.length,
      edges: working.edges.length
    }

    // Résumé console
    console.log(`   Nœuds   : ${before.nodes} → ${after.nodes} (-${before.nodes - after.nodes})`)
    console.log(`   Arêtes  : ${before.edges} → ${after.edges} (-${before.edges - after.edges})`)
    console.log(`   Cycles  : ${cycles.length} détecté(s)`)
    console.log(`   Chemins dupliqués : ${duplicatePaths.length} paire(s)`)

    const isClean = cycles.filter(c => c.severity === 'WARNING').length === 0

    if (isClean) {
      console.log('   ✅ Graphe propre')
    } else {
      console.log(`   ⚠️  ${cycles.filter(c => c.severity === 'WARNING').length} warning(s) à examiner`)
    }

    const report: GraphOptimizationReport = {
      graph: working,
      summary: {
        nodes: { before: before.nodes, after: after.nodes, removed: before.nodes - after.nodes },
        edges: { before: before.edges, after: after.edges, removed: before.edges - after.edges }
      },
      cycles,
      duplicatePaths,
      removedOrphans,
      removedDeadEnds,
      isClean
    }

    this.printReport(report)
    return report
  }

  // ==================== CYCLES ====================

  /**
   * Détecte et classifie les cycles — ne supprime rien.
   */
  private detectCycles(graph: Graph): CycleWarning[] {
    const warnings: CycleWarning[] = []
    const seen = new Set<string>()

    for (const edge of graph.edges) {

      // 1. SELF_LOOP : A → A
      if (edge.from === edge.to) {
        const key = `SELF:${edge.name}`
        if (!seen.has(key)) {
          seen.add(key)
          const edgeType = edge.metadata?.type ?? edge.via ?? ''
          const isIntentional = this.config.intentionalSelfLoops.includes(edgeType)
          warnings.push({
            type: 'SELF_LOOP',
            severity: 'INFO',
            edges: [edge.name ?? `${edge.from}→${edge.to}`],
            nodes: [edge.from],
            note: isIntentional
              ? `Self-loop intentionnel (${edgeType}) sur ${edge.from}. Géré par Dijkstra.`
              : `Boucle sur ${edge.from}. Géré par Dijkstra (visited), inoffensif.`
          })
        }
        continue
      }

      // 2. BIDIRECTIONAL : A → B et B → A
      const reverse = graph.edges.find(e => e.from === edge.to && e.to === edge.from)
      if (reverse) {
        const key = [edge.from, edge.to].sort().join('↔')
        if (!seen.has(key)) {
          seen.add(key)
          const typeA = edge.metadata?.type ?? ''
          const typeB = reverse.metadata?.type ?? ''
          const sameType = typeA === typeB
          const isIntentional =
            !sameType ||
            this.config.intentionalBidirectional.includes(typeA) ||
            this.config.intentionalBidirectional.includes(typeB)
          warnings.push({
            type: 'BIDIRECTIONAL',
            severity: isIntentional ? 'INFO' : 'WARNING',
            edges: [
              edge.name    ?? `${edge.from}→${edge.to}`,
              reverse.name ?? `${reverse.from}→${reverse.to}`
            ],
            nodes: [edge.from, edge.to],
            note: isIntentional
              ? `Bidirectionnel intentionnel (${typeA} ↔ ${typeB}) — normal.`
              : `Bidirectionnel de même type "${typeA}" non déclaré intentionnel — vérifier.`
          })
        }
      }
    }

    // 3. STRUCTURAL_CYCLE : A → B → C → A (même type de relation)
    const structuralCycles = this.detectStructuralCycles(graph)
    warnings.push(...structuralCycles)

    return warnings
  }

  /**
   * Détecte les cycles structurels A → B → ... → A
   * en ne suivant que les arêtes du même type.
   */
  private detectStructuralCycles(graph: Graph): CycleWarning[] {
    const warnings: CycleWarning[] = []
    const reportedCycles = new Set<string>()

    // Grouper les arêtes par type
    const byType = new Map<string, GraphEdge[]>()
    for (const edge of graph.edges) {
      const type = edge.metadata?.type ?? edge.via ?? 'unknown'
      if (!byType.has(type)) byType.set(type, [])
      byType.get(type)!.push(edge)
    }

    for (const [type, edges] of byType) {
      // DFS sur les arêtes de ce type uniquement
      const visited = new Set<string>()
      const inPath  = new Set<string>()
      const pathStack: string[] = []

      const dfs = (node: string): string[] | null => {
        if (inPath.has(node)) {
          // Cycle trouvé — extraire le cycle
          const cycleStart = pathStack.indexOf(node)
          return pathStack.slice(cycleStart)
        }
        if (visited.has(node)) return null

        visited.add(node)
        inPath.add(node)
        pathStack.push(node)

        const neighbors = edges.filter(e => e.from === node).map(e => e.to)
        for (const neighbor of neighbors) {
          const cycle = dfs(neighbor)
          if (cycle) return cycle
        }

        pathStack.pop()
        inPath.delete(node)
        return null
      }

      for (const edge of edges) {
        const cycle = dfs(edge.from)
        if (cycle) {
          const key = [...cycle].sort().join(',')
          if (!reportedCycles.has(key)) {
            reportedCycles.add(key)
            warnings.push({
              type: 'STRUCTURAL_CYCLE',
              severity: 'WARNING',
              edges: [],
              nodes: cycle,
              note: `Cycle structurel sur le type "${type}" : ${cycle.join(' → ')} → ${cycle[0]}`
            })
          }
        }
        visited.clear()
        inPath.clear()
        pathStack.length = 0
      }
    }

    return warnings
  }

  // ==================== SUPPRESSIONS SAFE ====================

  /**
   * Supprime les nœuds sans aucune arête (entrante ou sortante).
   * Inoffensif — un nœud isolé ne contribue à aucune traversée.
   */
  private removeOrphans(graph: Graph): string[] {
    const connected = new Set<string>()
    for (const edge of graph.edges) {
      connected.add(edge.from)
      connected.add(edge.to)
    }

    const orphans = graph.nodes
      .filter(n => !connected.has(n.id))
      .map(n => n.id)

    graph.nodes = graph.nodes.filter(n => connected.has(n.id))

    if (orphans.length > 0) {
      console.log(`   🗑️  Orphelins supprimés : ${orphans.join(', ')}`)
    }

    return orphans
  }

  /**
   * Supprime les nœuds sans arête entrante ET sans arête sortante
   * après suppression des orphelins.
   * Différent de removeOrphans — cible les nœuds stricts.
   */
  private removeStrictDeadEnds(graph: Graph): string[] {
    const hasIncoming = new Set<string>()
    const hasOutgoing = new Set<string>()

    for (const edge of graph.edges) {
      hasOutgoing.add(edge.from)
      hasIncoming.add(edge.to)
    }

    const deadEnds = graph.nodes
      .filter(n => !hasIncoming.has(n.id) && !hasOutgoing.has(n.id))
      .map(n => n.id)

    // Déjà couverts par removeOrphans — cette passe est redondante
    // mais explicite pour la lisibilité
    graph.nodes = graph.nodes.filter(n => !deadEnds.includes(n.id))

    return deadEnds
  }

  // ==================== DUPLICATES ====================

  /**
   * Détecte les paires de nœuds avec plusieurs chemins possibles.
   * Informatif — les chemins multiples sont souvent intentionnels (fallbacks).
   */
  private detectDuplicatePaths(graph: Graph): DuplicatePathWarning[] {
    const warnings: DuplicatePathWarning[] = []
    const finder = new PathFinder(graph)

    for (const from of graph.nodes) {
      for (const to of graph.nodes) {
        if (from.id === to.id) continue

        try {
          const paths = finder.findAllPaths(from.id, to.id, 5)
          if (paths.length > 1) {
            warnings.push({
              from: from.id,
              to: to.id,
              paths: paths.map(p => p),
              note: `${paths.length} chemins entre ${from.id} et ${to.id} — le plus court sera utilisé par défaut.`
            })
          }
        } catch {
          // Ignorer les erreurs de traversée
        }
      }
    }

    return warnings
  }

  // ==================== RAPPORT ====================

  private printReport(report: GraphOptimizationReport): void {
    if (report.cycles.length === 0 && report.duplicatePaths.length === 0) return

    console.log('\n📋 RAPPORT GraphOptimizer\n')

    if (report.removedOrphans.length > 0) {
      console.log(`🗑️  Orphelins supprimés (${report.removedOrphans.length}) :`)
      report.removedOrphans.forEach(n => console.log(`   - ${n}`))
    }

    // Cycles WARNING uniquement (les INFO sont attendus)
    const cycleWarnings = report.cycles.filter(c => c.severity === 'WARNING')
    if (cycleWarnings.length > 0) {
      console.log(`\n⚠️  Cycles à examiner (${cycleWarnings.length}) :`)
      cycleWarnings.forEach(c => {
        console.log(`   [${c.type}] ${c.note}`)
      })
    }

    const cycleInfos = report.cycles.filter(c => c.severity === 'INFO')
    if (cycleInfos.length > 0) {
      console.log(`\nℹ️  Cycles intentionnels (${cycleInfos.length}) :`)
      cycleInfos.forEach(c => {
        console.log(`   [${c.type}] ${c.note}`)
      })
    }

    if (report.duplicatePaths.length > 0) {
      console.log(`\nℹ️  Chemins multiples (${report.duplicatePaths.length} paires) — fallbacks disponibles`)
    }
  }
}

/**
 * CompiledGraphEngine - Production engine using precompiled graph
 *
 * - O(1) route lookup
 * - Automatic fallback
 * - Live metrics
 * - Hot reload support
 */

import type { CompiledGraph, RouteInfo, PathMetrics, Provider } from '../types/index.js'

interface LiveMetrics {
  path: string[]
  executions: number
  successes: number
  failures: number
  totalTime: number
  avgTime: number
}

export class CompiledGraphEngine {
  private compiled: CompiledGraph
  private provider: Provider
  private liveMetrics: Map<string, LiveMetrics>
  private routeCache: Map<string, RouteInfo>

  constructor(compiled: CompiledGraph, provider: Provider) {
    this.compiled = compiled
    this.provider = provider
    this.liveMetrics = new Map()
    this.routeCache = this.buildRouteCache(compiled)

    console.log('🚀 Compiled Graph Engine initialized')
    console.log(`   Routes loaded: ${compiled.routes.length}`)
    console.log(`   Nodes: ${compiled.nodes.length}`)
  }

  /**
   * Build fast lookup cache
   */
  private buildRouteCache(compiled: CompiledGraph): Map<string, RouteInfo> {
    const cache = new Map<string, RouteInfo>()

    for (const route of compiled.routes) {
      const key = `${route.from}→${route.to}`
      cache.set(key, route)
    }

    return cache
  }

  /**
   * Execute query from -> to
   */
  async query(from: string, to: string, data: Record<string, any> = {}): Promise<any[]> {
    const key = `${from}→${to}`

    // O(1) lookup!
    const route = this.routeCache.get(key)

    if (!route) {
      throw new Error(`No compiled route from ${from} to ${to}`)
    }

    // Try primary path
    try {
      const start = performance.now()
      const result = await this.executePath(route.primary.path, data)
      const duration = performance.now() - start

      // Update metrics
      this.updateMetrics(route.primary.path, duration, true)

      return result
    } catch (err) {
      console.warn(`⚠️  Primary path failed: ${(err as Error).message}`)

      // Try fallbacks
      return await this.fallback(route, data)
    }
  }

  /**
   * Execute path with JOINs
   */
  private async executePath(path: string[], data: Record<string, any>): Promise<any[]> {
    // Build SQL with JOINs
    let sql = `SELECT * FROM ${path[0]}`
    const params: any[] = []

    // Add JOINs
    for (let i = 1; i < path.length; i++) {
      const from = path[i - 1]
      const to = path[i]

      // Find edge in compiled graph
      const edge = this.findEdge(from, to)

      if (edge) {
        sql += ` JOIN ${to} ON ${from}.${edge.via} = ${to}.id`
      }
    }

    // Add WHERE if ID provided
    if (data.id) {
      sql += ` WHERE ${path[0]}.id = $${params.length + 1}`
      params.push(data.id)
    }

    // Execute
    return await this.provider.query(sql, params)
  }

  /**
   * Find edge between nodes
   */
  private findEdge(from: string, to: string): { via: string } | null {
    // Simplified - would look in compiled graph edges
    return { via: 'id' }
  }

  /**
   * Fallback to alternative paths
   */
  private async fallback(route: RouteInfo, data: Record<string, any>): Promise<any[]> {
    for (const [index, fallback] of route.fallbacks.entries()) {
      try {
        console.log(`   Trying fallback ${index + 1}/${route.fallbacks.length}...`)

        const start = performance.now()
        const result = await this.executePath(fallback.path, data)
        const duration = performance.now() - start

        // Success!
        console.log(`   ✅ Fallback worked: ${fallback.path.join('→')}`)

        this.updateMetrics(fallback.path, duration, true)

        // Maybe promote this fallback?
        this.considerPromotion(route, index)

        return result
      } catch (err) {
        console.warn(`   ✗ Fallback ${index + 1} failed: ${(err as Error).message}`)
        this.updateMetrics(fallback.path, 0, false)
        continue
      }
    }

    throw new Error('All paths failed')
  }

  /**
   * Update live metrics
   */
  private updateMetrics(path: string[], duration: number, success: boolean): void {
    const key = path.join('→')

    if (!this.liveMetrics.has(key)) {
      this.liveMetrics.set(key, {
        path,
        executions: 0,
        successes: 0,
        failures: 0,
        totalTime: 0,
        avgTime: 0
      })
    }

    const metric = this.liveMetrics.get(key)!
    metric.executions++

    if (success) {
      metric.successes++
      metric.totalTime += duration
      metric.avgTime = metric.totalTime / metric.successes
    } else {
      metric.failures++
    }
  }

  /**
   * Consider promoting a fallback to primary
   */
  private considerPromotion(route: RouteInfo, fallbackIndex: number): void {
    const fallback = route.fallbacks[fallbackIndex]
    const fallbackKey = fallback.path.join('→')
    const primaryKey = route.primary.path.join('→')

    const fallbackMetric = this.liveMetrics.get(fallbackKey)
    const primaryMetric = this.liveMetrics.get(primaryKey)

    if (!fallbackMetric || !primaryMetric) return

    // Promote if fallback is faster AND more reliable
    const fallbackBetter =
      fallbackMetric.avgTime < primaryMetric.avgTime && fallbackMetric.successes > 5 // Min sample size

    if (fallbackBetter) {
      console.log(`🔄 Promoting fallback to primary: ${fallbackKey}`)

      // Swap
      const temp = route.primary
      route.primary = fallback
      route.fallbacks[fallbackIndex] = temp

      // Update cache
      const key = `${route.from}→${route.to}`
      this.routeCache.set(key, route)
    }
  }

  /**
   * Get live statistics
   */
  getStats(): {
    totalExecutions: number
    totalSuccesses: number
    successRate: string
    avgTime: string
    uniquePaths: number
    fastest?: LiveMetrics
    slowest?: LiveMetrics
  } {
    const metrics = Array.from(this.liveMetrics.values())

    if (metrics.length === 0) {
      return {
        totalExecutions: 0,
        totalSuccesses: 0,
        successRate: '0%',
        avgTime: '0ms',
        uniquePaths: 0
      }
    }

    const totalExecutions = metrics.reduce((sum, m) => sum + m.executions, 0)
    const totalSuccesses = metrics.reduce((sum, m) => sum + m.successes, 0)
    const avgTime = metrics.reduce((sum, m) => sum + m.avgTime * m.successes, 0) / totalSuccesses

    const fastest = metrics.reduce((min, m) => (m.avgTime < min.avgTime ? m : min))

    const slowest = metrics.reduce((max, m) => (m.avgTime > max.avgTime ? m : max))

    return {
      totalExecutions,
      totalSuccesses,
      successRate: ((totalSuccesses / totalExecutions) * 100).toFixed(1) + '%',
      avgTime: avgTime.toFixed(2) + 'ms',
      uniquePaths: metrics.length,
      fastest,
      slowest
    }
  }

  /**
   * Export metrics for recompilation
   */
  exportMetrics(): Map<string, LiveMetrics> {
    return new Map(this.liveMetrics)
  }

  /**
   * Hot reload compiled graph
   */
  reload(compiled: CompiledGraph): void {
    console.log('🔄 Hot reloading compiled graph...')

    this.compiled = compiled
    this.routeCache = this.buildRouteCache(compiled)

    console.log(`✅ Reloaded: ${compiled.routes.length} routes`)
  }
}

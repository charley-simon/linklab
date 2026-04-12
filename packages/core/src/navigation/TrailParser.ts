/**
 * TrailParser — Désérialise des représentations externes vers un Trail
 *
 * Trois sources supportées :
 *
 *   URL path   →  /cinema/people/Nolan/movies/Interstellar/actors
 *   URL fluent →  cinema.people(Nolan).movies(Interstellar).actors
 *   JSON       →  SerializedTrail (via Trail.from)
 *
 * Le parser est stateless — toutes les méthodes sont statiques.
 * Il ne valide pas les entités contre le graphe — c'est le rôle du moteur.
 */

import { Trail } from './Trail.js'
import type { Frame } from '../types/index.js'

export class TrailParser {

  // ── URL Path ───────────────────────────────────────────────

  /**
   * Parse un path HTTP en Trail.
   *
   * Convention :
   *   /entity              → Frame(entity, UNRESOLVED)
   *   /entity/id           → Frame(entity, id, RESOLVED)
   *   /entity/id/other     → Frame(entity, id) + Frame(other, UNRESOLVED)
   *
   * Exemples :
   *   /people                     → [people?]
   *   /people/Nolan               → [people(Nolan)]
   *   /people/Nolan/movies        → [people(Nolan)] → [movies?]
   *   /people/Nolan/movies/2      → [people(Nolan)] → [movies(2)]
   *   /cinema/people/Nolan/movies → [cinema] → [people(Nolan)] → [movies?]
   *
   * @param path  - URL path, avec ou sans slash initial
   * @param init  - Contextes global/user à injecter
   */
  static fromPath(
    path: string,
    init: { global?: Record<string, any>; user?: Record<string, any> } = {}
  ): Trail {
    const trail  = Trail.create(init)
    const parts  = path.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean)

    let i = 0
    while (i < parts.length) {
      const entity = parts[i]
      const next   = parts[i + 1]

      // Si le prochain segment existe et n'est pas une entité connue
      // (heuristique : commence par une lettre minuscule = entité, sinon = id)
      const nextIsId = next !== undefined && !TrailParser.looksLikeEntity(next)

      if (nextIsId) {
        trail.push({ entity, id: TrailParser.coerceId(next), state: 'RESOLVED' })
        i += 2
      } else {
        trail.push({ entity, state: 'UNRESOLVED' })
        i += 1
      }
    }

    return trail
  }

  /**
   * Parse une expression fluente en Trail.
   *
   * Syntaxe :
   *   entity                  → Frame(entity, UNRESOLVED)
   *   entity(id)              → Frame(entity, id, RESOLVED)
   *   entity.other            → Frame(entity) + Frame(other)
   *   entity(id).other(id2)   → Frame(entity,id) + Frame(other,id2)
   *
   * Exemples :
   *   people                         → [people?]
   *   people(Nolan)                  → [people(Nolan)]
   *   people(Nolan).movies           → [people(Nolan)] → [movies?]
   *   cinema.people(Nolan).movies(2) → [cinema] → [people(Nolan)] → [movies(2)]
   *
   * @param expr  - Expression fluente
   * @param init  - Contextes global/user à injecter
   */
  static fromFluent(
    expr: string,
    init: { global?: Record<string, any>; user?: Record<string, any> } = {}
  ): Trail {
    const trail   = Trail.create(init)

    // Tokenise : split sur les points, mais pas ceux dans les parenthèses
    const tokens  = TrailParser.tokenizeFluent(expr)

    for (const token of tokens) {
      const frame = TrailParser.parseToken(token)
      trail.push(frame)
    }

    return trail
  }

  /**
   * Sérialise un Trail en path HTTP.
   *
   * Exemple :
   *   Trail([people(Nolan)][movies?])  →  /people/Nolan/movies
   */
  static toPath(trail: Trail): string {
    const parts: string[] = []

    for (const frame of trail.frames) {
      parts.push(frame.entity)
      if (frame.id !== undefined) {
        parts.push(String(frame.id))
      }
    }

    return '/' + parts.join('/')
  }

  /**
   * Sérialise un Trail en expression fluente.
   *
   * Exemple :
   *   Trail([people(Nolan)][movies?])  →  people(Nolan).movies
   */
  static toFluent(trail: Trail): string {
    return trail.frames
      .map(f => f.id !== undefined ? `${f.entity}(${f.id})` : f.entity)
      .join('.')
  }

  // ── Helpers privés ─────────────────────────────────────────

  /**
   * Heuristique : un segment ressemble-t-il à un nom d'entité ?
   * Les entités commencent par une lettre minuscule et ne contiennent
   * que des lettres, chiffres et tirets.
   */
  private static looksLikeEntity(segment: string): boolean {
    return /^[a-z][a-zA-Z0-9-_]*$/.test(segment)
  }

  /**
   * Essaie de convertir un id en nombre, sinon garde la string.
   */
  private static coerceId(value: string): string | number {
    const n = Number(value)
    return Number.isFinite(n) && value.trim() !== '' ? n : value
  }

  /**
   * Tokenise une expression fluente en segments.
   * Préserve le contenu des parenthèses (les ids peuvent contenir des points).
   *
   * ex: "cinema.people(Nolan.Jr).movies"
   *   → ["cinema", "people(Nolan.Jr)", "movies"]
   */
  private static tokenizeFluent(expr: string): string[] {
    const tokens: string[] = []
    let current = ''
    let depth   = 0

    for (const ch of expr) {
      if (ch === '(') {
        depth++
        current += ch
      } else if (ch === ')') {
        depth--
        current += ch
      } else if (ch === '.' && depth === 0) {
        if (current) tokens.push(current)
        current = ''
      } else {
        current += ch
      }
    }

    if (current) tokens.push(current)
    return tokens
  }

  /**
   * Parse un token "entity" ou "entity(id)" en Frame.
   */
  private static parseToken(token: string): Frame {
    const match = token.match(/^([^(]+)(?:\(([^)]*)\))?$/)

    if (!match) {
      // Token malformé — on le traite comme une entité sans id
      return { entity: token, state: 'UNRESOLVED' }
    }

    const entity = match[1].trim()
    const rawId  = match[2]

    if (rawId === undefined || rawId === '') {
      return { entity, state: 'UNRESOLVED' }
    }

    return {
      entity,
      id:    TrailParser.coerceId(rawId),
      state: 'RESOLVED',
    }
  }
}

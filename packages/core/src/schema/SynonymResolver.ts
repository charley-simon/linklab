/**
 * SynonymResolver — Résolution de noms de tables par convention et synonymes
 *
 * Utilisé par :
 *   JsonSchemaExtractor  — résolution FK par convention de nommage
 *   SchemaAnalyzer       — détection FK implicites (store_id → store)
 *   GraphBuilder         — à venir
 *
 * Sources de synonymes (fusionnées dans l'ordre) :
 *   1. config/synonyms.json      — irréguliers universels (livré avec LinkLab)
 *   2. <projectPath>/synonyms.json — spécifiques au projet (optionnel)
 *
 * Stratégies de résolution dans l'ordre :
 *   1. Correspondance directe       prefix === tableName
 *   2. Synonyme explicite           synonyms[prefix] === tableName
 *   3. Pluriel régulier +s          prefix + 's'
 *   4. Pluriel en -ies              category → categories
 *   5. Pluriel en -es               address → addresses
 */

import fs from 'fs'
import path from 'path'

export class SynonymResolver {

  private synonyms: Record<string, string>

  constructor(
    private configPath: string = path.join(process.cwd(), 'config'),
    private projectPath?: string
  ) {
    this.synonyms = this.load()
  }

  // ─── Chargement ────────────────────────────────────────────────────────────

  private load(): Record<string, string> {
    const universalPath = path.join(this.configPath, 'synonyms.json')
    const projectPath   = this.projectPath
      ? path.join(this.projectPath, 'synonyms.json')
      : null

    let universal: Record<string, string> = {}
    let project:   Record<string, string> = {}

    if (fs.existsSync(universalPath)) {
      universal = this.filter(JSON.parse(fs.readFileSync(universalPath, 'utf-8')))
    } else {
      console.warn(`   ⚠️  SynonymResolver — config/synonyms.json introuvable : ${universalPath}`)
    }

    if (projectPath && fs.existsSync(projectPath)) {
      project = this.filter(JSON.parse(fs.readFileSync(projectPath, 'utf-8')))
    }

    const merged = { ...universal, ...project }

    const counts = [
      `universels: ${Object.keys(universal).length}`,
      Object.keys(project).length ? `projet: ${Object.keys(project).length}` : null,
      `total: ${Object.keys(merged).length}`
    ].filter(Boolean).join(', ')

    console.log(`   📖 Synonymes (${counts})`)
    return merged
  }

  /** Filtre les clés de commentaire (_comment, etc.) */
  private filter(raw: Record<string, string>): Record<string, string> {
    return Object.fromEntries(
      Object.entries(raw).filter(([k]) => !k.startsWith('_'))
    )
  }

  // ─── Résolution ────────────────────────────────────────────────────────────

  /**
   * Résout un préfixe vers un nom de table existant.
   * Retourne null si aucune table ne correspond.
   *
   * @param prefix       Préfixe extrait du nom de colonne (ex: "person" depuis "personId")
   * @param tableNames   Liste des noms de tables disponibles
   */
  resolve(prefix: string, tableNames: string[]): string | null {
    const lc = (s: string) => s.toLowerCase()
    const p  = prefix.toLowerCase()

    const pluralIes = p.endsWith('y') ? p.slice(0, -1) + 'ies' : null
    const pluralEs  = p.endsWith('s') || p.endsWith('x') || p.endsWith('z')
                   || p.endsWith('ch') || p.endsWith('sh')
                      ? p + 'es' : null

    return (
      // 1. Correspondance directe
      tableNames.find(t => lc(t) === p)                                    ??
      // 2. Synonyme explicite
      tableNames.find(t => lc(t) === lc(this.synonyms[p] ?? '__none__'))   ??
      // 3. Pluriel régulier +s
      tableNames.find(t => lc(t) === p + 's')                              ??
      // 4. Pluriel en -ies (category → categories)
      (pluralIes ? tableNames.find(t => lc(t) === pluralIes) : null)       ??
      // 5. Pluriel en -es (address → addresses)
      (pluralEs  ? tableNames.find(t => lc(t) === pluralEs)  : null)       ??
      null
    )
  }

  /**
   * Extrait le préfixe d'un nom de colonne FK.
   * Gère les conventions camelCase et snake_case.
   *
   * Exemples :
   *   personId      → person
   *   person_id     → person
   *   movieId       → movie
   *   manager_staff_id → manager_staff  (FK complexe — peut ne pas résoudre)
   */
  extractPrefix(columnName: string): string {
    return columnName
      .replace(/Id$/,   '')
      .replace(/_id$/i, '')
      .toLowerCase()
  }

  /**
   * Résout directement depuis un nom de colonne FK.
   * Combine extractPrefix + resolve.
   */
  resolveColumn(columnName: string, tableNames: string[]): string | null {
    const prefix = this.extractPrefix(columnName)
    return this.resolve(prefix, tableNames)
  }

  // ─── Inspection ────────────────────────────────────────────────────────────

  getSynonyms(): Record<string, string> {
    return { ...this.synonyms }
  }

  has(prefix: string): boolean {
    return prefix.toLowerCase() in this.synonyms
  }
}

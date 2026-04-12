import fs from 'fs'
import path from 'path'
import type { AnalyzedSchema, Dictionary, Relation } from '../types/index.js'

export class GraphBuilder {
  /**
   * Construit le dictionnaire final à partir du schéma analysé
   */
  build(analyzed: AnalyzedSchema, dataPath: string): Dictionary {
    const dictionary: Dictionary = {
      tables: [],
      relations: []
    }

    // 1. Déclarer les tables
    for (const ent of analyzed.entities) {
      dictionary.tables.push({
        name: ent.name,
        columns: ent.properties.map(p => p.name),
        rowCount: ent.rowCount
      })

      // 2. Transformer les PK/FK physiques en relations de base
      for (const prop of ent.properties) {
        if (prop.isFK && prop.references) {
          dictionary.relations.push({
            from: ent.name,
            to: prop.references.table,
            via: prop.name,
            type: 'physical',
            weight: analyzed.weights[`${ent.name}.${prop.name}`] || 1,
            label: `FK_${prop.name}`
          })

          // Relation inverse (One-to-Many implicite)
          dictionary.relations.push({
            from: prop.references.table,
            to: ent.name,
            via: prop.name,
            type: 'physical_reverse',
            weight: (analyzed.weights[`${ent.name}.${prop.name}`] || 1) * 1.1, // Légèrement plus lourd de remonter
            label: `LIST_OF_${ent.name.toUpperCase()}`
          })
        }
      }
    }

    // 3. Génération des Vues Sémantiques (L'intelligence métier)
    this.injectVirtualViews(analyzed, dictionary, dataPath)

    return dictionary
  }

  private injectVirtualViews(analyzed: AnalyzedSchema, dict: Dictionary, dataPath: string) {
    // On cherche le conseil de pivot que l'Analyzer a posé
    const pivotAdvices = analyzed.advices.filter(a => a.action === 'SUGGEST_VIRTUAL_VIEWS')

    for (const advice of pivotAdvices) {
      const pivotTable = advice.target // ex: 'credits'

      // On cherche quelle table sert de "Type" pour segmenter (ex: jobs)
      const entity = analyzed.entities.find(e => e.name === pivotTable)
      const typeFK = entity?.properties.find(p =>
        /type|job|category|role/i.test(p.references?.table || '')
      )

      if (typeFK && typeFK.references) {
        const typeTableName = typeFK.references.table
        const typeDataPath = path.join(dataPath, `${typeTableName}.json`)

        if (fs.existsSync(typeDataPath)) {
          const types = JSON.parse(fs.readFileSync(typeDataPath, 'utf-8'))

          types.forEach((typeObj: any) => {
            const roleName = typeObj.name.toLowerCase()

            // Ignorer les rôles sans nom significatif
            if (!roleName || /^unknow|^unknown|^n\/a/i.test(roleName)) return

            // On crée l'arête sémantique : movies -> people (via credits filtré)
            dict.relations.push({
              from: 'movies',
              to: 'people',
              via: pivotTable,
              type: 'semantic_view',
              label: roleName,
              condition: { [typeFK.name]: typeObj.id },
              weight: 0.8 // Très léger car c'est une intention directe de l'utilisateur
            })

            // Et l'inverse : people -> movies (via credits filtré)
            dict.relations.push({
              from: 'people',
              to: 'movies',
              via: pivotTable,
              type: 'semantic_view',
              label: `${roleName}_in`,
              condition: { [typeFK.name]: typeObj.id },
              weight: 0.8
            })
          })
        }
      }
    }
  }
}

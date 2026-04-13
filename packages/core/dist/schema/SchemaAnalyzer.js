/**
 * SchemaAnalyzer — Analyse sémantique d'un schéma technique
 *
 * Produit :
 *   - Poids par colonne (basés sur volumétrie et indexation)
 *   - Advices de performance (FK non indexées)
 *   - Détection de pivots sémantiques (tables de liaison)
 *   - Détection de FK implicites via SynonymResolver
 *     (colonnes *_id sans FK déclarée qui correspondent à une table existante)
 *
 * Compatible PostgreSQL et JSON — même logique quelque soit la source.
 */
import fs from 'fs';
import { SynonymResolver } from './SynonymResolver.js';
export class SchemaAnalyzer {
    advices = [];
    weights = {};
    resolver;
    constructor(configPath = process.cwd() + '/config', projectPath) {
        this.resolver = new SynonymResolver(configPath, projectPath);
    }
    analyze(schema) {
        this.advices = [];
        this.weights = {};
        for (const entity of schema.entities) {
            this.analyzeEntity(entity);
        }
        this.detectSemanticPivots(schema);
        this.detectImplicitFKs(schema);
        return {
            ...schema,
            advices: this.advices,
            weights: this.weights,
            implicitRelations: this.collectImplicitRelations(schema)
        };
    }
    // ─── Analyse par entité ────────────────────────────────────────────────────
    analyzeEntity(entity) {
        for (const prop of entity.properties) {
            const key = `${entity.name}.${prop.name}`;
            let weight = 1;
            // FK non indexée — coût de traversée élevé
            if (prop.isFK && !prop.isIndexed) {
                weight = 10;
                this.advices.push({
                    type: 'PERFORMANCE',
                    level: 'WARNING',
                    target: key,
                    message: `FK '${prop.name}' non indexée dans '${entity.name}'.`,
                    action: `CREATE INDEX idx_${entity.name}_${prop.name} ON ${entity.name}(${prop.name});`
                });
            }
            // Volumétrie — tables larges coûtent plus cher à traverser
            if (entity.rowCount > 1000) {
                weight += parseFloat(Math.log10(entity.rowCount / 100).toFixed(2));
            }
            this.weights[key] = weight;
        }
    }
    // ─── Pivots sémantiques ────────────────────────────────────────────────────
    /**
     * Détecte les tables de liaison (credits, film_category...)
     * Pattern : table avec 2+ FK dont une vers une table de "types"
     */
    detectSemanticPivots(schema) {
        for (const entity of schema.entities) {
            const fks = entity.properties.filter(p => p.isFK);
            if (fks.length < 2)
                continue;
            const typeFK = fks.find(fk => /type|job|category|dept|role|department/i.test(fk.references?.table ?? ''));
            if (typeFK) {
                this.advices.push({
                    type: 'STRUCTURE',
                    level: 'INFO',
                    target: entity.name,
                    message: `Pivot sémantique — segmentation possible par '${typeFK.references.table}'.`,
                    action: 'SUGGEST_VIRTUAL_VIEWS'
                });
            }
        }
    }
    // ─── FK implicites ─────────────────────────────────────────────────────────
    /**
     * Détecte les colonnes *_id sans FK déclarée qui correspondent
     * à une table existante via SynonymResolver.
     *
     * Utile pour :
     *   - PostgreSQL : FK non déclarées (store.store_id non contrainte)
     *   - JSON       : colonnes oubliées dans la passe 2 de JsonSchemaExtractor
     */
    detectImplicitFKs(schema) {
        const tableNames = schema.entities.map(e => e.name);
        for (const entity of schema.entities) {
            for (const prop of entity.properties) {
                // Ignorer PK et FK déjà déclarées
                if (prop.isPK || prop.isFK)
                    continue;
                if (!prop.name.endsWith('_id') && !prop.name.endsWith('Id'))
                    continue;
                const target = this.resolver.resolveColumn(prop.name, tableNames);
                if (!target)
                    continue;
                // FK implicite trouvée
                this.advices.push({
                    type: 'STRUCTURE',
                    level: 'INFO',
                    target: `${entity.name}.${prop.name}`,
                    message: `FK implicite détectée : '${entity.name}.${prop.name}' → '${target}'.`,
                    action: 'ADD_IMPLICIT_FK'
                });
            }
        }
    }
    /**
     * Collecte les FK implicites comme relations exploitables par GraphBuilder.
     */
    collectImplicitRelations(schema) {
        const tableNames = schema.entities.map(e => e.name);
        const result = [];
        for (const entity of schema.entities) {
            for (const prop of entity.properties) {
                if (prop.isPK || prop.isFK)
                    continue;
                if (!prop.name.endsWith('_id') && !prop.name.endsWith('Id'))
                    continue;
                const target = this.resolver.resolveColumn(prop.name, tableNames);
                if (target) {
                    result.push({
                        fromTable: entity.name,
                        column: prop.name,
                        guessedTable: target
                    });
                }
            }
        }
        return result;
    }
    // ─── Persistence ───────────────────────────────────────────────────────────
    saveAnalysis(analyzed, outputPath) {
        fs.writeFileSync(outputPath, JSON.stringify(analyzed, null, 2));
        console.log(`💾 Analyse sauvegardée : ${outputPath}`);
    }
}
//# sourceMappingURL=SchemaAnalyzer.js.map
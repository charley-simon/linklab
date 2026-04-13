/**
 * JsonSchemaExtractor — Extraction de schéma depuis des fichiers JSON
 *
 * Inférence automatique :
 *   - Types de colonnes depuis le premier enregistrement
 *   - FK par convention de nommage (*Id → table cible) via SynonymResolver
 *   - Détection des arrays inline (ex: movies.categories)
 *
 * Synonymes :
 *   Délégués à SynonymResolver — config/synonyms.json + <dataPath>/synonyms.json
 */
import fs from 'fs';
import path from 'path';
import { SynonymResolver } from './SynonymResolver.js';
export class JsonSchemaExtractor {
    dataPath;
    resolver;
    constructor(dataPath, configPath = path.join(process.cwd(), 'config')) {
        this.dataPath = dataPath;
        // Passe le dataPath comme projectPath — synonyms.json projet y est optionnel
        this.resolver = new SynonymResolver(configPath, dataPath);
    }
    async extract() {
        console.log(`📂 JsonSchemaExtractor — scanning : ${this.dataPath}`);
        const files = fs.readdirSync(this.dataPath)
            .filter(f => f.endsWith('.json') && f !== 'synonyms.json');
        const entities = [];
        // Passe 1 — inférer entités et propriétés
        for (const file of files) {
            const tableName = path.basename(file, '.json');
            const content = JSON.parse(fs.readFileSync(path.join(this.dataPath, file), 'utf-8'));
            if (!Array.isArray(content) || content.length === 0) {
                console.log(`   ⏭️  ${file} — vide ou non-liste, ignoré`);
                continue;
            }
            const properties = this.inferProperties(content[0]);
            const arrayCols = properties.filter(p => p.type === 'array').map(p => p.name);
            entities.push({ name: tableName, properties, rowCount: content.length });
            console.log(`   ✅ ${tableName} (${content.length} entrées` +
                (arrayCols.length ? `, arrays: ${arrayCols.join(', ')}` : '') + ')');
        }
        // Passe 2 — résoudre les FK via SynonymResolver
        this.resolveForeignKeys(entities);
        return {
            source: {
                type: 'json_files',
                name: path.basename(this.dataPath),
                generatedAt: new Date().toISOString()
            },
            entities
        };
    }
    inferProperties(sample) {
        return Object.entries(sample).map(([key, value]) => ({
            name: key,
            type: Array.isArray(value) ? 'array'
                : value === null ? 'null'
                    : typeof value === 'object' ? 'object'
                        : typeof value,
            isPK: key === 'id',
            isFK: false,
            isIndexed: true,
            nullable: value === null
        }));
    }
    resolveForeignKeys(entities) {
        const tableNames = entities.map(e => e.name);
        for (const entity of entities) {
            for (const prop of entity.properties) {
                if (prop.isPK)
                    continue;
                if (!prop.name.endsWith('Id') && !prop.name.endsWith('_id'))
                    continue;
                const target = this.resolver.resolveColumn(prop.name, tableNames);
                if (target) {
                    prop.isFK = true;
                    prop.references = { table: target, column: 'id' };
                    console.log(`   🔗 ${entity.name}.${prop.name} → ${target}.id`);
                }
                else {
                    const prefix = this.resolver.extractPrefix(prop.name);
                    console.log(`   ❓ ${entity.name}.${prop.name} — "${prefix}" introuvable`);
                }
            }
        }
    }
}
//# sourceMappingURL=JsonSchemaExtractor.js.map
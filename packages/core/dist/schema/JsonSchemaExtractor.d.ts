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
import type { TechnicalSchema } from '../types/index.js';
export declare class JsonSchemaExtractor {
    private dataPath;
    private resolver;
    constructor(dataPath: string, configPath?: string);
    extract(): Promise<TechnicalSchema>;
    private inferProperties;
    private resolveForeignKeys;
}
//# sourceMappingURL=JsonSchemaExtractor.d.ts.map
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
import type { TechnicalSchema, AnalyzedSchema } from '../types/index.js';
export declare class SchemaAnalyzer {
    private advices;
    private weights;
    private resolver;
    constructor(configPath?: string, projectPath?: string);
    analyze(schema: TechnicalSchema): AnalyzedSchema;
    private analyzeEntity;
    /**
     * Détecte les tables de liaison (credits, film_category...)
     * Pattern : table avec 2+ FK dont une vers une table de "types"
     */
    private detectSemanticPivots;
    /**
     * Détecte les colonnes *_id sans FK déclarée qui correspondent
     * à une table existante via SynonymResolver.
     *
     * Utile pour :
     *   - PostgreSQL : FK non déclarées (store.store_id non contrainte)
     *   - JSON       : colonnes oubliées dans la passe 2 de JsonSchemaExtractor
     */
    private detectImplicitFKs;
    /**
     * Collecte les FK implicites comme relations exploitables par GraphBuilder.
     */
    private collectImplicitRelations;
    saveAnalysis(analyzed: AnalyzedSchema, outputPath: string): void;
}
//# sourceMappingURL=SchemaAnalyzer.d.ts.map
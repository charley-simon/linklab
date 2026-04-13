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
export declare class SynonymResolver {
    private configPath;
    private projectPath?;
    private synonyms;
    constructor(configPath?: string, projectPath?: string | undefined);
    private load;
    /** Filtre les clés de commentaire (_comment, etc.) */
    private filter;
    /**
     * Résout un préfixe vers un nom de table existant.
     * Retourne null si aucune table ne correspond.
     *
     * @param prefix       Préfixe extrait du nom de colonne (ex: "person" depuis "personId")
     * @param tableNames   Liste des noms de tables disponibles
     */
    resolve(prefix: string, tableNames: string[]): string | null;
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
    extractPrefix(columnName: string): string;
    /**
     * Résout directement depuis un nom de colonne FK.
     * Combine extractPrefix + resolve.
     */
    resolveColumn(columnName: string, tableNames: string[]): string | null;
    getSynonyms(): Record<string, string>;
    has(prefix: string): boolean;
}
//# sourceMappingURL=SynonymResolver.d.ts.map
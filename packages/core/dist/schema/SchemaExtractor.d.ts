import type { Provider, TechnicalSchema } from '../types/index.js';
export declare class SchemaExtractor {
    private provider;
    constructor(provider: Provider);
    extract(databaseName: string): Promise<TechnicalSchema>;
    private getTables;
    private getProperties;
    private getRowCount;
}
//# sourceMappingURL=SchemaExtractor.d.ts.map
/**
 * LinkLab Core Types
 * * Base type definitions for the entire system
 */
export class LinkLabError extends Error {
    code;
    details;
    constructor(message, code, details) {
        super(message);
        this.code = code;
        this.details = details;
        this.name = 'LinkLabError';
    }
}
export class ProviderError extends LinkLabError {
    constructor(message, details) {
        super(message, 'PROVIDER_ERROR', details);
        this.name = 'ProviderError';
    }
}
//# sourceMappingURL=index.js.map
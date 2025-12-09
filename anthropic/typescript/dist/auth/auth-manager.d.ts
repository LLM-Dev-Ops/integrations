import type { BetaFeature } from '../config/config.js';
/**
 * Interface for managing authentication headers
 */
export interface AuthManager {
    /**
     * Generates authentication headers for API requests
     */
    getHeaders(): Record<string, string>;
    /**
     * Validates the API key format
     */
    validateApiKey(): void;
}
/**
 * Bearer token authentication manager for Anthropic API
 */
export declare class BearerAuthManager implements AuthManager {
    private readonly apiKey;
    private readonly apiVersion;
    private readonly betaFeatures;
    private readonly customHeaders;
    constructor(options: {
        apiKey: string;
        apiVersion: string;
        betaFeatures?: BetaFeature[];
        customHeaders?: Record<string, string>;
    });
    /**
     * Validates the API key format
     */
    validateApiKey(): void;
    /**
     * Generates authentication headers for API requests
     */
    getHeaders(): Record<string, string>;
    /**
     * Gets streaming headers (same as regular headers for Anthropic)
     */
    getStreamHeaders(): Record<string, string>;
}
/**
 * Creates a default AuthManager instance
 */
export declare function createAuthManager(options: {
    apiKey: string;
    apiVersion: string;
    betaFeatures?: BetaFeature[];
    customHeaders?: Record<string, string>;
}): AuthManager;
//# sourceMappingURL=auth-manager.d.ts.map
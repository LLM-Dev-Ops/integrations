import { AuthenticationError } from '../errors/categories.js';
/**
 * Bearer token authentication manager for Anthropic API
 */
export class BearerAuthManager {
    apiKey;
    apiVersion;
    betaFeatures;
    customHeaders;
    constructor(options) {
        this.apiKey = options.apiKey;
        this.apiVersion = options.apiVersion;
        this.betaFeatures = options.betaFeatures ?? [];
        this.customHeaders = options.customHeaders ?? {};
        this.validateApiKey();
    }
    /**
     * Validates the API key format
     */
    validateApiKey() {
        if (!this.apiKey || typeof this.apiKey !== 'string') {
            throw new AuthenticationError('API key must be a non-empty string');
        }
        if (this.apiKey.trim().length === 0) {
            throw new AuthenticationError('API key cannot be empty or whitespace');
        }
        // Anthropic API keys typically start with 'sk-ant-'
        if (!this.apiKey.startsWith('sk-ant-')) {
            console.warn('Warning: API key does not match expected format (should start with "sk-ant-"). ' +
                'This may indicate an invalid key.');
        }
    }
    /**
     * Generates authentication headers for API requests
     */
    getHeaders() {
        const headers = {
            'x-api-key': this.apiKey,
            'anthropic-version': this.apiVersion,
            'content-type': 'application/json',
            ...this.customHeaders,
        };
        // Add beta features header if any are specified
        if (this.betaFeatures.length > 0) {
            headers['anthropic-beta'] = this.betaFeatures.join(',');
        }
        return headers;
    }
    /**
     * Gets streaming headers (same as regular headers for Anthropic)
     */
    getStreamHeaders() {
        return {
            ...this.getHeaders(),
            'accept': 'text/event-stream',
        };
    }
}
/**
 * Creates a default AuthManager instance
 */
export function createAuthManager(options) {
    return new BearerAuthManager(options);
}
//# sourceMappingURL=auth-manager.js.map
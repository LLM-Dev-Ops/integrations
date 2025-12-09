import { validateConfig } from '../config/config.js';
import { createAuthManager } from '../auth/auth-manager.js';
import { createHttpTransport } from '../transport/http-transport.js';
import { ConfigurationError } from '../errors/categories.js';
/**
 * Implementation of the Anthropic API client
 */
export class AnthropicClientImpl {
    config;
    transport;
    authManager;
    constructor(config) {
        this.config = validateConfig(config);
        this.authManager = createAuthManager({
            apiKey: this.config.apiKey,
            apiVersion: this.config.apiVersion,
            betaFeatures: this.config.betaFeatures,
            customHeaders: this.config.headers,
        });
        this.transport = createHttpTransport(this.config.baseUrl, this.authManager.getHeaders(), this.config.timeout, this.config.fetch);
    }
    /**
     * Messages API - placeholder implementation
     */
    messages = {
        create: async (params) => {
            throw new Error('Messages API not yet implemented');
        },
        stream: async function* (params) {
            throw new Error('Messages streaming not yet implemented');
        },
    };
    /**
     * Models API - placeholder implementation
     */
    models = {
        list: async () => {
            throw new Error('Models API not yet implemented');
        },
        get: async (modelId) => {
            throw new Error('Models API not yet implemented');
        },
    };
    /**
     * Batches API - placeholder implementation
     */
    batches = {
        create: async (params) => {
            throw new Error('Batches API not yet implemented');
        },
        retrieve: async (batchId) => {
            throw new Error('Batches API not yet implemented');
        },
        list: async (params) => {
            throw new Error('Batches API not yet implemented');
        },
        cancel: async (batchId) => {
            throw new Error('Batches API not yet implemented');
        },
    };
    getConfig() {
        return Object.freeze({ ...this.config });
    }
    getTransport() {
        return this.transport;
    }
    getAuthManager() {
        return this.authManager;
    }
}
/**
 * Creates a new Anthropic API client with the provided configuration
 */
export function createClient(config) {
    return new AnthropicClientImpl(config);
}
/**
 * Creates a new Anthropic API client using environment variables
 *
 * Expected environment variables:
 * - ANTHROPIC_API_KEY (required)
 * - ANTHROPIC_BASE_URL (optional)
 * - ANTHROPIC_API_VERSION (optional)
 */
export function createClientFromEnv(overrides) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        throw new ConfigurationError('ANTHROPIC_API_KEY environment variable is not set. ' +
            'Please set it or provide an apiKey in the config.');
    }
    const config = {
        apiKey,
        baseUrl: process.env.ANTHROPIC_BASE_URL,
        apiVersion: process.env.ANTHROPIC_API_VERSION,
        ...overrides,
    };
    return createClient(config);
}
//# sourceMappingURL=client.js.map
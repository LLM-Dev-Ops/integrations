/**
 * Default API configuration constants
 */
export const DEFAULT_BASE_URL = 'https://api.anthropic.com';
export const DEFAULT_API_VERSION = '2023-06-01';
export const DEFAULT_TIMEOUT = 600000; // 10 minutes in milliseconds
export const DEFAULT_MAX_RETRIES = 2;
/**
 * Validates and normalizes the configuration
 */
export function validateConfig(config) {
    if (!config.apiKey || typeof config.apiKey !== 'string' || config.apiKey.trim().length === 0) {
        throw new Error('API key is required and must be a non-empty string');
    }
    const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
        throw new Error('Base URL must start with http:// or https://');
    }
    const timeout = config.timeout ?? DEFAULT_TIMEOUT;
    if (timeout < 0) {
        throw new Error('Timeout must be a non-negative number');
    }
    const maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
    if (maxRetries < 0) {
        throw new Error('Max retries must be a non-negative number');
    }
    return {
        apiKey: config.apiKey.trim(),
        baseUrl: baseUrl.replace(/\/$/, ''), // Remove trailing slash
        apiVersion: config.apiVersion ?? DEFAULT_API_VERSION,
        timeout,
        maxRetries,
        betaFeatures: config.betaFeatures ?? [],
        headers: config.headers ?? {},
        fetch: config.fetch ?? globalThis.fetch,
    };
}
/**
 * Fluent builder for creating AnthropicConfig objects
 */
export class AnthropicConfigBuilder {
    config = {};
    /**
     * Sets the API key
     */
    withApiKey(apiKey) {
        this.config.apiKey = apiKey;
        return this;
    }
    /**
     * Sets the base URL
     */
    withBaseUrl(baseUrl) {
        this.config.baseUrl = baseUrl;
        return this;
    }
    /**
     * Sets the API version
     */
    withApiVersion(apiVersion) {
        this.config.apiVersion = apiVersion;
        return this;
    }
    /**
     * Sets the request timeout
     */
    withTimeout(timeout) {
        this.config.timeout = timeout;
        return this;
    }
    /**
     * Sets the maximum number of retries
     */
    withMaxRetries(maxRetries) {
        this.config.maxRetries = maxRetries;
        return this;
    }
    /**
     * Adds a beta feature
     */
    withBetaFeature(feature) {
        this.config.betaFeatures = [...(this.config.betaFeatures ?? []), feature];
        return this;
    }
    /**
     * Sets multiple beta features
     */
    withBetaFeatures(features) {
        this.config.betaFeatures = features;
        return this;
    }
    /**
     * Adds a custom header
     */
    withHeader(key, value) {
        this.config.headers = { ...this.config.headers, [key]: value };
        return this;
    }
    /**
     * Sets multiple custom headers
     */
    withHeaders(headers) {
        this.config.headers = { ...this.config.headers, ...headers };
        return this;
    }
    /**
     * Sets a custom fetch implementation
     */
    withFetch(fetch) {
        this.config.fetch = fetch;
        return this;
    }
    /**
     * Builds and validates the configuration
     */
    build() {
        if (!this.config.apiKey) {
            throw new Error('API key is required. Use withApiKey() to set it.');
        }
        return validateConfig(this.config);
    }
    /**
     * Creates a builder from an existing config
     */
    static from(config) {
        const builder = new AnthropicConfigBuilder();
        builder.config = { ...config };
        return builder;
    }
}
//# sourceMappingURL=config.js.map
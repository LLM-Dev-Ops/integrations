/**
 * Beta features that can be enabled in the Anthropic API.
 * These features may have breaking changes between versions.
 */
export type BetaFeature = 'message-batches-2024-09-24' | 'prompt-caching-2024-07-31' | 'computer-use-2024-10-22' | 'token-counting-2024-11-01' | 'extended-thinking-2025-01-29';
/**
 * Default API configuration constants
 */
export declare const DEFAULT_BASE_URL = "https://api.anthropic.com";
export declare const DEFAULT_API_VERSION = "2023-06-01";
export declare const DEFAULT_TIMEOUT = 600000;
export declare const DEFAULT_MAX_RETRIES = 2;
/**
 * Configuration interface for the Anthropic API client
 */
export interface AnthropicConfig {
    /**
     * API key for authentication with Anthropic API.
     * Can be obtained from https://console.anthropic.com/
     */
    apiKey: string;
    /**
     * Base URL for the API.
     * @default 'https://api.anthropic.com'
     */
    baseUrl?: string;
    /**
     * API version to use.
     * @default '2023-06-01'
     */
    apiVersion?: string;
    /**
     * Request timeout in milliseconds.
     * @default 600000 (10 minutes)
     */
    timeout?: number;
    /**
     * Maximum number of retry attempts for failed requests.
     * @default 2
     */
    maxRetries?: number;
    /**
     * Beta features to enable.
     * @default []
     */
    betaFeatures?: BetaFeature[];
    /**
     * Custom headers to include in all requests
     */
    headers?: Record<string, string>;
    /**
     * Custom fetch implementation (useful for testing or custom environments)
     */
    fetch?: typeof fetch;
}
/**
 * Validates and normalizes the configuration
 */
export declare function validateConfig(config: AnthropicConfig): Required<AnthropicConfig>;
/**
 * Fluent builder for creating AnthropicConfig objects
 */
export declare class AnthropicConfigBuilder {
    private config;
    /**
     * Sets the API key
     */
    withApiKey(apiKey: string): this;
    /**
     * Sets the base URL
     */
    withBaseUrl(baseUrl: string): this;
    /**
     * Sets the API version
     */
    withApiVersion(apiVersion: string): this;
    /**
     * Sets the request timeout
     */
    withTimeout(timeout: number): this;
    /**
     * Sets the maximum number of retries
     */
    withMaxRetries(maxRetries: number): this;
    /**
     * Adds a beta feature
     */
    withBetaFeature(feature: BetaFeature): this;
    /**
     * Sets multiple beta features
     */
    withBetaFeatures(features: BetaFeature[]): this;
    /**
     * Adds a custom header
     */
    withHeader(key: string, value: string): this;
    /**
     * Sets multiple custom headers
     */
    withHeaders(headers: Record<string, string>): this;
    /**
     * Sets a custom fetch implementation
     */
    withFetch(fetch: typeof globalThis.fetch): this;
    /**
     * Builds and validates the configuration
     */
    build(): Required<AnthropicConfig>;
    /**
     * Creates a builder from an existing config
     */
    static from(config: AnthropicConfig): AnthropicConfigBuilder;
}
//# sourceMappingURL=config.d.ts.map
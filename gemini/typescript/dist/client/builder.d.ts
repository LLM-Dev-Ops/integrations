/**
 * Builder for creating Gemini client instances.
 */
import type { GeminiClient } from './types.js';
/**
 * Builder for creating Gemini client instances with fluent API.
 */
export declare class GeminiClientBuilder {
    private config;
    /**
     * Set the API key.
     */
    withApiKey(apiKey: string): this;
    /**
     * Set the base URL.
     */
    withBaseUrl(baseUrl: string): this;
    /**
     * Set the API version.
     */
    withApiVersion(apiVersion: string): this;
    /**
     * Set the authentication method.
     */
    withAuthMethod(authMethod: 'queryParam' | 'header'): this;
    /**
     * Set the request timeout.
     */
    withTimeout(timeout: number): this;
    /**
     * Build the client.
     */
    build(): GeminiClient;
    /**
     * Build a client from environment variables.
     */
    static fromEnv(): GeminiClient;
}
//# sourceMappingURL=builder.d.ts.map
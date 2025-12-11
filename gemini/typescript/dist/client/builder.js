/**
 * Builder for creating Gemini client instances.
 */
import { GeminiClientImpl } from './client.js';
/**
 * Builder for creating Gemini client instances with fluent API.
 */
export class GeminiClientBuilder {
    config = {};
    /**
     * Set the API key.
     */
    withApiKey(apiKey) {
        this.config.apiKey = apiKey;
        return this;
    }
    /**
     * Set the base URL.
     */
    withBaseUrl(baseUrl) {
        this.config.baseUrl = baseUrl;
        return this;
    }
    /**
     * Set the API version.
     */
    withApiVersion(apiVersion) {
        this.config.apiVersion = apiVersion;
        return this;
    }
    /**
     * Set the authentication method.
     */
    withAuthMethod(authMethod) {
        this.config.authMethod = authMethod;
        return this;
    }
    /**
     * Set the request timeout.
     */
    withTimeout(timeout) {
        this.config.timeout = timeout;
        return this;
    }
    /**
     * Build the client.
     */
    build() {
        if (!this.config.apiKey) {
            throw new Error('API key is required. Use withApiKey() to set it.');
        }
        return new GeminiClientImpl(this.config);
    }
    /**
     * Build a client from environment variables.
     */
    static fromEnv() {
        const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
        if (!apiKey) {
            throw new Error('Missing API key. Set GEMINI_API_KEY or GOOGLE_API_KEY environment variable.');
        }
        const builder = new GeminiClientBuilder().withApiKey(apiKey);
        if (process.env.GEMINI_BASE_URL) {
            builder.withBaseUrl(process.env.GEMINI_BASE_URL);
        }
        if (process.env.GEMINI_API_VERSION) {
            builder.withApiVersion(process.env.GEMINI_API_VERSION);
        }
        return builder.build();
    }
}
//# sourceMappingURL=builder.js.map
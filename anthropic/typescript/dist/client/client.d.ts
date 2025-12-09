import type { AnthropicConfig } from '../config/config.js';
import type { HttpTransport } from '../transport/http-transport.js';
import type { AuthManager } from '../auth/auth-manager.js';
/**
 * Interface for the Messages API
 */
export interface MessagesAPI {
    create: (params: any) => Promise<any>;
    stream: (params: any) => AsyncGenerator<any, void, unknown>;
}
/**
 * Interface for the Models API
 */
export interface ModelsAPI {
    list: () => Promise<any>;
    get: (modelId: string) => Promise<any>;
}
/**
 * Interface for the Batches API
 */
export interface BatchesAPI {
    create: (params: any) => Promise<any>;
    retrieve: (batchId: string) => Promise<any>;
    list: (params?: any) => Promise<any>;
    cancel: (batchId: string) => Promise<any>;
}
/**
 * Main Anthropic API client interface
 */
export interface AnthropicClient {
    /**
     * Messages API for creating and streaming conversations
     */
    readonly messages: MessagesAPI;
    /**
     * Models API for listing and retrieving model information
     */
    readonly models: ModelsAPI;
    /**
     * Batches API for managing batch requests
     */
    readonly batches: BatchesAPI;
    /**
     * Gets the current configuration
     */
    getConfig(): Readonly<Required<AnthropicConfig>>;
    /**
     * Gets the HTTP transport instance
     */
    getTransport(): HttpTransport;
    /**
     * Gets the auth manager instance
     */
    getAuthManager(): AuthManager;
}
/**
 * Implementation of the Anthropic API client
 */
export declare class AnthropicClientImpl implements AnthropicClient {
    private readonly config;
    private readonly transport;
    private readonly authManager;
    constructor(config: AnthropicConfig);
    /**
     * Messages API - placeholder implementation
     */
    readonly messages: MessagesAPI;
    /**
     * Models API - placeholder implementation
     */
    readonly models: ModelsAPI;
    /**
     * Batches API - placeholder implementation
     */
    readonly batches: BatchesAPI;
    getConfig(): Readonly<Required<AnthropicConfig>>;
    getTransport(): HttpTransport;
    getAuthManager(): AuthManager;
}
/**
 * Creates a new Anthropic API client with the provided configuration
 */
export declare function createClient(config: AnthropicConfig): AnthropicClient;
/**
 * Creates a new Anthropic API client using environment variables
 *
 * Expected environment variables:
 * - ANTHROPIC_API_KEY (required)
 * - ANTHROPIC_BASE_URL (optional)
 * - ANTHROPIC_API_VERSION (optional)
 */
export declare function createClientFromEnv(overrides?: Partial<AnthropicConfig>): AnthropicClient;
//# sourceMappingURL=client.d.ts.map
import type { AnthropicConfig } from '../config/config.js';
import { validateConfig } from '../config/config.js';
import { createAuthManager } from '../auth/auth-manager.js';
import { createHttpTransport } from '../transport/http-transport.js';
import type { HttpTransport } from '../transport/http-transport.js';
import type { AuthManager } from '../auth/auth-manager.js';
import { ConfigurationError } from '../errors/categories.js';

/**
 * Interface for the Messages API
 */
export interface MessagesAPI {
  // Placeholder - will be implemented in messages module
  create: (params: any) => Promise<any>;
  stream: (params: any) => AsyncGenerator<any, void, unknown>;
}

/**
 * Interface for the Models API
 */
export interface ModelsAPI {
  // Placeholder - will be implemented in models module
  list: () => Promise<any>;
  get: (modelId: string) => Promise<any>;
}

/**
 * Interface for the Batches API
 */
export interface BatchesAPI {
  // Placeholder - will be implemented in batches module
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
export class AnthropicClientImpl implements AnthropicClient {
  private readonly config: Required<AnthropicConfig>;
  private readonly transport: HttpTransport;
  private readonly authManager: AuthManager;

  constructor(config: AnthropicConfig) {
    this.config = validateConfig(config);

    this.authManager = createAuthManager({
      apiKey: this.config.apiKey,
      apiVersion: this.config.apiVersion,
      betaFeatures: this.config.betaFeatures,
      customHeaders: this.config.headers,
    });

    this.transport = createHttpTransport(
      this.config.baseUrl,
      this.authManager.getHeaders(),
      this.config.timeout,
      this.config.fetch
    );
  }

  /**
   * Messages API - placeholder implementation
   */
  readonly messages: MessagesAPI = {
    create: async (params: any) => {
      throw new Error('Messages API not yet implemented');
    },
    stream: async function* (params: any) {
      throw new Error('Messages streaming not yet implemented');
    },
  };

  /**
   * Models API - placeholder implementation
   */
  readonly models: ModelsAPI = {
    list: async () => {
      throw new Error('Models API not yet implemented');
    },
    get: async (modelId: string) => {
      throw new Error('Models API not yet implemented');
    },
  };

  /**
   * Batches API - placeholder implementation
   */
  readonly batches: BatchesAPI = {
    create: async (params: any) => {
      throw new Error('Batches API not yet implemented');
    },
    retrieve: async (batchId: string) => {
      throw new Error('Batches API not yet implemented');
    },
    list: async (params?: any) => {
      throw new Error('Batches API not yet implemented');
    },
    cancel: async (batchId: string) => {
      throw new Error('Batches API not yet implemented');
    },
  };

  getConfig(): Readonly<Required<AnthropicConfig>> {
    return Object.freeze({ ...this.config });
  }

  getTransport(): HttpTransport {
    return this.transport;
  }

  getAuthManager(): AuthManager {
    return this.authManager;
  }
}

/**
 * Creates a new Anthropic API client with the provided configuration
 */
export function createClient(config: AnthropicConfig): AnthropicClient {
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
export function createClientFromEnv(overrides?: Partial<AnthropicConfig>): AnthropicClient {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new ConfigurationError(
      'ANTHROPIC_API_KEY environment variable is not set. ' +
      'Please set it or provide an apiKey in the config.'
    );
  }

  const config: AnthropicConfig = {
    apiKey,
    baseUrl: process.env.ANTHROPIC_BASE_URL,
    apiVersion: process.env.ANTHROPIC_API_VERSION,
    ...overrides,
  };

  return createClient(config);
}

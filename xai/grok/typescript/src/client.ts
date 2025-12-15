/**
 * Grok Client
 *
 * Main entry point for xAI Grok API integration.
 *
 * @module client
 */

import type { GrokConfig } from './config.js';
import { GrokConfigBuilder, configFromEnv } from './config.js';
import { ApiKeyCredentialProvider } from './auth/api-key.js';
import type { CredentialProvider } from './auth/provider.js';
import { ChatService } from './services/chat/service.js';
import { EmbeddingService } from './services/embedding/service.js';
import { ImageService } from './services/image/service.js';
import { ModelRegistry, getModelRegistry } from './models/registry.js';
import type { GrokModel } from './models/types.js';

/**
 * Grok client for xAI API.
 *
 * Provides lazy-loaded access to chat, embedding, and image services.
 *
 * @example
 * ```typescript
 * // Create from environment
 * const client = GrokClient.fromEnv();
 *
 * // Chat completion
 * const response = await client.chat.complete({
 *   model: 'grok-3-beta',
 *   messages: [{ role: 'user', content: 'Hello!' }]
 * });
 *
 * // Streaming
 * for await (const chunk of client.chat.stream(request)) {
 *   console.log(chunk.choices[0].delta.content);
 * }
 * ```
 */
export class GrokClient {
  private readonly _config: GrokConfig;
  private readonly _credentialProvider: CredentialProvider;

  // Lazy-loaded services
  private _chatService?: ChatService;
  private _embeddingService?: EmbeddingService;
  private _imageService?: ImageService;
  private _modelRegistry?: ModelRegistry;

  /**
   * Create a new Grok client.
   *
   * @param config - Grok configuration
   * @param credentialProvider - Optional credential provider (defaults to API key)
   */
  constructor(
    config: GrokConfig,
    credentialProvider?: CredentialProvider
  ) {
    this._config = config;
    this._credentialProvider =
      credentialProvider ?? new ApiKeyCredentialProvider(config.apiKey);
  }

  /**
   * Get the client configuration.
   *
   * @returns Grok configuration
   */
  get config(): GrokConfig {
    return this._config;
  }

  /**
   * Chat service for completions and streaming.
   *
   * Lazy-loaded on first access.
   */
  get chat(): ChatService {
    if (!this._chatService) {
      this._chatService = new ChatService(this._config, this._credentialProvider);
    }
    return this._chatService;
  }

  /**
   * Embedding service for text embeddings.
   *
   * Lazy-loaded on first access.
   */
  get embeddings(): EmbeddingService {
    if (!this._embeddingService) {
      this._embeddingService = new EmbeddingService(
        this._config,
        this._credentialProvider
      );
    }
    return this._embeddingService;
  }

  /**
   * Image service for image generation.
   *
   * Lazy-loaded on first access.
   */
  get images(): ImageService {
    if (!this._imageService) {
      this._imageService = new ImageService(
        this._config,
        this._credentialProvider
      );
    }
    return this._imageService;
  }

  /**
   * Model registry for model information.
   *
   * Lazy-loaded on first access.
   */
  get models(): ModelRegistry {
    if (!this._modelRegistry) {
      this._modelRegistry = getModelRegistry();
    }
    return this._modelRegistry;
  }

  /**
   * Create a client builder.
   *
   * @returns New client builder
   */
  static builder(): GrokClientBuilder {
    return new GrokClientBuilder();
  }

  /**
   * Create a client from environment variables.
   *
   * @returns New Grok client
   */
  static fromEnv(): GrokClient {
    const config = configFromEnv();
    return new GrokClient(config);
  }
}

/**
 * Grok client builder.
 */
export class GrokClientBuilder {
  private configBuilder: GrokConfigBuilder;
  private credentialProvider?: CredentialProvider;

  constructor() {
    this.configBuilder = new GrokConfigBuilder();
  }

  /**
   * Set the API key.
   *
   * @param apiKey - xAI API key
   * @returns This builder
   */
  apiKey(apiKey: string): this {
    this.configBuilder.apiKey(apiKey);
    return this;
  }

  /**
   * Set the base URL.
   *
   * @param baseUrl - Base URL
   * @returns This builder
   */
  baseUrl(baseUrl: string): this {
    this.configBuilder.baseUrl(baseUrl);
    return this;
  }

  /**
   * Set the default model.
   *
   * @param model - Default model
   * @returns This builder
   */
  defaultModel(model: GrokModel): this {
    this.configBuilder.defaultModel(model);
    return this;
  }

  /**
   * Set the request timeout.
   *
   * @param ms - Timeout in milliseconds
   * @returns This builder
   */
  timeout(ms: number): this {
    this.configBuilder.timeout(ms);
    return this;
  }

  /**
   * Set maximum retry attempts.
   *
   * @param n - Maximum retries
   * @returns This builder
   */
  maxRetries(n: number): this {
    this.configBuilder.maxRetries(n);
    return this;
  }

  /**
   * Set a custom credential provider.
   *
   * @param provider - Credential provider
   * @returns This builder
   */
  credentials(provider: CredentialProvider): this {
    this.credentialProvider = provider;
    return this;
  }

  /**
   * Load configuration from environment variables.
   *
   * @returns This builder
   */
  fromEnv(): this {
    this.configBuilder.fromEnv();
    return this;
  }

  /**
   * Build the Grok client.
   *
   * @returns New Grok client
   */
  build(): GrokClient {
    const config = this.configBuilder.build();
    return new GrokClient(config, this.credentialProvider);
  }
}

/**
 * Create a new Grok client builder.
 *
 * @returns New client builder
 */
export function clientBuilder(): GrokClientBuilder {
  return new GrokClientBuilder();
}

/**
 * Create a Grok client from environment variables.
 *
 * @returns New Grok client
 */
export function createClientFromEnv(): GrokClient {
  return GrokClient.fromEnv();
}

/**
 * Create a Grok client with configuration.
 *
 * @param config - Grok configuration
 * @param credentialProvider - Optional credential provider
 * @returns New Grok client
 */
export function createClient(
  config: GrokConfig,
  credentialProvider?: CredentialProvider
): GrokClient {
  return new GrokClient(config, credentialProvider);
}

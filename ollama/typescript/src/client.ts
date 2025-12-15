/**
 * Ollama Client Implementation
 *
 * Main client for interacting with Ollama local inference server.
 * Based on SPARC specification for Ollama integration.
 */

import type { OllamaConfig } from './config/types.js';
import type { HealthStatus } from './types/health.js';
import { HttpTransportImpl } from './transport/http.js';
import { SimulationLayer } from './simulation/layer.js';
import { ChatService } from './services/chat/service.js';
import { GenerateService } from './services/generate/service.js';
import { EmbeddingsService } from './services/embeddings/service.js';
import { ModelsService } from './services/models/service.js';

/**
 * Main Ollama client class
 *
 * Provides lazy-loaded access to chat, generate, embeddings, and model services.
 * Supports both local and remote Ollama servers with optional authentication.
 *
 * @example
 * ```typescript
 * import { OllamaClientBuilder } from '@llm-devops/ollama';
 *
 * // Create client with defaults (localhost:11434)
 * const client = new OllamaClientBuilder().build();
 *
 * // Chat completion
 * const response = await client.chat.create({
 *   model: 'llama3.2',
 *   messages: [{ role: 'user', content: 'Hello!' }]
 * });
 *
 * // Streaming
 * for await (const chunk of client.chat.createStream(request)) {
 *   console.log(chunk.message.content);
 * }
 * ```
 */
export class OllamaClient {
  private readonly _config: OllamaConfig;
  private readonly transport: HttpTransportImpl;
  private readonly simulation: SimulationLayer;

  // Lazy-initialized services
  private _chatService?: ChatService;
  private _generateService?: GenerateService;
  private _embeddingsService?: EmbeddingsService;
  private _modelsService?: ModelsService;

  constructor(config: OllamaConfig) {
    this._config = config;

    // Initialize transport layer
    this.transport = new HttpTransportImpl(config);

    // Initialize simulation layer
    this.simulation = new SimulationLayer(config.simulationMode, this.transport);
  }

  /**
   * Get the client configuration
   */
  get config(): Readonly<OllamaConfig> {
    return this._config;
  }

  /**
   * Chat service for multi-turn conversations
   *
   * Supports both synchronous and streaming chat completions.
   * Lazy-loaded on first access.
   */
  get chat(): ChatService {
    if (!this._chatService) {
      this._chatService = new ChatService({
        config: this._config,
        simulation: this.simulation,
      });
    }
    return this._chatService;
  }

  /**
   * Generate service for text completion
   *
   * Supports context continuation, raw mode, and custom templates.
   * Lazy-loaded on first access.
   */
  get generate(): GenerateService {
    if (!this._generateService) {
      this._generateService = new GenerateService({
        config: this._config,
        fetch: globalThis.fetch.bind(globalThis),
      });
    }
    return this._generateService;
  }

  /**
   * Embeddings service for vector generation
   *
   * Supports single and batch embedding operations.
   * Lazy-loaded on first access.
   */
  get embeddings(): EmbeddingsService {
    if (!this._embeddingsService) {
      this._embeddingsService = new EmbeddingsService({
        config: this._config,
        simulation: this.simulation,
      });
    }
    return this._embeddingsService;
  }

  /**
   * Models service for model management
   *
   * List, show, and manage local models.
   * Lazy-loaded on first access.
   */
  get models(): ModelsService {
    if (!this._modelsService) {
      this._modelsService = new ModelsService({
        config: this._config,
        simulation: this.simulation,
      });
    }
    return this._modelsService;
  }

  /**
   * Check if Ollama server is running and reachable
   *
   * @returns Health status with running state and version
   */
  async health(): Promise<HealthStatus> {
    try {
      const reachable = await this.transport.isReachable();
      return {
        running: reachable,
        version: undefined, // Could be extracted from response headers
      };
    } catch {
      return {
        running: false,
      };
    }
  }

  /**
   * Create a client from environment variables
   *
   * Reads OLLAMA_HOST and OLLAMA_MODEL from environment.
   */
  static fromEnv(): OllamaClient {
    const { OllamaClientBuilder } = require('./config/builder.js') as {
      OllamaClientBuilder: new () => { baseUrlFromEnv: () => any; defaultModelFromEnv: () => any; build: () => OllamaClient };
    };

    return new OllamaClientBuilder()
      .baseUrlFromEnv()
      .defaultModelFromEnv()
      .build();
  }
}

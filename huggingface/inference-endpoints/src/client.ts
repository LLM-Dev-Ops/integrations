/**
 * HuggingFace Inference Client
 * Main client with lazy service initialization as specified in SPARC documentation
 */

import {
  HfInferenceConfig,
  defaultHfInferenceConfig,
  InferenceProvider,
} from './types/index.js';
import { createConfigurationError } from './types/errors.js';
import { ProviderResolver } from './providers/provider-resolver.js';
import { ColdStartHandler } from './utils/cold-start-handler.js';
import { ChatService } from './services/chat.js';
import { TextGenerationService } from './services/text-generation.js';
import { EmbeddingService } from './services/embedding.js';
import { EndpointManagementService } from './endpoints/service.js';

export interface HfInferenceClientOptions {
  /** HF API token */
  token?: string;
  /** Full configuration (overrides individual options) */
  config?: Partial<HfInferenceConfig>;
}

export interface HealthStatus {
  healthy: boolean;
  apiReachable: boolean;
  tokenValid: boolean;
  providerHealthy: boolean;
  checkedAt: Date;
}

/**
 * HuggingFace Inference Client
 * Main entry point for all HF Inference API operations
 */
export class HfInferenceClient {
  private config: HfInferenceConfig;
  private providerResolver: ProviderResolver;
  private coldStartHandler: ColdStartHandler;

  // Lazy-initialized services
  private _chatService?: ChatService;
  private _textGenerationService?: TextGenerationService;
  private _embeddingService?: EmbeddingService;
  private _endpointService?: EndpointManagementService;

  constructor(options?: HfInferenceClientOptions) {
    // Merge configuration
    this.config = {
      ...defaultHfInferenceConfig,
      ...options?.config,
    };

    // Token from options takes precedence
    if (options?.token) {
      this.config.token = options.token;
    }

    // Try environment variable if no token provided
    if (!this.config.token && typeof process !== 'undefined') {
      this.config.token = process.env.HF_TOKEN || '';
    }

    // Validate token
    if (!this.config.token) {
      throw createConfigurationError(
        'HF_TOKEN is required. Provide it via options.token or HF_TOKEN environment variable.'
      );
    }

    // Initialize shared components
    this.providerResolver = new ProviderResolver(this.config);
    this.coldStartHandler = new ColdStartHandler({
      timeout: this.config.coldStartTimeout,
      initialDelay: this.config.retryBaseDelay,
      maxDelay: this.config.retryMaxDelay,
    });
  }

  /**
   * Create client from environment variables
   */
  static fromEnv(overrides?: Partial<HfInferenceConfig>): HfInferenceClient {
    const token = process.env.HF_TOKEN;
    if (!token) {
      throw createConfigurationError('HF_TOKEN environment variable is not set');
    }

    const config: Partial<HfInferenceConfig> = {
      token,
      ...overrides,
    };

    // Parse additional env vars
    if (process.env.HF_DEFAULT_PROVIDER) {
      config.defaultProvider = process.env.HF_DEFAULT_PROVIDER as InferenceProvider;
    }

    if (process.env.HF_DEFAULT_NAMESPACE) {
      config.defaultNamespace = process.env.HF_DEFAULT_NAMESPACE;
    }

    if (process.env.HF_COLD_START_TIMEOUT) {
      config.coldStartTimeout = parseInt(process.env.HF_COLD_START_TIMEOUT, 10) * 1000;
    }

    if (process.env.HF_REQUEST_TIMEOUT) {
      config.requestTimeout = parseInt(process.env.HF_REQUEST_TIMEOUT, 10) * 1000;
    }

    return new HfInferenceClient({ config });
  }

  /**
   * Get chat service
   */
  chat(): ChatService {
    if (!this._chatService) {
      this._chatService = new ChatService({
        config: this.config,
        providerResolver: this.providerResolver,
        coldStartHandler: this.coldStartHandler,
      });
    }
    return this._chatService;
  }

  /**
   * Get text generation service
   */
  textGeneration(): TextGenerationService {
    if (!this._textGenerationService) {
      this._textGenerationService = new TextGenerationService({
        config: this.config,
        providerResolver: this.providerResolver,
        coldStartHandler: this.coldStartHandler,
      });
    }
    return this._textGenerationService;
  }

  /**
   * Get embedding service
   */
  embedding(): EmbeddingService {
    if (!this._embeddingService) {
      this._embeddingService = new EmbeddingService({
        config: this.config,
        providerResolver: this.providerResolver,
        coldStartHandler: this.coldStartHandler,
      });
    }
    return this._embeddingService;
  }

  /**
   * Get endpoint management service
   */
  endpoints(): EndpointManagementService {
    if (!this._endpointService) {
      this._endpointService = new EndpointManagementService({
        config: this.config,
      });
    }
    return this._endpointService;
  }

  /**
   * Perform a lightweight health check
   */
  async healthCheck(): Promise<HealthStatus> {
    const checkedAt = new Date();

    // Check 1: Can reach HF API
    let apiReachable = false;
    try {
      apiReachable = await this.pingApi();
    } catch {
      // API not reachable
    }

    // Check 2: Token is valid
    let tokenValid = false;
    try {
      tokenValid = await this.validateToken();
    } catch {
      // Token not valid
    }

    // Check 3: At least one provider is healthy
    let providerHealthy = false;
    try {
      providerHealthy = await this.checkProviders();
    } catch {
      // Provider not healthy
    }

    return {
      healthy: apiReachable && tokenValid && providerHealthy,
      apiReachable,
      tokenValid,
      providerHealthy,
      checkedAt,
    };
  }

  /**
   * Ping HF API to check connectivity
   */
  private async pingApi(): Promise<boolean> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch('https://huggingface.co/api/health', {
        method: 'GET',
        signal: controller.signal,
      });
      return response.ok;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Validate token using whoami endpoint
   */
  private async validateToken(): Promise<boolean> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch('https://huggingface.co/api/whoami-v2', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.token}`,
        },
        signal: controller.signal,
      });
      return response.ok;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Check if at least one provider is healthy
   */
  private async checkProviders(): Promise<boolean> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      // Try a minimal inference request to serverless
      const response = await fetch(
        'https://api-inference.huggingface.co/models/sentence-transformers/all-MiniLM-L6-v2',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.config.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ inputs: 'test' }),
          signal: controller.signal,
        }
      );

      // 503 (loading) is acceptable - means provider is working
      return response.ok || response.status === 503;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Clear all caches
   */
  clearCaches(): void {
    this.providerResolver.clearCache();
    this._embeddingService?.clearCache();
    this._endpointService?.clearCache();
  }

  /**
   * Get current configuration (read-only)
   */
  getConfig(): Readonly<HfInferenceConfig> {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<HfInferenceConfig>): void {
    Object.assign(this.config, updates);

    // Recreate components if token changed
    if (updates.token) {
      this.providerResolver = new ProviderResolver(this.config);
      this._chatService = undefined;
      this._textGenerationService = undefined;
      this._embeddingService = undefined;
      this._endpointService = undefined;
    }

    // Update cold start handler if timeouts changed
    if (updates.coldStartTimeout || updates.retryBaseDelay || updates.retryMaxDelay) {
      this.coldStartHandler = new ColdStartHandler({
        timeout: this.config.coldStartTimeout,
        initialDelay: this.config.retryBaseDelay,
        maxDelay: this.config.retryMaxDelay,
      });
    }
  }

  /**
   * Get supported providers
   */
  getSupportedProviders(): InferenceProvider[] {
    return this.providerResolver.getSupportedProviders();
  }
}

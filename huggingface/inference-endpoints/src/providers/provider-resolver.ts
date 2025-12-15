/**
 * Provider Resolver
 * Routes requests to serverless, dedicated, or third-party providers
 * as specified in SPARC documentation
 */

import {
  InferenceProvider,
  InferenceTarget,
  PROVIDER_URLS,
  HfInferenceConfig,
} from '../types/index.js';
import { createConfigurationError } from '../types/errors.js';

export interface ResolvedEndpoint {
  baseUrl: string;
  chatPath: string;
  embeddingsPath?: string;
  headers: Record<string, string>;
  model: string;
  provider: InferenceProvider;
}

/**
 * Provider Resolver class
 * Resolves inference targets to concrete API endpoints
 */
export class ProviderResolver {
  private config: HfInferenceConfig;
  private endpointCache: Map<string, { url: string; expiresAt: number }> = new Map();

  constructor(config: HfInferenceConfig) {
    this.config = config;
  }

  /**
   * Resolve an inference target to a concrete endpoint
   */
  resolve(target: InferenceTarget): ResolvedEndpoint {
    const provider = target.provider || this.config.defaultProvider;

    switch (provider) {
      case InferenceProvider.Serverless:
        return this.resolveServerless(target);
      case InferenceProvider.Dedicated:
        return this.resolveDedicated(target);
      default:
        return this.resolveThirdParty(target, provider);
    }
  }

  /**
   * Resolve serverless HF Inference API endpoint
   */
  private resolveServerless(target: InferenceTarget): ResolvedEndpoint {
    const providerUrl = PROVIDER_URLS[InferenceProvider.Serverless];

    return {
      baseUrl: providerUrl.baseUrl,
      chatPath: providerUrl.chatPath,
      embeddingsPath: providerUrl.embeddingsPath,
      headers: this.createHeaders(InferenceProvider.Serverless),
      model: target.model,
      provider: InferenceProvider.Serverless,
    };
  }

  /**
   * Resolve dedicated endpoint URL
   */
  private resolveDedicated(target: InferenceTarget): ResolvedEndpoint {
    if (!target.endpointName) {
      throw createConfigurationError(
        'Endpoint name is required for dedicated endpoints'
      );
    }

    const namespace = target.namespace || this.config.defaultNamespace;
    if (!namespace) {
      throw createConfigurationError(
        'Namespace is required for dedicated endpoints'
      );
    }

    // Check cache first
    const cacheKey = `${namespace}/${target.endpointName}`;
    const cached = this.endpointCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return {
        baseUrl: cached.url,
        chatPath: '/v1/chat/completions',
        embeddingsPath: '/pipeline/feature-extraction',
        headers: this.createHeaders(InferenceProvider.Dedicated),
        model: target.model,
        provider: InferenceProvider.Dedicated,
      };
    }

    // Construct dedicated endpoint URL
    const baseUrl = `https://${namespace}-${target.endpointName}.hf.space`;

    // Cache the URL
    this.endpointCache.set(cacheKey, {
      url: baseUrl,
      expiresAt: Date.now() + this.config.endpointCacheTtl,
    });

    return {
      baseUrl,
      chatPath: '/v1/chat/completions',
      embeddingsPath: '/pipeline/feature-extraction',
      headers: this.createHeaders(InferenceProvider.Dedicated),
      model: target.model,
      provider: InferenceProvider.Dedicated,
    };
  }

  /**
   * Resolve third-party provider endpoint
   */
  private resolveThirdParty(
    target: InferenceTarget,
    provider: InferenceProvider
  ): ResolvedEndpoint {
    const providerUrl = PROVIDER_URLS[provider];
    if (!providerUrl) {
      throw createConfigurationError(`Unknown provider: ${provider}`);
    }

    return {
      baseUrl: providerUrl.baseUrl,
      chatPath: providerUrl.chatPath,
      embeddingsPath: providerUrl.embeddingsPath,
      headers: this.createHeaders(provider),
      model: this.mapModelToProvider(target.model, provider),
      provider,
    };
  }

  /**
   * Create authorization headers for a provider
   */
  private createHeaders(provider: InferenceProvider): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    switch (provider) {
      case InferenceProvider.Serverless:
      case InferenceProvider.Dedicated:
        headers['Authorization'] = `Bearer ${this.config.token}`;
        break;
      case InferenceProvider.Together:
      case InferenceProvider.Groq:
      case InferenceProvider.Fireworks:
      case InferenceProvider.Replicate:
      case InferenceProvider.Cerebras:
      case InferenceProvider.Sambanova:
      case InferenceProvider.Nebius:
        // Third-party providers use HF token routing
        headers['Authorization'] = `Bearer ${this.config.token}`;
        headers['X-Use-HF-Routing'] = 'true';
        break;
    }

    return headers;
  }

  /**
   * Map model names to provider-specific formats
   */
  private mapModelToProvider(model: string, provider: InferenceProvider): string {
    // Most providers use the same model names
    // Add specific mappings as needed
    const mappings: Partial<Record<InferenceProvider, Record<string, string>>> = {
      [InferenceProvider.Together]: {
        'meta-llama/Llama-3.2-3B-Instruct': 'meta-llama/Llama-3.2-3B-Instruct-Turbo',
        'meta-llama/Llama-3.1-8B-Instruct': 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
      },
      [InferenceProvider.Groq]: {
        'meta-llama/Llama-3.2-3B-Instruct': 'llama-3.2-3b-preview',
        'meta-llama/Llama-3.1-8B-Instruct': 'llama-3.1-8b-instant',
      },
    };

    const providerMappings = mappings[provider];
    if (providerMappings && providerMappings[model]) {
      return providerMappings[model];
    }

    return model;
  }

  /**
   * Set a cached endpoint URL (used after fetching endpoint info)
   */
  setCachedEndpointUrl(namespace: string, endpointName: string, url: string): void {
    const cacheKey = `${namespace}/${endpointName}`;
    this.endpointCache.set(cacheKey, {
      url,
      expiresAt: Date.now() + this.config.endpointCacheTtl,
    });
  }

  /**
   * Clear endpoint cache
   */
  clearCache(): void {
    this.endpointCache.clear();
  }

  /**
   * Get the list of supported providers
   */
  getSupportedProviders(): InferenceProvider[] {
    return Object.values(InferenceProvider);
  }

  /**
   * Check if a provider supports a specific capability
   */
  supportsCapability(
    provider: InferenceProvider,
    capability: 'chat' | 'embeddings' | 'text-generation'
  ): boolean {
    const providerUrl = PROVIDER_URLS[provider];

    switch (capability) {
      case 'chat':
        return !!providerUrl?.chatPath;
      case 'embeddings':
        return !!providerUrl?.embeddingsPath;
      case 'text-generation':
        return provider === InferenceProvider.Serverless ||
               provider === InferenceProvider.Dedicated;
      default:
        return false;
    }
  }
}

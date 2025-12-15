/**
 * Embedding Service
 * Implements vector embeddings with batching as specified in SPARC documentation
 */

import {
  EmbeddingRequest,
  EmbeddingResponse,
  HfInferenceConfig,
  InferenceProvider,
  InferenceTarget,
} from '../types/index.js';
import { parseHttpError, createValidationError } from '../types/errors.js';
import { ProviderResolver, ResolvedEndpoint } from '../providers/provider-resolver.js';
import { withRetry } from '../utils/retry.js';
import { ColdStartHandler, createWaitForModelHeaders } from '../utils/cold-start-handler.js';

export interface EmbeddingServiceOptions {
  config: HfInferenceConfig;
  providerResolver: ProviderResolver;
  coldStartHandler: ColdStartHandler;
}

interface CacheEntry {
  embedding: number[];
  timestamp: number;
}

/**
 * Embedding Service class
 * Provides vector embeddings with batching and caching
 */
export class EmbeddingService {
  private config: HfInferenceConfig;
  private providerResolver: ProviderResolver;
  private coldStartHandler: ColdStartHandler;
  private cache: Map<string, CacheEntry> = new Map();
  private cacheSize: number = 0;

  constructor(options: EmbeddingServiceOptions) {
    this.config = options.config;
    this.providerResolver = options.providerResolver;
    this.coldStartHandler = options.coldStartHandler;
  }

  /**
   * Create embeddings for one or more inputs
   */
  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    this.validateRequest(request);

    const inputs = Array.isArray(request.inputs)
      ? request.inputs
      : [request.inputs];

    // Check cache first
    if (this.config.enableEmbeddingCache) {
      const { cached, missing } = this.checkCache(request.model, inputs);

      if (missing.length === 0) {
        // All embeddings found in cache
        return {
          model: request.model,
          embeddings: inputs.map((input) => cached.get(input)!),
        };
      }

      if (missing.length < inputs.length) {
        // Some embeddings found in cache, fetch missing ones
        const missingResponse = await this.fetchEmbeddings(
          request,
          missing
        );

        // Cache new embeddings
        for (let i = 0; i < missing.length; i++) {
          this.addToCache(request.model, missing[i], missingResponse.embeddings[i]);
        }

        // Reconstruct full response with cached + new embeddings
        const allEmbeddings = inputs.map((input) => {
          const cachedEmb = cached.get(input);
          if (cachedEmb) {
            return cachedEmb;
          }
          const idx = missing.indexOf(input);
          return missingResponse.embeddings[idx];
        });

        return {
          model: request.model,
          embeddings: allEmbeddings,
          usage: missingResponse.usage,
        };
      }
    }

    // Fetch all embeddings
    const response = await this.fetchEmbeddings(request, inputs);

    // Cache embeddings
    if (this.config.enableEmbeddingCache) {
      for (let i = 0; i < inputs.length; i++) {
        this.addToCache(request.model, inputs[i], response.embeddings[i]);
      }
    }

    return response;
  }

  /**
   * Create embedding for a single input
   */
  async embedSingle(
    model: string,
    input: string,
    options?: { normalize?: boolean; truncate?: boolean }
  ): Promise<number[]> {
    const response = await this.embed({
      model,
      inputs: input,
      normalize: options?.normalize,
      truncate: options?.truncate,
    });

    return response.embeddings[0];
  }

  /**
   * Create embeddings in batches
   */
  async embedBatch(
    model: string,
    inputs: string[],
    options?: {
      batchSize?: number;
      normalize?: boolean;
      truncate?: boolean;
      onProgress?: (completed: number, total: number) => void;
    }
  ): Promise<EmbeddingResponse> {
    const batchSize = options?.batchSize || 32;
    const allEmbeddings: number[][] = [];
    let totalPromptTokens = 0;
    let totalTokens = 0;

    for (let i = 0; i < inputs.length; i += batchSize) {
      const batch = inputs.slice(i, i + batchSize);

      const response = await this.embed({
        model,
        inputs: batch,
        normalize: options?.normalize,
        truncate: options?.truncate,
      });

      allEmbeddings.push(...response.embeddings);

      if (response.usage) {
        totalPromptTokens += response.usage.promptTokens;
        totalTokens += response.usage.totalTokens;
      }

      if (options?.onProgress) {
        options.onProgress(Math.min(i + batchSize, inputs.length), inputs.length);
      }
    }

    return {
      model,
      embeddings: allEmbeddings,
      usage:
        totalTokens > 0
          ? {
              promptTokens: totalPromptTokens,
              totalTokens,
            }
          : undefined,
    };
  }

  /**
   * Validate embedding request
   */
  private validateRequest(request: EmbeddingRequest): void {
    if (!request.model) {
      throw createValidationError('Model is required');
    }

    const inputs = Array.isArray(request.inputs)
      ? request.inputs
      : [request.inputs];

    if (inputs.length === 0) {
      throw createValidationError('At least one input is required');
    }

    for (const input of inputs) {
      if (typeof input !== 'string') {
        throw createValidationError('All inputs must be strings');
      }
    }
  }

  /**
   * Fetch embeddings from the API
   */
  private async fetchEmbeddings(
    request: EmbeddingRequest,
    inputs: string[]
  ): Promise<EmbeddingResponse> {
    const target: InferenceTarget = {
      provider: this.config.defaultProvider,
      model: request.model,
    };

    const endpoint = this.providerResolver.resolve(target);

    const requestFn = async (): Promise<EmbeddingResponse> => {
      const response = await this.makeRequest(endpoint, request, inputs);
      return this.parseResponse(response, request.model);
    };

    if (this.config.autoWaitForModel) {
      return this.coldStartHandler.execute(requestFn, {
        timeout: this.config.coldStartTimeout,
      });
    }

    return withRetry(requestFn, {
      maxRetries: this.config.maxRetries,
      baseDelay: this.config.retryBaseDelay,
      maxDelay: this.config.retryMaxDelay,
    });
  }

  /**
   * Make HTTP request to the endpoint
   */
  private async makeRequest(
    endpoint: ResolvedEndpoint,
    request: EmbeddingRequest,
    inputs: string[]
  ): Promise<Response> {
    // Determine which API format to use based on provider
    let url: string;
    let body: Record<string, unknown>;

    if (
      endpoint.provider === InferenceProvider.Serverless ||
      endpoint.provider === InferenceProvider.Dedicated
    ) {
      // Use HF native feature-extraction endpoint
      url = `${endpoint.baseUrl}/pipeline/feature-extraction/${endpoint.model}`;
      body = {
        inputs: inputs.length === 1 ? inputs[0] : inputs,
        options: {
          wait_for_model: this.config.autoWaitForModel,
        },
      };

      if (request.normalize) {
        body.normalize = request.normalize;
      }

      if (request.truncate) {
        body.truncate = request.truncate;
      }
    } else {
      // Use OpenAI-compatible embeddings endpoint
      url = `${endpoint.baseUrl}${endpoint.embeddingsPath || '/v1/embeddings'}`;
      body = {
        model: endpoint.model,
        input: inputs.length === 1 ? inputs[0] : inputs,
      };
    }

    const headers: Record<string, string> = {
      ...endpoint.headers,
      ...(this.config.autoWaitForModel ? createWaitForModelHeaders(true) : {}),
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.config.requestTimeout
    );

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw await parseHttpError(response);
      }

      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Parse response from the API
   */
  private async parseResponse(
    response: Response,
    model: string
  ): Promise<EmbeddingResponse> {
    const data = await response.json();

    // Handle HF native format (array of arrays)
    if (Array.isArray(data)) {
      // Single embedding returns nested array, batch returns array of nested arrays
      const embeddings = Array.isArray(data[0]) && !Array.isArray(data[0][0])
        ? [data] as number[][]  // Single embedding wrapped
        : data.map((emb: any) => {
            // Flatten if nested (sentence-transformers format)
            if (Array.isArray(emb) && Array.isArray(emb[0])) {
              return emb[0];
            }
            return emb;
          });

      return {
        model,
        embeddings,
      };
    }

    // Handle OpenAI-compatible format
    if (data.data) {
      const embeddings = data.data
        .sort((a: any, b: any) => a.index - b.index)
        .map((item: any) => item.embedding);

      return {
        model,
        embeddings,
        usage: data.usage
          ? {
              promptTokens: data.usage.prompt_tokens,
              totalTokens: data.usage.total_tokens,
            }
          : undefined,
      };
    }

    throw createValidationError('Unexpected embedding response format');
  }

  /**
   * Check cache for existing embeddings
   */
  private checkCache(
    model: string,
    inputs: string[]
  ): { cached: Map<string, number[]>; missing: string[] } {
    const cached = new Map<string, number[]>();
    const missing: string[] = [];
    const now = Date.now();

    for (const input of inputs) {
      const key = this.getCacheKey(model, input);
      const entry = this.cache.get(key);

      if (entry && now - entry.timestamp < this.config.embeddingCacheTtl) {
        cached.set(input, entry.embedding);
      } else {
        if (entry) {
          // Remove expired entry
          this.cache.delete(key);
          this.cacheSize -= entry.embedding.length * 8; // Approximate size
        }
        missing.push(input);
      }
    }

    return { cached, missing };
  }

  /**
   * Add embedding to cache
   */
  private addToCache(model: string, input: string, embedding: number[]): void {
    const key = this.getCacheKey(model, input);
    const entrySize = embedding.length * 8; // 8 bytes per float64

    // Check if we need to evict entries
    while (
      this.cacheSize + entrySize > this.config.maxEmbeddingCacheSize &&
      this.cache.size > 0
    ) {
      this.evictOldest();
    }

    // Don't add if single entry is too large
    if (entrySize > this.config.maxEmbeddingCacheSize) {
      return;
    }

    this.cache.set(key, {
      embedding,
      timestamp: Date.now(),
    });
    this.cacheSize += entrySize;
  }

  /**
   * Evict oldest cache entry
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      const entry = this.cache.get(oldestKey);
      if (entry) {
        this.cacheSize -= entry.embedding.length * 8;
      }
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Generate cache key for an input
   */
  private getCacheKey(model: string, input: string): string {
    return `${model}:${input}`;
  }

  /**
   * Clear the embedding cache
   */
  clearCache(): void {
    this.cache.clear();
    this.cacheSize = 0;
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { entries: number; sizeBytes: number; maxSizeBytes: number } {
    return {
      entries: this.cache.size,
      sizeBytes: this.cacheSize,
      maxSizeBytes: this.config.maxEmbeddingCacheSize,
    };
  }
}

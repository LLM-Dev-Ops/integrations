/**
 * Cohere client implementation.
 */

import { CohereConfig } from '../config';
import { FetchTransport, type HttpTransport } from '../transport';
import { ResilienceOrchestrator, type RetryConfig, type CircuitBreakerConfig, type RateLimiterConfig } from '../resilience';
import { type ObservabilityContext, createDefaultObservability } from '../observability';

// Services
import { ChatServiceImpl, type ChatService } from '../services/chat';
import { GenerateServiceImpl, type GenerateService } from '../services/generate';
import { EmbedServiceImpl, type EmbedService } from '../services/embed';
import { RerankServiceImpl, type RerankService } from '../services/rerank';
import { ClassifyServiceImpl, type ClassifyService } from '../services/classify';
import { SummarizeServiceImpl, type SummarizeService } from '../services/summarize';
import { TokenizeServiceImpl, type TokenizeService } from '../services/tokenize';
import { ModelsServiceImpl, type ModelsService } from '../services/models';
import { DatasetsServiceImpl, type DatasetsService } from '../services/datasets';
import { ConnectorsServiceImpl, type ConnectorsService } from '../services/connectors';
import { FinetuneServiceImpl, type FinetuneService } from '../services/finetune';

/**
 * Client options
 */
export interface CohereClientOptions {
  /** API key */
  apiKey: string;
  /** Base URL */
  baseUrl?: string;
  /** API version */
  apiVersion?: string;
  /** Request timeout in ms */
  timeout?: number;
  /** Maximum retries */
  maxRetries?: number;
  /** Client name for tracking */
  clientName?: string;
  /** Custom HTTP transport */
  transport?: HttpTransport;
  /** Retry configuration */
  retry?: Partial<RetryConfig>;
  /** Circuit breaker configuration */
  circuitBreaker?: Partial<CircuitBreakerConfig>;
  /** Rate limiter configuration */
  rateLimiter?: Partial<RateLimiterConfig>;
  /** Observability context */
  observability?: ObservabilityContext;
}

/**
 * Cohere client
 */
export class CohereClient {
  private readonly config: CohereConfig;
  private readonly transport: HttpTransport;
  private readonly resilience: ResilienceOrchestrator;
  private readonly observability: ObservabilityContext;

  // Lazy-initialized services
  private _chat?: ChatService;
  private _generate?: GenerateService;
  private _embed?: EmbedService;
  private _rerank?: RerankService;
  private _classify?: ClassifyService;
  private _summarize?: SummarizeService;
  private _tokenize?: TokenizeService;
  private _models?: ModelsService;
  private _datasets?: DatasetsService;
  private _connectors?: ConnectorsService;
  private _finetune?: FinetuneService;

  constructor(options: CohereClientOptions) {
    this.config = CohereConfig.create({
      apiKey: options.apiKey,
      baseUrl: options.baseUrl,
      apiVersion: options.apiVersion,
      timeout: options.timeout,
      maxRetries: options.maxRetries,
      clientName: options.clientName,
    });

    this.transport = options.transport ?? new FetchTransport(this.config);

    this.resilience = new ResilienceOrchestrator({
      retry: options.retry,
      circuitBreaker: options.circuitBreaker,
      rateLimiter: options.rateLimiter,
    });

    this.observability = options.observability ?? createDefaultObservability();
  }

  /**
   * Chat service for conversational AI
   */
  get chat(): ChatService {
    if (!this._chat) {
      this._chat = new ChatServiceImpl(this.transport, this.config);
    }
    return this._chat;
  }

  /**
   * Generate service for text generation
   */
  get generate(): GenerateService {
    if (!this._generate) {
      this._generate = new GenerateServiceImpl(this.transport, this.config);
    }
    return this._generate;
  }

  /**
   * Embed service for text embeddings
   */
  get embed(): EmbedService {
    if (!this._embed) {
      this._embed = new EmbedServiceImpl(this.transport, this.config);
    }
    return this._embed;
  }

  /**
   * Rerank service for document reranking
   */
  get rerank(): RerankService {
    if (!this._rerank) {
      this._rerank = new RerankServiceImpl(this.transport, this.config);
    }
    return this._rerank;
  }

  /**
   * Classify service for text classification
   */
  get classify(): ClassifyService {
    if (!this._classify) {
      this._classify = new ClassifyServiceImpl(this.transport, this.config);
    }
    return this._classify;
  }

  /**
   * Summarize service for text summarization
   */
  get summarize(): SummarizeService {
    if (!this._summarize) {
      this._summarize = new SummarizeServiceImpl(this.transport, this.config);
    }
    return this._summarize;
  }

  /**
   * Tokenize service for tokenization/detokenization
   */
  get tokenize(): TokenizeService {
    if (!this._tokenize) {
      this._tokenize = new TokenizeServiceImpl(this.transport, this.config);
    }
    return this._tokenize;
  }

  /**
   * Models service for listing available models
   */
  get models(): ModelsService {
    if (!this._models) {
      this._models = new ModelsServiceImpl(this.transport, this.config);
    }
    return this._models;
  }

  /**
   * Datasets service for managing datasets
   */
  get datasets(): DatasetsService {
    if (!this._datasets) {
      this._datasets = new DatasetsServiceImpl(this.transport, this.config);
    }
    return this._datasets;
  }

  /**
   * Connectors service for managing connectors
   */
  get connectors(): ConnectorsService {
    if (!this._connectors) {
      this._connectors = new ConnectorsServiceImpl(this.transport, this.config);
    }
    return this._connectors;
  }

  /**
   * Fine-tune service for model fine-tuning
   */
  get finetune(): FinetuneService {
    if (!this._finetune) {
      this._finetune = new FinetuneServiceImpl(this.transport, this.config);
    }
    return this._finetune;
  }

  /**
   * Get the resilience orchestrator
   */
  getResilience(): ResilienceOrchestrator {
    return this.resilience;
  }

  /**
   * Get the observability context
   */
  getObservability(): ObservabilityContext {
    return this.observability;
  }

  /**
   * Get the configuration
   */
  getConfig(): CohereConfig {
    return this.config;
  }
}

/**
 * Create a Cohere client with options
 */
export function createClient(options: CohereClientOptions): CohereClient {
  return new CohereClient(options);
}

/**
 * Create a Cohere client from environment variables
 */
export function createClientFromEnv(
  options?: Omit<CohereClientOptions, 'apiKey'>
): CohereClient {
  const config = CohereConfig.fromEnv();
  return new CohereClient({
    ...options,
    apiKey: config.apiKey,
    baseUrl: options?.baseUrl ?? config.baseUrl,
    timeout: options?.timeout ?? config.timeout,
    maxRetries: options?.maxRetries ?? config.maxRetries,
    clientName: options?.clientName ?? config.clientName,
  });
}

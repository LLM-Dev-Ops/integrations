/**
 * Mistral API client.
 */

import { MistralConfig, MistralConfigBuilder } from '../config';
import { FetchTransport, HttpTransport } from '../transport';
import { ResilienceOrchestrator, ResilienceConfig } from '../resilience';
import { DefaultMetricsCollector, MetricsCollector } from '../observability/metrics';
import { ConsoleLogger, Logger, LogConfig } from '../observability/logging';
import {
  ChatService,
  DefaultChatService,
  EmbeddingsService,
  DefaultEmbeddingsService,
  ModelsService,
  DefaultModelsService,
  FilesService,
  DefaultFilesService,
  FineTuningService,
  DefaultFineTuningService,
  AgentsService,
  DefaultAgentsService,
  BatchService,
  DefaultBatchService,
} from '../services';

/**
 * Options for creating a Mistral client.
 */
export interface MistralClientOptions {
  /** API key for authentication. */
  apiKey?: string;
  /** Base URL for the API. */
  baseUrl?: string;
  /** Request timeout in milliseconds. */
  timeout?: number;
  /** Maximum number of retries. */
  maxRetries?: number;
  /** Resilience configuration. */
  resilience?: Partial<ResilienceConfig>;
  /** Logging configuration. */
  logging?: Partial<LogConfig>;
  /** Custom transport implementation. */
  transport?: HttpTransport;
  /** Custom metrics collector. */
  metrics?: MetricsCollector;
  /** Custom logger. */
  logger?: Logger;
}

/**
 * The main Mistral client.
 */
export class MistralClient {
  private readonly config: MistralConfig;
  private readonly transport: HttpTransport;
  private readonly resilience: ResilienceOrchestrator;
  private readonly metricsCollector: MetricsCollector;
  private readonly logger: Logger;

  private readonly chatService: ChatService;
  private readonly embeddingsService: EmbeddingsService;
  private readonly modelsService: ModelsService;
  private readonly filesService: FilesService;
  private readonly fineTuningService: FineTuningService;
  private readonly agentsService: AgentsService;
  private readonly batchService: BatchService;

  private constructor(options: MistralClientOptions & { config: MistralConfig }) {
    this.config = options.config;
    this.transport = options.transport ?? new FetchTransport(this.config);
    this.resilience = new ResilienceOrchestrator(options.resilience);
    this.metricsCollector = options.metrics ?? new DefaultMetricsCollector();
    this.logger = options.logger ?? new ConsoleLogger(options.logging);

    // Initialize services
    this.chatService = new DefaultChatService(this.transport);
    this.embeddingsService = new DefaultEmbeddingsService(this.transport);
    this.modelsService = new DefaultModelsService(this.transport);
    this.filesService = new DefaultFilesService(this.transport);
    this.fineTuningService = new DefaultFineTuningService(this.transport);
    this.agentsService = new DefaultAgentsService(this.transport);
    this.batchService = new DefaultBatchService(this.transport);
  }

  /**
   * Creates a new client builder.
   */
  static builder(): MistralClientBuilder {
    return new MistralClientBuilder();
  }

  /**
   * Creates a client from an API key.
   */
  static fromApiKey(apiKey: string): MistralClient {
    return MistralClient.builder().apiKey(apiKey).build();
  }

  /**
   * Creates a client from environment variables.
   */
  static fromEnv(): MistralClient {
    const config = MistralConfig.fromEnv();
    return new MistralClient({ config });
  }

  /**
   * Returns the chat service.
   */
  chat(): ChatService {
    return this.chatService;
  }

  /**
   * Returns the embeddings service.
   */
  embeddings(): EmbeddingsService {
    return this.embeddingsService;
  }

  /**
   * Returns the models service.
   */
  models(): ModelsService {
    return this.modelsService;
  }

  /**
   * Returns the files service.
   */
  files(): FilesService {
    return this.filesService;
  }

  /**
   * Returns the fine-tuning service.
   */
  fineTuning(): FineTuningService {
    return this.fineTuningService;
  }

  /**
   * Returns the agents service.
   */
  agents(): AgentsService {
    return this.agentsService;
  }

  /**
   * Returns the batch service.
   */
  batch(): BatchService {
    return this.batchService;
  }

  /**
   * Returns the metrics collector.
   */
  metrics(): MetricsCollector {
    return this.metricsCollector;
  }

  /**
   * Returns the resilience orchestrator.
   */
  getResilience(): ResilienceOrchestrator {
    return this.resilience;
  }

  /**
   * Returns the logger.
   */
  getLogger(): Logger {
    return this.logger;
  }

  /**
   * Returns the configuration.
   */
  getConfig(): MistralConfig {
    return this.config;
  }
}

/**
 * Builder for the Mistral client.
 */
export class MistralClientBuilder {
  private options: MistralClientOptions = {};

  /**
   * Sets the API key.
   */
  apiKey(key: string): this {
    this.options.apiKey = key;
    return this;
  }

  /**
   * Sets the base URL.
   */
  baseUrl(url: string): this {
    this.options.baseUrl = url;
    return this;
  }

  /**
   * Sets the request timeout.
   */
  timeout(ms: number): this {
    this.options.timeout = ms;
    return this;
  }

  /**
   * Sets the maximum number of retries.
   */
  maxRetries(retries: number): this {
    this.options.maxRetries = retries;
    return this;
  }

  /**
   * Sets the resilience configuration.
   */
  resilience(config: Partial<ResilienceConfig>): this {
    this.options.resilience = config;
    return this;
  }

  /**
   * Sets the logging configuration.
   */
  logging(config: Partial<LogConfig>): this {
    this.options.logging = config;
    return this;
  }

  /**
   * Sets a custom transport.
   */
  transport(transport: HttpTransport): this {
    this.options.transport = transport;
    return this;
  }

  /**
   * Sets a custom metrics collector.
   */
  metrics(collector: MetricsCollector): this {
    this.options.metrics = collector;
    return this;
  }

  /**
   * Sets a custom logger.
   */
  logger(logger: Logger): this {
    this.options.logger = logger;
    return this;
  }

  /**
   * Builds the client.
   */
  build(): MistralClient {
    const configBuilder = MistralConfig.builder();

    if (this.options.apiKey) {
      configBuilder.apiKey(this.options.apiKey);
    }
    if (this.options.baseUrl) {
      configBuilder.baseUrl(this.options.baseUrl);
    }
    if (this.options.timeout) {
      configBuilder.timeout(this.options.timeout);
    }
    if (this.options.maxRetries) {
      configBuilder.maxRetries(this.options.maxRetries);
    }

    const config = configBuilder.build();

    return new (MistralClient as any)({
      ...this.options,
      config,
    });
  }
}

export { MistralClient as default };

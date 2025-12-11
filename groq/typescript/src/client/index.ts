/**
 * Main Groq client implementation.
 */

import { GroqConfig } from '../config';
import { AuthProvider, BearerAuthProvider } from '../auth';
import { HttpTransport, AxiosTransport } from '../transport';
import { ChatService, DefaultChatService } from '../services/chat';
import { AudioService, DefaultAudioService } from '../services/audio';
import { ModelsService, DefaultModelsService } from '../services/models';
import { ResilienceOrchestrator, ResilienceConfig } from '../resilience';
import { Logger, LogLevel, ConsoleLogger, NoopLogger } from '../observability/logging';
import {
  MetricsCollector,
  DefaultMetricsCollector,
  NoopMetricsCollector,
} from '../observability/metrics';

/**
 * Options for creating a Groq client.
 */
export interface GroqClientOptions {
  /** API key for authentication. */
  apiKey?: string;
  /** Base URL for API requests. */
  baseUrl?: string;
  /** Request timeout in milliseconds. */
  timeout?: number;
  /** Maximum retry attempts. */
  maxRetries?: number;
  /** Custom headers. */
  customHeaders?: Record<string, string>;
  /** Resilience configuration. */
  resilience?: ResilienceConfig;
  /** Logger instance. */
  logger?: Logger;
  /** Metrics collector. */
  metrics?: MetricsCollector;
  /** Custom transport (for testing). */
  transport?: HttpTransport;
  /** Custom auth provider. */
  authProvider?: AuthProvider;
}

/**
 * Main Groq client.
 */
export class GroqClient {
  /** Chat completions service. */
  readonly chat: ChatService;
  /** Audio transcription/translation service. */
  readonly audio: AudioService;
  /** Models service. */
  readonly models: ModelsService;

  private readonly config: GroqConfig;
  private readonly transport: HttpTransport;
  private readonly auth: AuthProvider;
  private readonly resilience: ResilienceOrchestrator;
  private readonly logger: Logger;
  private readonly metrics: MetricsCollector;

  constructor(options: GroqClientOptions = {}) {
    // Build configuration
    const configBuilder = GroqConfig.builder();

    if (options.apiKey) {
      configBuilder.apiKey(options.apiKey);
    } else if (process.env['GROQ_API_KEY']) {
      configBuilder.apiKeyFromEnv();
    } else {
      throw new Error('API key is required. Provide apiKey option or set GROQ_API_KEY environment variable.');
    }

    if (options.baseUrl) {
      configBuilder.baseUrl(options.baseUrl);
    }
    if (options.timeout !== undefined) {
      configBuilder.timeout(options.timeout);
    }
    if (options.maxRetries !== undefined) {
      configBuilder.maxRetries(options.maxRetries);
    }
    if (options.customHeaders) {
      for (const [name, value] of Object.entries(options.customHeaders)) {
        configBuilder.header(name, value);
      }
    }

    this.config = configBuilder.build();

    // Setup auth
    this.auth = options.authProvider ?? new BearerAuthProvider(this.config.apiKey);

    // Setup transport
    this.transport = options.transport ?? new AxiosTransport(this.config, this.auth);

    // Setup resilience
    this.resilience = new ResilienceOrchestrator(options.resilience);

    // Setup observability
    this.logger = options.logger ?? new NoopLogger();
    this.metrics = options.metrics ?? new NoopMetricsCollector();

    // Create services
    this.chat = new DefaultChatService(this.transport);
    this.audio = new DefaultAudioService(this.transport);
    this.models = new DefaultModelsService(this.transport);
  }

  /**
   * Gets the configuration.
   */
  getConfig(): GroqConfig {
    return this.config;
  }

  /**
   * Gets the resilience orchestrator.
   */
  getResilience(): ResilienceOrchestrator {
    return this.resilience;
  }

  /**
   * Gets the logger.
   */
  getLogger(): Logger {
    return this.logger;
  }

  /**
   * Gets the metrics collector.
   */
  getMetrics(): MetricsCollector {
    return this.metrics;
  }

  /**
   * Creates a new client builder.
   */
  static builder(): GroqClientBuilder {
    return new GroqClientBuilder();
  }

  /**
   * Creates a client from environment variables.
   */
  static fromEnv(): GroqClient {
    return new GroqClient();
  }
}

/**
 * Builder for creating GroqClient instances.
 */
export class GroqClientBuilder {
  private options: GroqClientOptions = {};

  /**
   * Sets the API key.
   */
  apiKey(key: string): this {
    this.options.apiKey = key;
    return this;
  }

  /**
   * Sets the API key from an environment variable.
   */
  apiKeyFromEnv(varName = 'GROQ_API_KEY'): this {
    const key = process.env[varName];
    if (!key) {
      throw new Error(`Environment variable ${varName} not set`);
    }
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
   * Sets the request timeout in milliseconds.
   */
  timeout(ms: number): this {
    this.options.timeout = ms;
    return this;
  }

  /**
   * Sets the timeout in seconds.
   */
  timeoutSecs(secs: number): this {
    this.options.timeout = secs * 1000;
    return this;
  }

  /**
   * Sets the maximum retry attempts.
   */
  maxRetries(retries: number): this {
    this.options.maxRetries = retries;
    return this;
  }

  /**
   * Adds a custom header.
   */
  header(name: string, value: string): this {
    this.options.customHeaders = this.options.customHeaders ?? {};
    this.options.customHeaders[name] = value;
    return this;
  }

  /**
   * Sets the resilience configuration.
   */
  resilience(config: ResilienceConfig): this {
    this.options.resilience = config;
    return this;
  }

  /**
   * Sets the logger.
   */
  logger(logger: Logger): this {
    this.options.logger = logger;
    return this;
  }

  /**
   * Enables console logging at the specified level.
   */
  withConsoleLogging(level: LogLevel = LogLevel.Info): this {
    this.options.logger = new ConsoleLogger({ level });
    return this;
  }

  /**
   * Sets the metrics collector.
   */
  metrics(collector: MetricsCollector): this {
    this.options.metrics = collector;
    return this;
  }

  /**
   * Enables default metrics collection.
   */
  withMetrics(maxEntries = 1000): this {
    this.options.metrics = new DefaultMetricsCollector(maxEntries);
    return this;
  }

  /**
   * Sets a custom transport (for testing).
   */
  transport(transport: HttpTransport): this {
    this.options.transport = transport;
    return this;
  }

  /**
   * Sets a custom auth provider.
   */
  authProvider(provider: AuthProvider): this {
    this.options.authProvider = provider;
    return this;
  }

  /**
   * Builds the client.
   */
  build(): GroqClient {
    return new GroqClient(this.options);
  }
}

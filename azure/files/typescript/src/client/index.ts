/**
 * Azure Files Client Module
 *
 * Main client facade that provides a unified interface to all Azure Files services.
 * Following the SPARC specification for Azure Files integration.
 */

import {
  AzureFilesConfig,
  AzureFilesConfigBuilder,
  configBuilder,
} from "../config/index.js";
import { AzureAuthProvider, createAuthProvider } from "../auth/index.js";
import { HttpTransport, FetchTransport } from "../transport/index.js";
import { FileService, ShareBoundFileService } from "../services/files.js";
import { DirectoryService } from "../services/directories.js";
import { LeaseService, AutoRenewingLease, createAutoRenewingLease } from "../services/leases.js";
import { ShareService } from "../services/shares.js";
import { StreamingService } from "../streaming/index.js";
import {
  ResilientExecutor,
  createResilientExecutor,
} from "../resilience/index.js";
import {
  Logger,
  MetricsCollector,
  Tracer,
  createNoopLogger,
  createNoopMetricsCollector,
  createNoopTracer,
  createConsoleLogger,
} from "../observability/index.js";
import { MockTransport, createMockTransport } from "../simulation/index.js";

/**
 * Azure Files client options.
 */
export interface AzureFilesClientOptions {
  /** Logger instance. */
  logger?: Logger;
  /** Metrics collector instance. */
  metrics?: MetricsCollector;
  /** Tracer instance. */
  tracer?: Tracer;
  /** Custom HTTP transport (for testing). */
  transport?: HttpTransport;
}

/**
 * Azure Files client facade.
 *
 * Provides a unified interface to all Azure Files services with built-in
 * resilience, observability, and configuration.
 */
export class AzureFilesClient {
  private readonly config: AzureFilesConfig;
  private readonly transport: HttpTransport;
  private readonly authProvider: AzureAuthProvider;
  private readonly resilientExecutor: ResilientExecutor;
  private readonly logger: Logger;
  private readonly metrics: MetricsCollector;
  private readonly tracer: Tracer;

  // Lazy-initialized services
  private _fileService?: FileService;
  private _directoryService?: DirectoryService;
  private _leaseService?: LeaseService;
  private _shareService?: ShareService;
  private _streamingService?: StreamingService;

  constructor(config: AzureFilesConfig, options: AzureFilesClientOptions = {}) {
    this.config = config;
    this.transport = options.transport ?? new FetchTransport();
    this.authProvider = createAuthProvider(config.credentials, config.accountName);
    this.resilientExecutor = createResilientExecutor(
      config.retryConfig,
      config.circuitBreakerConfig
    );

    // Set up observability
    this.logger = options.logger ?? (config.enableLogging ? createConsoleLogger() : createNoopLogger());
    this.metrics = options.metrics ?? createNoopMetricsCollector();
    this.tracer = options.tracer ?? createNoopTracer();

    this.logger.info("Azure Files client initialized", {
      accountName: config.accountName,
      defaultShare: config.defaultShare,
    });
  }

  /**
   * Get the file service.
   */
  files(): FileService {
    if (!this._fileService) {
      this._fileService = new FileService(this.config, this.transport, this.authProvider);
    }
    return this._fileService;
  }

  /**
   * Get the directory service.
   */
  directories(): DirectoryService {
    if (!this._directoryService) {
      this._directoryService = new DirectoryService(
        this.config,
        this.transport,
        this.authProvider,
        this.files()
      );
    }
    return this._directoryService;
  }

  /**
   * Get the lease service.
   */
  leases(): LeaseService {
    if (!this._leaseService) {
      this._leaseService = new LeaseService(this.config, this.transport, this.authProvider);
    }
    return this._leaseService;
  }

  /**
   * Get the share service.
   */
  shares(): ShareService {
    if (!this._shareService) {
      this._shareService = new ShareService(this.config, this.transport, this.authProvider);
    }
    return this._shareService;
  }

  /**
   * Get the streaming service.
   */
  streaming(): StreamingService {
    if (!this._streamingService) {
      this._streamingService = new StreamingService(this.config, this.transport, this.authProvider);
    }
    return this._streamingService;
  }

  /**
   * Get a share-bound file service for convenience.
   */
  inShare(share: string): ShareBoundFileService {
    return this.files().inShare(share);
  }

  /**
   * Get the client configuration.
   */
  getConfig(): Readonly<AzureFilesConfig> {
    return this.config;
  }

  /**
   * Get the resilient executor for custom operations.
   */
  getExecutor(): ResilientExecutor {
    return this.resilientExecutor;
  }

  /**
   * Get the logger.
   */
  getLogger(): Logger {
    return this.logger;
  }

  /**
   * Get the metrics collector.
   */
  getMetrics(): MetricsCollector {
    return this.metrics;
  }

  /**
   * Get the tracer.
   */
  getTracer(): Tracer {
    return this.tracer;
  }

  /**
   * Create an auto-renewing lease.
   */
  async createAutoRenewingLease(
    share: string,
    path: string,
    durationSeconds?: number
  ): Promise<AutoRenewingLease> {
    const lease = await this.leases().acquire({ share, path, durationSeconds });
    return createAutoRenewingLease(lease, this.leases());
  }

  /**
   * Execute an operation with resilience (retry + circuit breaker).
   */
  async withResilience<T>(operation: () => Promise<T>): Promise<T> {
    return this.resilientExecutor.execute(operation);
  }
}

/**
 * Azure Files client builder.
 */
export class AzureFilesClientBuilder {
  private configBuilder: AzureFilesConfigBuilder;
  private options: AzureFilesClientOptions = {};

  constructor() {
    this.configBuilder = configBuilder();
  }

  /**
   * Set the account name.
   */
  accountName(name: string): this {
    this.configBuilder.accountName(name);
    return this;
  }

  /**
   * Use shared key authentication.
   */
  sharedKey(accountName: string, accountKey: string): this {
    this.configBuilder.sharedKey(accountName, accountKey);
    return this;
  }

  /**
   * Use SAS token authentication.
   */
  sasToken(token: string): this {
    this.configBuilder.sasToken(token);
    return this;
  }

  /**
   * Use connection string authentication.
   */
  connectionString(connectionString: string): this {
    this.configBuilder.connectionString(connectionString);
    return this;
  }

  /**
   * Set the default share.
   */
  defaultShare(share: string): this {
    this.configBuilder.defaultShare(share);
    return this;
  }

  /**
   * Set custom API endpoint (for emulators).
   */
  apiEndpoint(endpoint: string): this {
    this.configBuilder.apiEndpoint(endpoint);
    return this;
  }

  /**
   * Enable logging.
   */
  enableLogging(enable: boolean = true): this {
    this.configBuilder.enableLogging(enable);
    return this;
  }

  /**
   * Set a custom logger.
   */
  logger(logger: Logger): this {
    this.options.logger = logger;
    return this;
  }

  /**
   * Set a custom metrics collector.
   */
  metrics(metrics: MetricsCollector): this {
    this.options.metrics = metrics;
    return this;
  }

  /**
   * Set a custom tracer.
   */
  tracer(tracer: Tracer): this {
    this.options.tracer = tracer;
    return this;
  }

  /**
   * Set a custom HTTP transport.
   */
  transport(transport: HttpTransport): this {
    this.options.transport = transport;
    return this;
  }

  /**
   * Load configuration from environment variables.
   */
  fromEnv(): this {
    this.configBuilder.fromEnv();
    return this;
  }

  /**
   * Build the client.
   */
  build(): AzureFilesClient {
    const config = this.configBuilder.build();
    return new AzureFilesClient(config, this.options);
  }
}

/**
 * Mock Azure Files client for testing.
 */
export class MockAzureFilesClient {
  private mockTransport: MockTransport;
  private client: AzureFilesClient;

  constructor() {
    this.mockTransport = createMockTransport();

    // Create a minimal config for testing
    const config = configBuilder()
      .sharedKey("testaccount", "dGVzdGtleQ==") // Base64 "testkey"
      .defaultShare("testshare")
      .build();

    this.client = new AzureFilesClient(config, { transport: this.mockTransport });
  }

  /**
   * Get the mock transport for setting up handlers.
   */
  getMockTransport(): MockTransport {
    return this.mockTransport;
  }

  /**
   * Get the underlying client.
   */
  getClient(): AzureFilesClient {
    return this.client;
  }

  /**
   * Get the file service.
   */
  files(): FileService {
    return this.client.files();
  }

  /**
   * Get the directory service.
   */
  directories(): DirectoryService {
    return this.client.directories();
  }

  /**
   * Get the lease service.
   */
  leases(): LeaseService {
    return this.client.leases();
  }

  /**
   * Get the share service.
   */
  shares(): ShareService {
    return this.client.shares();
  }

  /**
   * Get the streaming service.
   */
  streaming(): StreamingService {
    return this.client.streaming();
  }
}

/**
 * Create a new Azure Files client builder.
 */
export function createClient(): AzureFilesClientBuilder {
  return new AzureFilesClientBuilder();
}

/**
 * Create a mock client for testing.
 */
export function createMockClient(): MockAzureFilesClient {
  return new MockAzureFilesClient();
}

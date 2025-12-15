/**
 * GCS Client
 *
 * High-level client for Google Cloud Storage operations.
 * Following the SPARC specification.
 */

import {
  GcsConfig,
  GcpCredentials,
  configBuilder,
  GcsConfigBuilder,
  RetryConfig,
  CircuitBreakerConfig,
} from "../config/index.js";
import {
  GcpAuthProvider,
  createAuthProvider,
} from "../credentials/index.js";
import { ConfigurationError } from "../error/index.js";
import { HttpTransport, FetchTransport } from "../transport/index.js";
import { ObjectsService, BucketsService, StreamingService } from "../services/index.js";
import { SigningService } from "../signing/index.js";

/**
 * GCS Client interface.
 */
export interface GcsClient {
  /** Objects service for object operations. */
  objects(): ObjectsService;

  /** Buckets service for bucket operations. */
  buckets(): BucketsService;

  /** Streaming service for resumable uploads/downloads. */
  streaming(): StreamingService;

  /** Signing service for generating signed URLs. */
  signing(): SigningService;

  /** Get the configuration. */
  config(): GcsConfig;

  /** Refresh authentication token. */
  refreshToken(): Promise<void>;
}

/**
 * GCS Client implementation.
 */
export class GcsClientImpl implements GcsClient {
  private _config: GcsConfig;
  private _transport: HttpTransport;
  private _authProvider: GcpAuthProvider;

  private _objectsService?: ObjectsService;
  private _bucketsService?: BucketsService;
  private _streamingService?: StreamingService;
  private _signingService?: SigningService;

  constructor(
    config: GcsConfig,
    transport: HttpTransport,
    authProvider: GcpAuthProvider
  ) {
    this._config = config;
    this._transport = transport;
    this._authProvider = authProvider;
  }

  objects(): ObjectsService {
    if (!this._objectsService) {
      this._objectsService = new ObjectsService(
        this._config,
        this._transport,
        this._authProvider
      );
    }
    return this._objectsService;
  }

  buckets(): BucketsService {
    if (!this._bucketsService) {
      this._bucketsService = new BucketsService(
        this._config,
        this._transport,
        this._authProvider
      );
    }
    return this._bucketsService;
  }

  streaming(): StreamingService {
    if (!this._streamingService) {
      this._streamingService = new StreamingService(
        this._config,
        this._transport,
        this._authProvider
      );
    }
    return this._streamingService;
  }

  signing(): SigningService {
    if (!this._signingService) {
      this._signingService = new SigningService(this._config, this._authProvider);
    }
    return this._signingService;
  }

  config(): GcsConfig {
    return this._config;
  }

  async refreshToken(): Promise<void> {
    await this._authProvider.refreshToken();
  }
}

/**
 * GCS Client builder.
 */
export class GcsClientBuilder {
  private _config?: GcsConfig;
  private _configBuilder: GcsConfigBuilder = configBuilder();
  private _credentials?: GcpCredentials;
  private _transport?: HttpTransport;
  private _fromEnv: boolean = false;

  /**
   * Set the full configuration.
   */
  config(config: GcsConfig): this {
    this._config = config;
    return this;
  }

  /**
   * Set the GCP project ID.
   */
  projectId(projectId: string): this {
    this._configBuilder.projectId(projectId);
    return this;
  }

  /**
   * Set explicit credentials.
   */
  credentials(credentials: GcpCredentials): this {
    this._credentials = credentials;
    this._configBuilder.credentials(credentials);
    return this;
  }

  /**
   * Use service account key file.
   */
  serviceAccountKeyFile(keyFile: string): this {
    this._credentials = { type: "service_account", keyFile };
    this._configBuilder.serviceAccountKeyFile(keyFile);
    return this;
  }

  /**
   * Use application default credentials.
   */
  applicationDefault(): this {
    this._credentials = { type: "application_default" };
    this._configBuilder.applicationDefault();
    return this;
  }

  /**
   * Use workload identity (GKE).
   */
  workloadIdentity(): this {
    this._credentials = { type: "workload_identity" };
    this._configBuilder.workloadIdentity();
    return this;
  }

  /**
   * Use explicit access token.
   */
  accessToken(token: string): this {
    this._credentials = { type: "access_token", token };
    this._configBuilder.accessToken(token);
    return this;
  }

  /**
   * Set request timeout in milliseconds.
   */
  timeout(ms: number): this {
    this._configBuilder.timeout(ms);
    return this;
  }

  /**
   * Set retry configuration.
   */
  retryConfig(config: RetryConfig): this {
    this._configBuilder.retryConfig(config);
    return this;
  }

  /**
   * Set circuit breaker configuration.
   */
  circuitBreakerConfig(config: CircuitBreakerConfig): this {
    this._configBuilder.circuitBreakerConfig(config);
    return this;
  }

  /**
   * Set upload chunk size.
   */
  uploadChunkSize(size: number): this {
    this._configBuilder.uploadChunkSize(size);
    return this;
  }

  /**
   * Set download buffer size.
   */
  downloadBufferSize(size: number): this {
    this._configBuilder.downloadBufferSize(size);
    return this;
  }

  /**
   * Set custom API endpoint (for emulators).
   */
  apiEndpoint(endpoint: string): this {
    this._configBuilder.apiEndpoint(endpoint);
    return this;
  }

  /**
   * Enable request logging.
   */
  enableLogging(enable: boolean = true): this {
    this._configBuilder.enableLogging(enable);
    return this;
  }

  /**
   * Set a custom HTTP transport.
   */
  transport(transport: HttpTransport): this {
    this._transport = transport;
    return this;
  }

  /**
   * Load configuration from environment variables.
   */
  fromEnv(): this {
    this._fromEnv = true;
    this._configBuilder.fromEnv();
    return this;
  }

  /**
   * Build the GCS client.
   */
  async build(): Promise<GcsClient> {
    // Build configuration
    let config: GcsConfig;
    if (this._config) {
      config = this._config;
    } else {
      if (this._fromEnv) {
        this._configBuilder.fromEnv();
      }
      config = this._configBuilder.build();
    }

    // Get credentials
    const credentials = this._credentials ?? config.credentials;
    if (!credentials) {
      throw new ConfigurationError(
        "Credentials must be provided (call credentials(), fromEnv(), or set GOOGLE_APPLICATION_CREDENTIALS)",
        "InvalidCredentials"
      );
    }

    // Create transport
    const transport = this._transport ?? new FetchTransport(config.timeout);

    // Create auth provider
    const authProvider = await createAuthProvider(credentials, transport);

    return new GcsClientImpl(config, transport, authProvider);
  }
}

/**
 * Create a new GCS client builder.
 */
export function clientBuilder(): GcsClientBuilder {
  return new GcsClientBuilder();
}

/**
 * Create a GCS client from environment variables.
 */
export async function createClientFromEnv(): Promise<GcsClient> {
  return clientBuilder().fromEnv().build();
}

/**
 * Create a GCS client with explicit configuration.
 */
export async function createClient(config: GcsConfig): Promise<GcsClient> {
  return clientBuilder().config(config).build();
}

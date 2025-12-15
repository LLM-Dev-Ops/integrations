/**
 * BigQuery Client
 *
 * High-level client for Google BigQuery operations.
 * Following the SPARC specification.
 */

import {
  BigQueryConfig,
  GcpCredentials,
  configBuilder,
  RetryConfig,
  DEFAULT_CONFIG,
} from "../config/index.js";
import {
  GcpAuthProvider,
  createAuthProvider,
} from "../credentials/index.js";
import { ConfigurationError } from "../error/index.js";
import { HttpTransport, FetchTransport } from "../transport/index.js";
// Import service types (some services are still being implemented)
import type { QueryService } from "../services/query/index.js";
import type { StreamingService } from "../services/streaming/index.js";
import type { LoadService } from "../services/load/index.js";
import type { CostService } from "../services/cost/index.js";

// JobService interface (to be implemented)
export interface JobService {
  // Will be defined when job service is implemented
}

/**
 * BigQuery Client interface.
 */
export interface BigQueryClient {
  /** Query service for executing queries. */
  query(): QueryService;

  /** Job service for managing jobs. */
  jobs(): JobService;

  /** Streaming service for streaming inserts. */
  streaming(): StreamingService;

  /** Load service for batch data loading. */
  load(): LoadService;

  /** Cost service for cost estimation and tracking. */
  cost(): CostService;

  /** Get the configuration. */
  config(): BigQueryConfig;

  /** Refresh authentication token. */
  refreshToken(): Promise<void>;
}

/**
 * BigQuery Client implementation.
 */
export class BigQueryClientImpl implements BigQueryClient {
  private _config: BigQueryConfig;
  private _transport: HttpTransport;
  private _authProvider: GcpAuthProvider;

  private _queryService?: QueryService;
  private _jobService?: JobService;
  private _streamingService?: StreamingService;
  private _loadService?: LoadService;
  private _costService?: CostService;

  constructor(
    config: BigQueryConfig,
    transport: HttpTransport,
    authProvider: GcpAuthProvider
  ) {
    this._config = config;
    this._transport = transport;
    this._authProvider = authProvider;
  }

  query(): QueryService {
    if (!this._queryService) {
      // Lazy initialization - service implementation will be created when needed
      // For now, we throw an error as the service implementations are being built separately
      throw new Error("QueryService implementation pending");
    }
    return this._queryService;
  }

  jobs(): JobService {
    if (!this._jobService) {
      throw new Error("JobService implementation pending");
    }
    return this._jobService;
  }

  streaming(): StreamingService {
    if (!this._streamingService) {
      throw new Error("StreamingService implementation pending");
    }
    return this._streamingService;
  }

  load(): LoadService {
    if (!this._loadService) {
      throw new Error("LoadService implementation pending");
    }
    return this._loadService;
  }

  cost(): CostService {
    if (!this._costService) {
      throw new Error("CostService implementation pending");
    }
    return this._costService;
  }

  config(): BigQueryConfig {
    return this._config;
  }

  async refreshToken(): Promise<void> {
    await this._authProvider.refreshToken();
  }
}

/**
 * BigQuery Client builder configuration.
 */
interface BuilderConfig {
  projectId?: string;
  location?: string;
  credentials?: GcpCredentials;
  timeout?: number;
  retryConfig?: RetryConfig;
  maximumBytesBilled?: bigint;
  useQueryCache?: boolean;
  apiEndpoint?: string;
  transport?: HttpTransport;
}

/**
 * BigQuery Client builder.
 */
export class BigQueryClientBuilder {
  private _config?: BigQueryConfig;
  private _builderConfig: BuilderConfig = {};
  private _fromEnv: boolean = false;

  /**
   * Set the full configuration.
   */
  config(config: BigQueryConfig): this {
    this._config = config;
    return this;
  }

  /**
   * Set the GCP project ID.
   */
  projectId(projectId: string): this {
    this._builderConfig.projectId = projectId;
    return this;
  }

  /**
   * Set the BigQuery location/region.
   */
  location(location: string): this {
    this._builderConfig.location = location;
    return this;
  }

  /**
   * Set explicit credentials.
   */
  credentials(credentials: GcpCredentials): this {
    this._builderConfig.credentials = credentials;
    return this;
  }

  /**
   * Use service account key file.
   */
  serviceAccountKeyFile(keyFile: string): this {
    this._builderConfig.credentials = { type: "service_account", keyFile };
    return this;
  }

  /**
   * Use application default credentials.
   */
  applicationDefault(): this {
    this._builderConfig.credentials = { type: "application_default" };
    return this;
  }

  /**
   * Use workload identity (GKE).
   */
  workloadIdentity(): this {
    this._builderConfig.credentials = { type: "workload_identity" };
    return this;
  }

  /**
   * Use explicit access token.
   */
  accessToken(token: string): this {
    this._builderConfig.credentials = { type: "access_token", token };
    return this;
  }

  /**
   * Set request timeout in milliseconds.
   */
  timeout(ms: number): this {
    this._builderConfig.timeout = ms;
    return this;
  }

  /**
   * Set retry configuration.
   */
  retryConfig(config: RetryConfig): this {
    this._builderConfig.retryConfig = config;
    return this;
  }

  /**
   * Set maximum bytes billed limit.
   */
  maximumBytesBilled(bytes: bigint): this {
    this._builderConfig.maximumBytesBilled = bytes;
    return this;
  }

  /**
   * Enable or disable query cache.
   */
  useQueryCache(use: boolean): this {
    this._builderConfig.useQueryCache = use;
    return this;
  }

  /**
   * Set custom API endpoint (for emulators).
   */
  apiEndpoint(endpoint: string): this {
    this._builderConfig.apiEndpoint = endpoint;
    return this;
  }

  /**
   * Set a custom HTTP transport.
   */
  transport(transport: HttpTransport): this {
    this._builderConfig.transport = transport;
    return this;
  }

  /**
   * Load configuration from environment variables.
   */
  fromEnv(): this {
    this._fromEnv = true;
    return this;
  }

  /**
   * Build the BigQuery client.
   */
  async build(): Promise<BigQueryClient> {
    // Step 1: Build configuration
    let config: BigQueryConfig;
    if (this._config) {
      config = this._config;
    } else {
      // Use config builder to merge defaults
      const builder = configBuilder();

      if (this._fromEnv) {
        builder.fromEnv();
      }

      // Apply builder config settings
      if (this._builderConfig.projectId) {
        builder.projectId(this._builderConfig.projectId);
      }
      if (this._builderConfig.location) {
        builder.location(this._builderConfig.location);
      }
      if (this._builderConfig.credentials) {
        builder.credentials(this._builderConfig.credentials);
      }
      if (this._builderConfig.timeout !== undefined) {
        builder.timeout(this._builderConfig.timeout);
      }
      if (this._builderConfig.retryConfig) {
        builder.retryConfig(this._builderConfig.retryConfig);
      }
      if (this._builderConfig.maximumBytesBilled !== undefined) {
        builder.maximumBytesBilled(this._builderConfig.maximumBytesBilled);
      }
      if (this._builderConfig.useQueryCache !== undefined) {
        builder.useQueryCache(this._builderConfig.useQueryCache);
      }
      if (this._builderConfig.apiEndpoint) {
        builder.apiEndpoint(this._builderConfig.apiEndpoint);
      }

      config = builder.build();
    }

    // Step 2: Get credentials
    const credentials = this._builderConfig.credentials ?? config.credentials;
    if (!credentials) {
      throw new ConfigurationError(
        "Credentials must be provided (call credentials(), fromEnv(), or set GOOGLE_APPLICATION_CREDENTIALS)",
        "InvalidConfig"
      );
    }

    // Step 3: Create transport
    const transport = this._builderConfig.transport ?? new FetchTransport(config.timeout);

    // Step 4: Create auth provider
    const authProvider = await createAuthProvider(credentials);

    // Step 5: Return new client
    return new BigQueryClientImpl(config, transport, authProvider);
  }
}

/**
 * Create a new BigQuery client builder.
 */
export function clientBuilder(): BigQueryClientBuilder {
  return new BigQueryClientBuilder();
}

/**
 * Create a BigQuery client from environment variables.
 */
export async function createClientFromEnv(): Promise<BigQueryClient> {
  return clientBuilder().fromEnv().build();
}

/**
 * Create a BigQuery client with explicit configuration.
 */
export async function createClient(config: BigQueryConfig): Promise<BigQueryClient> {
  return clientBuilder().config(config).build();
}

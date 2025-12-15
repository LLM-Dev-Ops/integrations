/**
 * GCL Client
 *
 * High-level client for Google Cloud Logging operations.
 * Following the SPARC specification.
 */

import type {
  GclConfig,
  GcpCredentials,
  RetryConfig,
  CircuitBreakerConfig,
  BufferConfig,
  MonitoredResourceConfig,
} from "../config/index.js";
import {
  configBuilder,
  GclConfigBuilder,
  DEFAULT_BUFFER_CONFIG,
} from "../config/index.js";
import type { GcpAuthProvider } from "./auth.js";
import { createAuthProvider } from "./auth.js";
import { ConfigurationError } from "../error/index.js";
import type { HttpTransport } from "../transport/index.js";
import { FetchTransport } from "../transport/index.js";
import { LogBuffer } from "../buffer/index.js";
import { LogWriter, LogEntryBuilder } from "../services/writer.js";
import { LogQuerier, FilterBuilder } from "../services/querier.js";
import { LogTailer, TailStream, TailHandle } from "../services/tailer.js";
import type { Severity, SeverityString } from "../types/index.js";

/**
 * GCL Client interface.
 */
export interface GclClient {
  /** Log writer service. */
  writer(): LogWriter;

  /** Log querier service. */
  querier(): LogQuerier;

  /** Log tailer service. */
  tailer(): LogTailer;

  /** Get the configuration. */
  config(): GclConfig;

  /** Refresh authentication token. */
  refreshToken(): Promise<void>;

  /** Gracefully shutdown the client. */
  shutdown(): Promise<void>;
}

/**
 * GCL Client implementation.
 */
export class GclClientImpl implements GclClient {
  private _config: GclConfig;
  private _transport: HttpTransport;
  private _authProvider: GcpAuthProvider;
  private _buffer: LogBuffer;

  private _writer?: LogWriter;
  private _querier?: LogQuerier;
  private _tailer?: LogTailer;

  constructor(
    config: GclConfig,
    transport: HttpTransport,
    authProvider: GcpAuthProvider,
    buffer: LogBuffer
  ) {
    this._config = config;
    this._transport = transport;
    this._authProvider = authProvider;
    this._buffer = buffer;
  }

  writer(): LogWriter {
    if (!this._writer) {
      this._writer = new LogWriter(
        this._config,
        this._transport,
        this._authProvider,
        this._buffer
      );
    }
    return this._writer;
  }

  querier(): LogQuerier {
    if (!this._querier) {
      this._querier = new LogQuerier(
        this._config,
        this._transport,
        this._authProvider
      );
    }
    return this._querier;
  }

  tailer(): LogTailer {
    if (!this._tailer) {
      this._tailer = new LogTailer(
        this._config,
        this._transport,
        this._authProvider
      );
    }
    return this._tailer;
  }

  config(): GclConfig {
    return this._config;
  }

  async refreshToken(): Promise<void> {
    await this._authProvider.refreshToken();
  }

  async shutdown(): Promise<void> {
    // Flush any pending writes
    if (this._writer) {
      await this._writer.shutdown();
    }
  }
}

/**
 * GCL Client builder.
 */
export class GclClientBuilder {
  private _config?: GclConfig;
  private _configBuilder: GclConfigBuilder = configBuilder();
  private _credentials?: GcpCredentials;
  private _transport?: HttpTransport;
  private _fromEnv: boolean = false;

  /**
   * Set the full configuration.
   */
  config(config: GclConfig): this {
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
   * Set the log ID.
   */
  logId(logId: string): this {
    this._configBuilder.logId(logId);
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
   * Set monitored resource.
   */
  resource(resource: MonitoredResourceConfig): this {
    this._configBuilder.resource(resource);
    return this;
  }

  /**
   * Set global resource type.
   */
  globalResource(): this {
    this._configBuilder.globalResource();
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
   * Set buffer configuration.
   */
  bufferConfig(config: Partial<BufferConfig>): this {
    this._configBuilder.bufferConfig(config);
    return this;
  }

  /**
   * Add a default label.
   */
  defaultLabel(key: string, value: string): this {
    this._configBuilder.defaultLabel(key, value);
    return this;
  }

  /**
   * Set default labels.
   */
  defaultLabels(labels: Record<string, string>): this {
    this._configBuilder.defaultLabels(labels);
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
   * Build the GCL client.
   */
  async build(): Promise<GclClient> {
    // Build configuration
    let config: GclConfig;
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
        "InvalidConfig"
      );
    }

    // Create transport
    const transport = this._transport ?? new FetchTransport(config.timeout);

    // Create auth provider
    const authProvider = await createAuthProvider(credentials, transport);

    // Create buffer
    const buffer = new LogBuffer(config.bufferConfig ?? DEFAULT_BUFFER_CONFIG);

    return new GclClientImpl(config, transport, authProvider, buffer);
  }
}

/**
 * Create a new GCL client builder.
 */
export function clientBuilder(): GclClientBuilder {
  return new GclClientBuilder();
}

/**
 * Create a GCL client from environment variables.
 */
export async function createClientFromEnv(): Promise<GclClient> {
  return clientBuilder().fromEnv().build();
}

/**
 * Create a GCL client with explicit configuration.
 */
export async function createClient(config: GclConfig): Promise<GclClient> {
  return clientBuilder().config(config).build();
}

// Re-export for convenience
export { LogWriter, LogEntryBuilder } from "../services/writer.js";
export { LogQuerier, FilterBuilder } from "../services/querier.js";
export { LogTailer, TailStream, TailHandle } from "../services/tailer.js";
export type { GcpAuthProvider } from "./auth.js";
export { createAuthProvider } from "./auth.js";

/**
 * GCL Configuration Module
 *
 * Following the SPARC specification for Google Cloud Logging integration.
 */

import { ConfigurationError } from "../error/index.js";

/**
 * GCP credentials type.
 */
export type GcpCredentials =
  | { type: "service_account"; keyFile: string }
  | { type: "service_account_json"; key: ServiceAccountKey }
  | { type: "workload_identity" }
  | { type: "application_default" }
  | { type: "access_token"; token: string };

/**
 * Service account key structure.
 */
export interface ServiceAccountKey {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
}

/**
 * Retry configuration.
 */
export interface RetryConfig {
  /** Maximum number of retry attempts. */
  maxAttempts: number;
  /** Base delay in milliseconds. */
  baseDelay: number;
  /** Maximum delay in milliseconds. */
  maxDelay: number;
  /** Backoff multiplier. */
  multiplier: number;
}

/**
 * Circuit breaker configuration.
 */
export interface CircuitBreakerConfig {
  /** Number of failures before opening circuit. */
  failureThreshold: number;
  /** Number of successes to close circuit. */
  successThreshold: number;
  /** Reset timeout in milliseconds. */
  resetTimeout: number;
}

/**
 * Buffer configuration for write operations.
 */
export interface BufferConfig {
  /** Maximum number of entries in buffer. Default: 1000 */
  maxEntries: number;
  /** Maximum buffer size in bytes. Default: 10MB */
  maxBytes: number;
  /** Entry count threshold to trigger flush. Default: 500 */
  flushThreshold: number;
  /** Time interval to trigger flush in milliseconds. Default: 1000 */
  flushIntervalMs: number;
  /** Byte threshold to trigger flush. Default: 5MB */
  flushByteThreshold: number;
}

/**
 * GCL client configuration.
 */
export interface GclConfig {
  /** GCP project ID. */
  projectId: string;
  /** Log ID (name) for the log resource. */
  logId: string;
  /** GCP credentials. */
  credentials?: GcpCredentials;
  /** Monitored resource for log entries. */
  resource?: MonitoredResourceConfig;
  /** Request timeout in milliseconds. */
  timeout: number;
  /** Retry configuration. */
  retryConfig: RetryConfig;
  /** Circuit breaker configuration. */
  circuitBreakerConfig: CircuitBreakerConfig;
  /** Buffer configuration for writes. */
  bufferConfig: BufferConfig;
  /** Default labels to apply to all log entries. */
  defaultLabels: Record<string, string>;
  /** Custom API endpoint (for emulators). */
  apiEndpoint?: string;
  /** Enable request logging. */
  enableLogging: boolean;
}

/**
 * Monitored resource configuration.
 */
export interface MonitoredResourceConfig {
  /** Resource type (e.g., "global", "gce_instance", "k8s_container"). */
  type: string;
  /** Resource labels. */
  labels: Record<string, string>;
}

/**
 * Default buffer configuration values.
 */
export const DEFAULT_BUFFER_CONFIG: BufferConfig = {
  maxEntries: 1000,
  maxBytes: 10 * 1024 * 1024, // 10MB
  flushThreshold: 500,
  flushIntervalMs: 1000,
  flushByteThreshold: 5 * 1024 * 1024, // 5MB
};

/**
 * Default configuration values.
 */
export const DEFAULT_CONFIG: Omit<GclConfig, "projectId" | "logId" | "credentials"> = {
  timeout: 30000,
  retryConfig: {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 30000,
    multiplier: 2,
  },
  circuitBreakerConfig: {
    failureThreshold: 5,
    successThreshold: 2,
    resetTimeout: 30000,
  },
  bufferConfig: DEFAULT_BUFFER_CONFIG,
  defaultLabels: {},
  enableLogging: false,
};

/**
 * GCL configuration builder.
 */
export class GclConfigBuilder {
  private config: Partial<GclConfig> = {};

  /**
   * Set the GCP project ID.
   */
  projectId(projectId: string): this {
    this.config.projectId = projectId;
    return this;
  }

  /**
   * Set the log ID.
   */
  logId(logId: string): this {
    this.config.logId = logId;
    return this;
  }

  /**
   * Set explicit credentials.
   */
  credentials(credentials: GcpCredentials): this {
    this.config.credentials = credentials;
    return this;
  }

  /**
   * Use service account key file.
   */
  serviceAccountKeyFile(keyFile: string): this {
    this.config.credentials = { type: "service_account", keyFile };
    return this;
  }

  /**
   * Use service account key JSON.
   */
  serviceAccountKey(key: ServiceAccountKey): this {
    this.config.credentials = { type: "service_account_json", key };
    return this;
  }

  /**
   * Use workload identity (GKE).
   */
  workloadIdentity(): this {
    this.config.credentials = { type: "workload_identity" };
    return this;
  }

  /**
   * Use application default credentials.
   */
  applicationDefault(): this {
    this.config.credentials = { type: "application_default" };
    return this;
  }

  /**
   * Use explicit access token.
   */
  accessToken(token: string): this {
    this.config.credentials = { type: "access_token", token };
    return this;
  }

  /**
   * Set monitored resource.
   */
  resource(resource: MonitoredResourceConfig): this {
    this.config.resource = resource;
    return this;
  }

  /**
   * Set global resource type.
   */
  globalResource(): this {
    this.config.resource = {
      type: "global",
      labels: {},
    };
    return this;
  }

  /**
   * Set request timeout in milliseconds.
   */
  timeout(ms: number): this {
    this.config.timeout = ms;
    return this;
  }

  /**
   * Set retry configuration.
   */
  retryConfig(config: RetryConfig): this {
    this.config.retryConfig = config;
    return this;
  }

  /**
   * Set circuit breaker configuration.
   */
  circuitBreakerConfig(config: CircuitBreakerConfig): this {
    this.config.circuitBreakerConfig = config;
    return this;
  }

  /**
   * Set buffer configuration.
   */
  bufferConfig(config: Partial<BufferConfig>): this {
    this.config.bufferConfig = { ...DEFAULT_BUFFER_CONFIG, ...config };
    return this;
  }

  /**
   * Add a default label.
   */
  defaultLabel(key: string, value: string): this {
    if (!this.config.defaultLabels) {
      this.config.defaultLabels = {};
    }
    this.config.defaultLabels[key] = value;
    return this;
  }

  /**
   * Set default labels.
   */
  defaultLabels(labels: Record<string, string>): this {
    this.config.defaultLabels = labels;
    return this;
  }

  /**
   * Set custom API endpoint (for emulators).
   */
  apiEndpoint(endpoint: string): this {
    this.config.apiEndpoint = endpoint;
    return this;
  }

  /**
   * Enable request logging.
   */
  enableLogging(enable: boolean = true): this {
    this.config.enableLogging = enable;
    return this;
  }

  /**
   * Load configuration from environment variables.
   */
  fromEnv(): this {
    // Project ID
    const projectId =
      process.env["GOOGLE_CLOUD_PROJECT"] ??
      process.env["GCLOUD_PROJECT"] ??
      process.env["GCP_PROJECT"];
    if (projectId) {
      this.config.projectId = projectId;
    }

    // Log ID
    const logId = process.env["GCL_LOG_ID"];
    if (logId) {
      this.config.logId = logId;
    }

    // Credentials file
    const credentialsFile = process.env["GOOGLE_APPLICATION_CREDENTIALS"];
    if (credentialsFile) {
      this.config.credentials = { type: "service_account", keyFile: credentialsFile };
    }

    return this;
  }

  /**
   * Build the configuration.
   */
  build(): GclConfig {
    const merged = { ...DEFAULT_CONFIG, ...this.config } as GclConfig;

    // Validate required fields
    if (!merged.projectId) {
      throw new ConfigurationError(
        "Project ID must be specified (set GOOGLE_CLOUD_PROJECT or call projectId())",
        "InvalidProjectId"
      );
    }

    if (!merged.logId) {
      throw new ConfigurationError(
        "Log ID must be specified (set GCL_LOG_ID or call logId())",
        "InvalidLogName"
      );
    }

    // Set default resource if not provided
    if (!merged.resource) {
      merged.resource = {
        type: "global",
        labels: { project_id: merged.projectId },
      };
    }

    // Validate endpoint if provided
    if (merged.apiEndpoint) {
      try {
        new URL(merged.apiEndpoint);
      } catch {
        throw new ConfigurationError(
          `Invalid API endpoint URL: ${merged.apiEndpoint}`,
          "InvalidConfig"
        );
      }
    }

    return merged;
  }
}

/**
 * Create a new GCL config builder.
 */
export function configBuilder(): GclConfigBuilder {
  return new GclConfigBuilder();
}

/**
 * Resolve the Cloud Logging API endpoint.
 */
export function resolveEndpoint(config: GclConfig): string {
  if (config.apiEndpoint) {
    return config.apiEndpoint;
  }
  return "https://logging.googleapis.com";
}

/**
 * Format log name for API requests.
 */
export function formatLogName(projectId: string, logId: string): string {
  // URL-encode the log ID
  const encodedLogId = encodeURIComponent(logId);
  return `projects/${projectId}/logs/${encodedLogId}`;
}

/**
 * Format resource name for API requests.
 */
export function formatResourceName(projectId: string): string {
  return `projects/${projectId}`;
}

/**
 * Validate log ID according to Cloud Logging requirements.
 */
export function validateLogId(logId: string): void {
  if (!logId) {
    throw new ConfigurationError("Log ID cannot be empty", "InvalidLogName");
  }

  if (logId.length > 512) {
    throw new ConfigurationError(
      "Log ID cannot exceed 512 characters",
      "InvalidLogName"
    );
  }

  // Must only contain URL-safe characters
  // Cannot contain forward slash (/) or backslash (\)
  if (/[/\\]/.test(logId)) {
    throw new ConfigurationError(
      "Log ID cannot contain forward slash or backslash",
      "InvalidLogName"
    );
  }
}

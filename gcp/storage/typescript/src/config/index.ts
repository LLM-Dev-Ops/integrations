/**
 * GCS Configuration Module
 *
 * Following the SPARC specification for Google Cloud Storage integration.
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
 * GCS client configuration.
 */
export interface GcsConfig {
  /** GCP project ID. */
  projectId: string;
  /** GCP credentials. */
  credentials?: GcpCredentials;
  /** Request timeout in milliseconds. */
  timeout: number;
  /** Retry configuration. */
  retryConfig: RetryConfig;
  /** Circuit breaker configuration. */
  circuitBreakerConfig: CircuitBreakerConfig;
  /** Chunk size for resumable uploads (default: 8MB). */
  uploadChunkSize: number;
  /** Buffer size for streaming downloads (default: 64KB). */
  downloadBufferSize: number;
  /** Threshold for using resumable uploads (default: 5MB). */
  simpleUploadThreshold: number;
  /** Custom API endpoint (for emulators). */
  apiEndpoint?: string;
  /** Enable request logging. */
  enableLogging: boolean;
}

/**
 * Default configuration values.
 */
export const DEFAULT_CONFIG: Omit<GcsConfig, "projectId" | "credentials"> = {
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
  uploadChunkSize: 8 * 1024 * 1024, // 8MB
  downloadBufferSize: 64 * 1024, // 64KB
  simpleUploadThreshold: 5 * 1024 * 1024, // 5MB
  enableLogging: false,
};

/**
 * GCS configuration builder.
 */
export class GcsConfigBuilder {
  private config: Partial<GcsConfig> = {};

  /**
   * Set the GCP project ID.
   */
  projectId(projectId: string): this {
    this.config.projectId = projectId;
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
   * Set upload chunk size.
   */
  uploadChunkSize(size: number): this {
    // Chunk size must be multiple of 256KB for GCS
    const aligned = Math.ceil(size / (256 * 1024)) * 256 * 1024;
    this.config.uploadChunkSize = Math.max(aligned, 256 * 1024);
    return this;
  }

  /**
   * Set download buffer size.
   */
  downloadBufferSize(size: number): this {
    this.config.downloadBufferSize = size;
    return this;
  }

  /**
   * Set simple upload threshold.
   */
  simpleUploadThreshold(threshold: number): this {
    this.config.simpleUploadThreshold = threshold;
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
      process.env.GOOGLE_CLOUD_PROJECT ??
      process.env.GCLOUD_PROJECT ??
      process.env.GCP_PROJECT;
    if (projectId) {
      this.config.projectId = projectId;
    }

    // Credentials file
    const credentialsFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (credentialsFile) {
      this.config.credentials = { type: "service_account", keyFile: credentialsFile };
    }

    // Emulator endpoint
    const emulatorHost = process.env.STORAGE_EMULATOR_HOST;
    if (emulatorHost) {
      this.config.apiEndpoint = emulatorHost.startsWith("http")
        ? emulatorHost
        : `http://${emulatorHost}`;
    }

    return this;
  }

  /**
   * Build the configuration.
   */
  build(): GcsConfig {
    const merged = { ...DEFAULT_CONFIG, ...this.config } as GcsConfig;

    // Validate required fields
    if (!merged.projectId) {
      throw new ConfigurationError(
        "Project ID must be specified (set GOOGLE_CLOUD_PROJECT or call projectId())",
        "MissingProject"
      );
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
 * Create a new GCS config builder.
 */
export function configBuilder(): GcsConfigBuilder {
  return new GcsConfigBuilder();
}

/**
 * Resolve the GCS API endpoint.
 */
export function resolveEndpoint(config: GcsConfig): string {
  if (config.apiEndpoint) {
    return config.apiEndpoint;
  }
  return "https://storage.googleapis.com";
}

/**
 * Resolve the GCS upload endpoint.
 */
export function resolveUploadEndpoint(config: GcsConfig): string {
  if (config.apiEndpoint) {
    return config.apiEndpoint;
  }
  return "https://storage.googleapis.com";
}

/**
 * Validate bucket name according to GCS requirements.
 */
export function validateBucketName(bucket: string): void {
  if (!bucket) {
    throw new ConfigurationError("Bucket name cannot be empty", "InvalidBucketName");
  }

  if (bucket.length < 3 || bucket.length > 63) {
    throw new ConfigurationError(
      "Bucket name must be 3-63 characters",
      "InvalidBucketName"
    );
  }

  // Must start and end with alphanumeric
  if (!/^[a-z0-9]/.test(bucket) || !/[a-z0-9]$/.test(bucket)) {
    throw new ConfigurationError(
      "Bucket name must start and end with alphanumeric character",
      "InvalidBucketName"
    );
  }

  // Can only contain lowercase letters, numbers, hyphens, underscores, and dots
  if (!/^[a-z0-9._-]+$/.test(bucket)) {
    throw new ConfigurationError(
      "Bucket name can only contain lowercase letters, numbers, hyphens, underscores, and dots",
      "InvalidBucketName"
    );
  }

  // Cannot have consecutive dots
  if (bucket.includes("..")) {
    throw new ConfigurationError(
      "Bucket name cannot have consecutive dots",
      "InvalidBucketName"
    );
  }

  // Cannot look like an IP address
  if (/^\d+\.\d+\.\d+\.\d+$/.test(bucket)) {
    throw new ConfigurationError(
      "Bucket name cannot be an IP address",
      "InvalidBucketName"
    );
  }
}

/**
 * Validate object name according to GCS requirements.
 */
export function validateObjectName(name: string): void {
  if (!name) {
    throw new ConfigurationError("Object name cannot be empty", "InvalidObjectName");
  }

  if (name.length > 1024) {
    throw new ConfigurationError(
      "Object name cannot exceed 1024 characters",
      "InvalidObjectName"
    );
  }

  // Cannot contain null bytes
  if (name.includes("\0")) {
    throw new ConfigurationError(
      "Object name cannot contain null bytes",
      "InvalidObjectName"
    );
  }

  // Cannot contain carriage return or line feed
  if (/[\r\n]/.test(name)) {
    throw new ConfigurationError(
      "Object name cannot contain carriage return or line feed",
      "InvalidObjectName"
    );
  }
}

/**
 * URL-encode an object name for use in GCS API paths.
 */
export function encodeObjectName(name: string): string {
  return encodeURIComponent(name).replace(/%2F/g, "/");
}

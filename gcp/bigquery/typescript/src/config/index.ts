/**
 * BigQuery Configuration Module
 *
 * Following the SPARC specification for Google BigQuery integration.
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
 * BigQuery client configuration.
 */
export interface BigQueryConfig {
  /** GCP project ID. */
  projectId: string;
  /** BigQuery location/region (default: 'US'). */
  location: string;
  /** GCP credentials. */
  credentials?: GcpCredentials;
  /** Request timeout in milliseconds. */
  timeout: number;
  /** Retry configuration. */
  retryConfig: RetryConfig;
  /** Circuit breaker configuration. */
  circuitBreakerConfig: CircuitBreakerConfig;
  /** Global maximum bytes billed limit. */
  maximumBytesBilled?: bigint;
  /** Use query cache (default: true). */
  useQueryCache: boolean;
  /** Use legacy SQL (default: false). */
  useLegacySql: boolean;
  /** Enable request logging. */
  enableLogging: boolean;
  /** Custom API endpoint (for emulators). */
  apiEndpoint?: string;
}

/**
 * Default configuration values.
 */
export const DEFAULT_CONFIG: Omit<BigQueryConfig, "projectId" | "credentials"> = {
  location: "US",
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
  useQueryCache: true,
  useLegacySql: false,
  enableLogging: false,
};

/**
 * BigQuery configuration builder.
 */
export class BigQueryConfigBuilder {
  private config: Partial<BigQueryConfig> = {};

  /**
   * Set the GCP project ID.
   */
  projectId(projectId: string): this {
    this.config.projectId = projectId;
    return this;
  }

  /**
   * Set the BigQuery location/region.
   */
  location(location: string): this {
    this.config.location = location;
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
   * Set maximum bytes billed limit.
   */
  maximumBytesBilled(bytes: bigint): this {
    this.config.maximumBytesBilled = bytes;
    return this;
  }

  /**
   * Enable or disable query cache.
   */
  useQueryCache(use: boolean): this {
    this.config.useQueryCache = use;
    return this;
  }

  /**
   * Enable or disable legacy SQL.
   */
  useLegacySql(use: boolean): this {
    this.config.useLegacySql = use;
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
   * Set custom API endpoint (for emulators).
   */
  apiEndpoint(endpoint: string): this {
    this.config.apiEndpoint = endpoint;
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

    // Location
    const location = process.env.BIGQUERY_LOCATION;
    if (location) {
      this.config.location = location;
    }

    // Emulator endpoint
    const emulatorHost = process.env.BIGQUERY_EMULATOR_HOST;
    if (emulatorHost) {
      this.config.apiEndpoint = emulatorHost.startsWith("http")
        ? emulatorHost
        : `http://${emulatorHost}`;
    }

    // Maximum bytes billed
    const maxBytesBilled = process.env.BIGQUERY_MAX_BYTES_BILLED;
    if (maxBytesBilled) {
      try {
        this.config.maximumBytesBilled = BigInt(maxBytesBilled);
      } catch {
        // Ignore invalid values
      }
    }

    // Query cache
    const useQueryCache = process.env.BIGQUERY_USE_QUERY_CACHE;
    if (useQueryCache !== undefined) {
      this.config.useQueryCache = useQueryCache.toLowerCase() === "true";
    }

    // Legacy SQL
    const useLegacySql = process.env.BIGQUERY_USE_LEGACY_SQL;
    if (useLegacySql !== undefined) {
      this.config.useLegacySql = useLegacySql.toLowerCase() === "true";
    }

    // Logging
    const enableLogging = process.env.BIGQUERY_ENABLE_LOGGING;
    if (enableLogging !== undefined) {
      this.config.enableLogging = enableLogging.toLowerCase() === "true";
    }

    return this;
  }

  /**
   * Build the configuration.
   */
  build(): BigQueryConfig {
    const merged = { ...DEFAULT_CONFIG, ...this.config } as BigQueryConfig;

    // Validate required fields
    if (!merged.projectId) {
      throw new ConfigurationError(
        "Project ID must be specified (set GOOGLE_CLOUD_PROJECT or call projectId())",
        "MissingProject"
      );
    }

    // Validate project ID format
    validateProjectId(merged.projectId);

    // Validate location
    if (merged.location) {
      validateLocation(merged.location);
    }

    // Validate timeout
    if (merged.timeout <= 0) {
      throw new ConfigurationError(
        `Invalid timeout: ${merged.timeout}ms (must be positive)`,
        "InvalidConfig"
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

    // Validate maximum bytes billed if provided
    if (merged.maximumBytesBilled !== undefined && merged.maximumBytesBilled < 0n) {
      throw new ConfigurationError(
        `Invalid maximum bytes billed: ${merged.maximumBytesBilled} (must be non-negative)`,
        "InvalidConfig"
      );
    }

    return merged;
  }
}

/**
 * Create a new BigQuery config builder.
 */
export function configBuilder(): BigQueryConfigBuilder {
  return new BigQueryConfigBuilder();
}

/**
 * Resolve the BigQuery API endpoint.
 */
export function resolveEndpoint(config: BigQueryConfig): string {
  if (config.apiEndpoint) {
    return config.apiEndpoint;
  }
  return "https://bigquery.googleapis.com/bigquery/v2";
}

/**
 * Validate project ID according to GCP requirements.
 */
export function validateProjectId(projectId: string): void {
  if (!projectId) {
    throw new ConfigurationError("Project ID cannot be empty", "InvalidConfig");
  }

  if (projectId.length < 6 || projectId.length > 30) {
    throw new ConfigurationError(
      "Project ID must be 6-30 characters",
      "InvalidConfig"
    );
  }

  // Must start with a letter
  if (!/^[a-z]/.test(projectId)) {
    throw new ConfigurationError(
      "Project ID must start with a lowercase letter",
      "InvalidConfig"
    );
  }

  // Can only contain lowercase letters, numbers, and hyphens
  if (!/^[a-z][a-z0-9-]*$/.test(projectId)) {
    throw new ConfigurationError(
      "Project ID can only contain lowercase letters, numbers, and hyphens",
      "InvalidConfig"
    );
  }

  // Cannot end with a hyphen
  if (projectId.endsWith("-")) {
    throw new ConfigurationError(
      "Project ID cannot end with a hyphen",
      "InvalidConfig"
    );
  }
}

/**
 * Validate dataset ID according to BigQuery requirements.
 */
export function validateDatasetId(datasetId: string): void {
  if (!datasetId) {
    throw new ConfigurationError("Dataset ID cannot be empty", "InvalidConfig");
  }

  if (datasetId.length > 1024) {
    throw new ConfigurationError(
      "Dataset ID cannot exceed 1024 characters",
      "InvalidConfig"
    );
  }

  // Must start with a letter or underscore
  if (!/^[a-zA-Z_]/.test(datasetId)) {
    throw new ConfigurationError(
      "Dataset ID must start with a letter or underscore",
      "InvalidConfig"
    );
  }

  // Can only contain letters, numbers, and underscores
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(datasetId)) {
    throw new ConfigurationError(
      "Dataset ID can only contain letters, numbers, and underscores",
      "InvalidConfig"
    );
  }
}

/**
 * Validate table ID according to BigQuery requirements.
 */
export function validateTableId(tableId: string): void {
  if (!tableId) {
    throw new ConfigurationError("Table ID cannot be empty", "InvalidConfig");
  }

  if (tableId.length > 1024) {
    throw new ConfigurationError(
      "Table ID cannot exceed 1024 characters",
      "InvalidConfig"
    );
  }

  // Must start with a letter, underscore, or number (for date-sharded tables)
  if (!/^[a-zA-Z_0-9]/.test(tableId)) {
    throw new ConfigurationError(
      "Table ID must start with a letter, underscore, or number",
      "InvalidConfig"
    );
  }

  // Can only contain letters, numbers, and underscores
  if (!/^[a-zA-Z0-9_]+$/.test(tableId)) {
    throw new ConfigurationError(
      "Table ID can only contain letters, numbers, and underscores",
      "InvalidConfig"
    );
  }
}

/**
 * Validate location according to BigQuery requirements.
 */
export function validateLocation(location: string): void {
  if (!location) {
    throw new ConfigurationError("Location cannot be empty", "InvalidConfig");
  }

  // Common BigQuery locations (not exhaustive, but covers most cases)
  const validLocations = [
    // Multi-region
    "US",
    "EU",
    // Americas
    "us-central1",
    "us-east1",
    "us-east4",
    "us-west1",
    "us-west2",
    "us-west3",
    "us-west4",
    "northamerica-northeast1",
    "northamerica-northeast2",
    "southamerica-east1",
    "southamerica-west1",
    // Europe
    "europe-central2",
    "europe-north1",
    "europe-southwest1",
    "europe-west1",
    "europe-west2",
    "europe-west3",
    "europe-west4",
    "europe-west6",
    "europe-west8",
    "europe-west9",
    // Asia Pacific
    "asia-east1",
    "asia-east2",
    "asia-northeast1",
    "asia-northeast2",
    "asia-northeast3",
    "asia-south1",
    "asia-south2",
    "asia-southeast1",
    "asia-southeast2",
    "australia-southeast1",
    "australia-southeast2",
    // Middle East
    "me-central1",
    "me-west1",
  ];

  // Accept uppercase/lowercase variations
  const normalizedLocation = location.toUpperCase();
  const normalizedValidLocations = validLocations.map((loc) => loc.toUpperCase());

  if (!normalizedValidLocations.includes(normalizedLocation)) {
    // Don't throw error for unknown locations, just warn (BigQuery may add new regions)
    // This allows flexibility while still validating common cases
    if (!/^[a-z][a-z0-9-]*$/.test(location.toLowerCase())) {
      throw new ConfigurationError(
        `Invalid location format: ${location}`,
        "InvalidConfig"
      );
    }
  }
}

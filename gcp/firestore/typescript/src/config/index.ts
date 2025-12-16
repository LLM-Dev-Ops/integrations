/**
 * Firestore Configuration Module
 *
 * Following the SPARC specification for Google Cloud Firestore integration.
 */

import { ConfigurationError } from "../error/index.js";

/**
 * GCP authentication configuration types.
 */
export type AuthConfig =
  | { type: "default_credentials" }
  | { type: "service_account"; keyFile: string }
  | { type: "service_account_json"; key: ServiceAccountKey }
  | { type: "access_token"; token: string }
  | { type: "emulator" };

/**
 * Service account key structure for GCP authentication.
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
 * Firestore client configuration.
 */
export interface FirestoreConfig {
  /** GCP project ID. */
  project_id: string;
  /** Firestore database ID. Default: "(default)" */
  database_id: string;
  /** GCP authentication configuration. */
  auth?: AuthConfig;
  /** Custom endpoint (for emulator). */
  endpoint?: string;
  /** Use Firestore emulator. Default: false */
  use_emulator: boolean;
  /** Maximum concurrent requests. Default: 100 */
  max_concurrent_requests: number;
  /** Request timeout in milliseconds. Default: 60000 */
  request_timeout_ms: number;
  /** Maximum retry attempts. Default: 3 */
  max_retries: number;
  /** Initial retry backoff in milliseconds. Default: 1000 */
  retry_backoff_ms: number;
  /** Circuit breaker failure threshold. Default: 5 */
  circuit_breaker_threshold: number;
  /** Maximum batch size for batch operations. Default: 500 */
  max_batch_size: number;
  /** Maximum transaction retry attempts. Default: 5 */
  max_transaction_attempts: number;
  /** Listener reconnect delay in milliseconds. Default: 1000 */
  listener_reconnect_ms: number;
  /** Maximum number of active listeners. Default: 100 */
  max_listeners: number;
}

/**
 * Default configuration values for Firestore.
 */
export const DEFAULT_CONFIG: Omit<FirestoreConfig, "project_id"> = {
  database_id: "(default)",
  use_emulator: false,
  max_concurrent_requests: 100,
  request_timeout_ms: 60000,
  max_retries: 3,
  retry_backoff_ms: 1000,
  circuit_breaker_threshold: 5,
  max_batch_size: 500,
  max_transaction_attempts: 5,
  listener_reconnect_ms: 1000,
  max_listeners: 100,
};

/**
 * Firestore configuration builder with fluent API.
 */
export class FirestoreConfigBuilder {
  private config: Partial<FirestoreConfig> = {};

  /**
   * Set the GCP project ID.
   * @param projectId - GCP project ID
   */
  projectId(projectId: string): this {
    if (!projectId || projectId.trim().length === 0) {
      throw new ConfigurationError("Project ID cannot be empty");
    }
    this.config.project_id = projectId.trim();
    return this;
  }

  /**
   * Set the Firestore database ID.
   * @param databaseId - Database ID (default: "(default)")
   */
  databaseId(databaseId: string): this {
    if (!databaseId || databaseId.trim().length === 0) {
      throw new ConfigurationError("Database ID cannot be empty");
    }
    this.config.database_id = databaseId.trim();
    return this;
  }

  /**
   * Set explicit authentication configuration.
   * @param auth - Authentication configuration
   */
  auth(auth: AuthConfig): this {
    this.config.auth = auth;
    return this;
  }

  /**
   * Use default credentials (Application Default Credentials).
   */
  useDefaultCredentials(): this {
    this.config.auth = { type: "default_credentials" };
    return this;
  }

  /**
   * Use service account key file for authentication.
   * @param keyFile - Path to service account key file
   */
  serviceAccountKeyFile(keyFile: string): this {
    if (!keyFile || keyFile.trim().length === 0) {
      throw new ConfigurationError("Key file path cannot be empty");
    }
    this.config.auth = { type: "service_account", keyFile: keyFile.trim() };
    return this;
  }

  /**
   * Use service account key JSON for authentication.
   * @param key - Service account key object
   */
  serviceAccountKey(key: ServiceAccountKey): this {
    this.config.auth = { type: "service_account_json", key };
    return this;
  }

  /**
   * Use access token for authentication.
   * @param token - Access token
   */
  accessToken(token: string): this {
    if (!token || token.trim().length === 0) {
      throw new ConfigurationError("Access token cannot be empty");
    }
    this.config.auth = { type: "access_token", token: token.trim() };
    return this;
  }

  /**
   * Use Firestore emulator authentication.
   */
  useEmulatorAuth(): this {
    this.config.auth = { type: "emulator" };
    return this;
  }

  /**
   * Set custom endpoint (for emulator).
   * @param endpoint - Custom endpoint URL
   */
  endpoint(endpoint: string): this {
    if (!endpoint || endpoint.trim().length === 0) {
      throw new ConfigurationError("Endpoint cannot be empty");
    }
    this.config.endpoint = endpoint.trim();
    return this;
  }

  /**
   * Enable Firestore emulator mode.
   * @param useEmulator - Enable emulator (default: true)
   */
  useEmulator(useEmulator: boolean = true): this {
    this.config.use_emulator = useEmulator;
    if (useEmulator && !this.config.auth) {
      this.config.auth = { type: "emulator" };
    }
    return this;
  }

  /**
   * Set maximum concurrent requests.
   * @param max - Maximum concurrent requests
   */
  maxConcurrentRequests(max: number): this {
    if (max <= 0) {
      throw new ConfigurationError("Max concurrent requests must be positive");
    }
    this.config.max_concurrent_requests = max;
    return this;
  }

  /**
   * Set request timeout in milliseconds.
   * @param timeoutMs - Request timeout
   */
  requestTimeout(timeoutMs: number): this {
    if (timeoutMs <= 0) {
      throw new ConfigurationError("Request timeout must be positive");
    }
    this.config.request_timeout_ms = timeoutMs;
    return this;
  }

  /**
   * Set maximum retry attempts.
   * @param maxRetries - Maximum retries
   */
  maxRetries(maxRetries: number): this {
    if (maxRetries < 0) {
      throw new ConfigurationError("Max retries must be non-negative");
    }
    this.config.max_retries = maxRetries;
    return this;
  }

  /**
   * Set retry backoff delay in milliseconds.
   * @param backoffMs - Retry backoff delay
   */
  retryBackoff(backoffMs: number): this {
    if (backoffMs <= 0) {
      throw new ConfigurationError("Retry backoff must be positive");
    }
    this.config.retry_backoff_ms = backoffMs;
    return this;
  }

  /**
   * Set circuit breaker failure threshold.
   * @param threshold - Failure threshold before opening circuit
   */
  circuitBreakerThreshold(threshold: number): this {
    if (threshold <= 0) {
      throw new ConfigurationError("Circuit breaker threshold must be positive");
    }
    this.config.circuit_breaker_threshold = threshold;
    return this;
  }

  /**
   * Set maximum batch size for batch operations.
   * @param maxSize - Maximum batch size (Firestore limit: 500)
   */
  maxBatchSize(maxSize: number): this {
    if (maxSize <= 0) {
      throw new ConfigurationError("Max batch size must be positive");
    }
    if (maxSize > 500) {
      throw new ConfigurationError("Max batch size cannot exceed 500 (Firestore limit)");
    }
    this.config.max_batch_size = maxSize;
    return this;
  }

  /**
   * Set maximum transaction retry attempts.
   * @param maxAttempts - Maximum transaction attempts
   */
  maxTransactionAttempts(maxAttempts: number): this {
    if (maxAttempts <= 0) {
      throw new ConfigurationError("Max transaction attempts must be positive");
    }
    this.config.max_transaction_attempts = maxAttempts;
    return this;
  }

  /**
   * Set listener reconnect delay in milliseconds.
   * @param reconnectMs - Listener reconnect delay
   */
  listenerReconnect(reconnectMs: number): this {
    if (reconnectMs <= 0) {
      throw new ConfigurationError("Listener reconnect delay must be positive");
    }
    this.config.listener_reconnect_ms = reconnectMs;
    return this;
  }

  /**
   * Set maximum number of active listeners.
   * @param maxListeners - Maximum active listeners
   */
  maxListeners(maxListeners: number): this {
    if (maxListeners <= 0) {
      throw new ConfigurationError("Max listeners must be positive");
    }
    this.config.max_listeners = maxListeners;
    return this;
  }

  /**
   * Load configuration from environment variables.
   *
   * Environment variables:
   * - FIRESTORE_PROJECT_ID or GOOGLE_CLOUD_PROJECT or GCP_PROJECT: Project ID (required)
   * - FIRESTORE_DATABASE_ID: Database ID (default: "(default)")
   * - GOOGLE_APPLICATION_CREDENTIALS: Path to service account key file
   * - FIRESTORE_EMULATOR_HOST: Emulator host (enables emulator mode)
   * - FIRESTORE_MAX_CONCURRENT_REQUESTS: Maximum concurrent requests
   * - FIRESTORE_REQUEST_TIMEOUT_MS: Request timeout in milliseconds
   * - FIRESTORE_MAX_RETRIES: Maximum retry attempts
   * - FIRESTORE_RETRY_BACKOFF_MS: Retry backoff delay in milliseconds
   * - FIRESTORE_CIRCUIT_BREAKER_THRESHOLD: Circuit breaker threshold
   * - FIRESTORE_MAX_BATCH_SIZE: Maximum batch size
   * - FIRESTORE_MAX_TRANSACTION_ATTEMPTS: Maximum transaction attempts
   * - FIRESTORE_LISTENER_RECONNECT_MS: Listener reconnect delay
   * - FIRESTORE_MAX_LISTENERS: Maximum active listeners
   */
  fromEnv(): this {
    // Project ID
    const projectId =
      process.env.FIRESTORE_PROJECT_ID ??
      process.env.GOOGLE_CLOUD_PROJECT ??
      process.env.GCLOUD_PROJECT ??
      process.env.GCP_PROJECT;
    if (projectId) {
      this.config.project_id = projectId;
    }

    // Database ID
    const databaseId = process.env.FIRESTORE_DATABASE_ID;
    if (databaseId) {
      this.config.database_id = databaseId;
    }

    // Credentials file
    const credentialsFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (credentialsFile && !this.config.use_emulator) {
      this.config.auth = { type: "service_account", keyFile: credentialsFile };
    }

    // Emulator host
    const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
    if (emulatorHost) {
      this.config.use_emulator = true;
      this.config.endpoint = emulatorHost.startsWith("http")
        ? emulatorHost
        : `http://${emulatorHost}`;
      this.config.auth = { type: "emulator" };
    }

    // Max concurrent requests
    const maxConcurrentRequests = process.env.FIRESTORE_MAX_CONCURRENT_REQUESTS;
    if (maxConcurrentRequests) {
      this.config.max_concurrent_requests = parseInt(maxConcurrentRequests, 10);
    }

    // Request timeout
    const requestTimeout = process.env.FIRESTORE_REQUEST_TIMEOUT_MS;
    if (requestTimeout) {
      this.config.request_timeout_ms = parseInt(requestTimeout, 10);
    }

    // Max retries
    const maxRetries = process.env.FIRESTORE_MAX_RETRIES;
    if (maxRetries) {
      this.config.max_retries = parseInt(maxRetries, 10);
    }

    // Retry backoff
    const retryBackoff = process.env.FIRESTORE_RETRY_BACKOFF_MS;
    if (retryBackoff) {
      this.config.retry_backoff_ms = parseInt(retryBackoff, 10);
    }

    // Circuit breaker threshold
    const circuitBreakerThreshold = process.env.FIRESTORE_CIRCUIT_BREAKER_THRESHOLD;
    if (circuitBreakerThreshold) {
      this.config.circuit_breaker_threshold = parseInt(circuitBreakerThreshold, 10);
    }

    // Max batch size
    const maxBatchSize = process.env.FIRESTORE_MAX_BATCH_SIZE;
    if (maxBatchSize) {
      this.config.max_batch_size = parseInt(maxBatchSize, 10);
    }

    // Max transaction attempts
    const maxTransactionAttempts = process.env.FIRESTORE_MAX_TRANSACTION_ATTEMPTS;
    if (maxTransactionAttempts) {
      this.config.max_transaction_attempts = parseInt(maxTransactionAttempts, 10);
    }

    // Listener reconnect delay
    const listenerReconnect = process.env.FIRESTORE_LISTENER_RECONNECT_MS;
    if (listenerReconnect) {
      this.config.listener_reconnect_ms = parseInt(listenerReconnect, 10);
    }

    // Max listeners
    const maxListeners = process.env.FIRESTORE_MAX_LISTENERS;
    if (maxListeners) {
      this.config.max_listeners = parseInt(maxListeners, 10);
    }

    return this;
  }

  /**
   * Build the configuration.
   * @throws ConfigurationError if required fields are missing or invalid
   */
  build(): FirestoreConfig {
    const merged = { ...DEFAULT_CONFIG, ...this.config } as FirestoreConfig;

    // Validate required fields
    if (!merged.project_id) {
      throw new ConfigurationError(
        "Project ID must be specified (set FIRESTORE_PROJECT_ID/GOOGLE_CLOUD_PROJECT or call projectId())"
      );
    }

    // Validate endpoint if provided
    if (merged.endpoint) {
      try {
        new URL(merged.endpoint);
      } catch {
        throw new ConfigurationError(`Invalid endpoint URL: ${merged.endpoint}`);
      }
    }

    // Validate numeric constraints
    if (merged.max_concurrent_requests <= 0) {
      throw new ConfigurationError("Max concurrent requests must be positive");
    }
    if (merged.request_timeout_ms <= 0) {
      throw new ConfigurationError("Request timeout must be positive");
    }
    if (merged.max_retries < 0) {
      throw new ConfigurationError("Max retries must be non-negative");
    }
    if (merged.retry_backoff_ms <= 0) {
      throw new ConfigurationError("Retry backoff must be positive");
    }
    if (merged.circuit_breaker_threshold <= 0) {
      throw new ConfigurationError("Circuit breaker threshold must be positive");
    }
    if (merged.max_batch_size <= 0 || merged.max_batch_size > 500) {
      throw new ConfigurationError("Max batch size must be between 1 and 500 (Firestore limit)");
    }
    if (merged.max_transaction_attempts <= 0) {
      throw new ConfigurationError("Max transaction attempts must be positive");
    }
    if (merged.listener_reconnect_ms <= 0) {
      throw new ConfigurationError("Listener reconnect delay must be positive");
    }
    if (merged.max_listeners <= 0) {
      throw new ConfigurationError("Max listeners must be positive");
    }

    return merged;
  }
}

/**
 * Create a new Firestore configuration builder.
 * @returns New FirestoreConfigBuilder instance
 */
export function configBuilder(): FirestoreConfigBuilder {
  return new FirestoreConfigBuilder();
}

/**
 * Validate a Firestore configuration object.
 * @param config - Configuration to validate
 * @throws ConfigurationError if configuration is invalid
 */
export function validateConfig(config: FirestoreConfig): void {
  if (!config.project_id || config.project_id.trim().length === 0) {
    throw new ConfigurationError("Project ID is required");
  }
  if (!config.database_id || config.database_id.trim().length === 0) {
    throw new ConfigurationError("Database ID is required");
  }
  if (config.max_concurrent_requests <= 0) {
    throw new ConfigurationError("Max concurrent requests must be positive");
  }
  if (config.request_timeout_ms <= 0) {
    throw new ConfigurationError("Request timeout must be positive");
  }
  if (config.max_retries < 0) {
    throw new ConfigurationError("Max retries must be non-negative");
  }
  if (config.retry_backoff_ms <= 0) {
    throw new ConfigurationError("Retry backoff must be positive");
  }
  if (config.circuit_breaker_threshold <= 0) {
    throw new ConfigurationError("Circuit breaker threshold must be positive");
  }
  if (config.max_batch_size <= 0 || config.max_batch_size > 500) {
    throw new ConfigurationError("Max batch size must be between 1 and 500");
  }
  if (config.max_transaction_attempts <= 0) {
    throw new ConfigurationError("Max transaction attempts must be positive");
  }
  if (config.listener_reconnect_ms <= 0) {
    throw new ConfigurationError("Listener reconnect delay must be positive");
  }
  if (config.max_listeners <= 0) {
    throw new ConfigurationError("Max listeners must be positive");
  }
  if (config.endpoint) {
    try {
      new URL(config.endpoint);
    } catch {
      throw new ConfigurationError(`Invalid endpoint URL: ${config.endpoint}`);
    }
  }
}

/**
 * Validate a collection path according to Firestore requirements.
 * @param path - Collection path to validate
 * @throws ConfigurationError if path is invalid
 */
export function validateCollectionPath(path: string): void {
  if (!path || path.trim().length === 0) {
    throw new ConfigurationError("Collection path cannot be empty");
  }

  const trimmed = path.trim();
  const segments = trimmed.split("/");

  // Collection path must have odd number of segments
  if (segments.length % 2 === 0) {
    throw new ConfigurationError(
      `Collection path must have odd number of segments: ${trimmed}`
    );
  }

  // Validate each segment
  for (const segment of segments) {
    if (!segment || segment.length === 0) {
      throw new ConfigurationError(`Collection path cannot contain empty segments: ${trimmed}`);
    }
    if (segment.startsWith("__") && segment.endsWith("__")) {
      throw new ConfigurationError(
        `Collection path segments cannot start and end with '__': ${segment}`
      );
    }
  }
}

/**
 * Validate a document path according to Firestore requirements.
 * @param path - Document path to validate
 * @throws ConfigurationError if path is invalid
 */
export function validateDocumentPath(path: string): void {
  if (!path || path.trim().length === 0) {
    throw new ConfigurationError("Document path cannot be empty");
  }

  const trimmed = path.trim();
  const segments = trimmed.split("/");

  // Document path must have even number of segments
  if (segments.length % 2 !== 0) {
    throw new ConfigurationError(`Document path must have even number of segments: ${trimmed}`);
  }

  // Validate each segment
  for (const segment of segments) {
    if (!segment || segment.length === 0) {
      throw new ConfigurationError(`Document path cannot contain empty segments: ${trimmed}`);
    }
    if (segment.startsWith("__") && segment.endsWith("__")) {
      throw new ConfigurationError(
        `Document path segments cannot start and end with '__': ${segment}`
      );
    }
  }
}

/**
 * Validate a field path according to Firestore requirements.
 * @param path - Field path to validate
 * @throws ConfigurationError if path is invalid
 */
export function validateFieldPath(path: string): void {
  if (!path || path.trim().length === 0) {
    throw new ConfigurationError("Field path cannot be empty");
  }

  const trimmed = path.trim();

  // Field path cannot start or end with a dot
  if (trimmed.startsWith(".") || trimmed.endsWith(".")) {
    throw new ConfigurationError(`Field path cannot start or end with '.': ${trimmed}`);
  }

  // Field path cannot have consecutive dots
  if (trimmed.includes("..")) {
    throw new ConfigurationError(`Field path cannot contain consecutive dots: ${trimmed}`);
  }

  // Check field path depth (Firestore has practical limits)
  const segments = trimmed.split(".");
  if (segments.length > 20) {
    throw new ConfigurationError(
      `Field path is too deep (max 20 levels): ${trimmed} has ${segments.length} levels`
    );
  }

  // Validate each segment
  for (const segment of segments) {
    if (!segment || segment.length === 0) {
      throw new ConfigurationError(`Field path cannot contain empty segments: ${trimmed}`);
    }
  }
}

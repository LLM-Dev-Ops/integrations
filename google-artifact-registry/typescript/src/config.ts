/**
 * Configuration types for Google Artifact Registry client.
 * @module config
 */

import { z } from 'zod';
import { ArtifactRegistryError, ArtifactRegistryErrorKind } from './errors.js';

/**
 * Default API endpoint for Artifact Registry.
 */
export const DEFAULT_API_ENDPOINT = 'https://artifactregistry.googleapis.com';

/**
 * Default API version.
 */
export const DEFAULT_API_VERSION = 'v1';

/**
 * Default request timeout in milliseconds.
 */
export const DEFAULT_TIMEOUT = 30000;

/**
 * Default connect timeout in milliseconds.
 */
export const DEFAULT_CONNECT_TIMEOUT = 10000;

/**
 * Default User-Agent header.
 */
export const DEFAULT_USER_AGENT = 'google-artifact-registry-ts/1.0.0';

/**
 * Retry configuration.
 */
export interface RetryConfig {
  /** Maximum retry attempts */
  maxAttempts: number;
  /** Initial backoff delay in milliseconds */
  initialBackoff: number;
  /** Maximum backoff delay in milliseconds */
  maxBackoff: number;
  /** Backoff multiplier */
  multiplier: number;
  /** Jitter factor (0.0 to 1.0) */
  jitter: number;
  /** Enable retries */
  enabled: boolean;
}

/**
 * Default retry configuration.
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialBackoff: 1000,
  maxBackoff: 60000,
  multiplier: 2.0,
  jitter: 0.1,
  enabled: true,
};

/**
 * Circuit breaker configuration.
 */
export interface CircuitBreakerConfig {
  /** Failure threshold to open circuit */
  failureThreshold: number;
  /** Success threshold to close circuit */
  successThreshold: number;
  /** Reset timeout when circuit is open (in milliseconds) */
  resetTimeout: number;
  /** Enable circuit breaker */
  enabled: boolean;
}

/**
 * Default circuit breaker configuration.
 */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  resetTimeout: 30000,
  enabled: true,
};

/**
 * Upload configuration for blob operations.
 */
export interface UploadConfig {
  /** Chunk size for chunked uploads (bytes) */
  chunkSize: number;
  /** Threshold for using chunked upload (bytes) */
  chunkedThreshold: number;
  /** Maximum concurrent uploads */
  maxConcurrent: number;
}

/**
 * Default upload configuration.
 */
export const DEFAULT_UPLOAD_CONFIG: UploadConfig = {
  chunkSize: 5 * 1024 * 1024, // 5MB
  chunkedThreshold: 10 * 1024 * 1024, // 10MB
  maxConcurrent: 5,
};

/**
 * Download configuration for blob operations.
 */
export interface DownloadConfig {
  /** Maximum concurrent downloads */
  maxConcurrent: number;
  /** Buffer size for streaming downloads (bytes) */
  bufferSize: number;
}

/**
 * Default download configuration.
 */
export const DEFAULT_DOWNLOAD_CONFIG: DownloadConfig = {
  maxConcurrent: 10,
  bufferSize: 1024 * 1024, // 1MB
};

/**
 * Authentication method types.
 */
export type AuthMethod =
  | { type: 'service_account'; keyPath?: string; keyJson?: string }
  | { type: 'workload_identity'; serviceAccount?: string }
  | { type: 'adc' }
  | { type: 'access_token'; token: string };

/**
 * Artifact Registry client configuration.
 */
export interface ArtifactRegistryConfig {
  /** GCP project ID */
  projectId: string;
  /** Default location (e.g., "us-central1", "us") */
  defaultLocation?: string;
  /** API endpoint */
  apiEndpoint: string;
  /** Authentication method */
  auth?: AuthMethod;
  /** Request timeout in milliseconds */
  timeout: number;
  /** Connect timeout in milliseconds */
  connectTimeout: number;
  /** User-Agent header */
  userAgent: string;
  /** Retry configuration */
  retry: RetryConfig;
  /** Circuit breaker configuration */
  circuitBreaker: CircuitBreakerConfig;
  /** Upload configuration */
  upload: UploadConfig;
  /** Download configuration */
  download: DownloadConfig;
}

/**
 * Zod schema for URL validation.
 */
const urlSchema = z.string().url();

/**
 * Creates a default configuration.
 */
export function createDefaultConfig(projectId: string): ArtifactRegistryConfig {
  return {
    projectId,
    defaultLocation: 'us',
    apiEndpoint: DEFAULT_API_ENDPOINT,
    auth: { type: 'adc' },
    timeout: DEFAULT_TIMEOUT,
    connectTimeout: DEFAULT_CONNECT_TIMEOUT,
    userAgent: DEFAULT_USER_AGENT,
    retry: DEFAULT_RETRY_CONFIG,
    circuitBreaker: DEFAULT_CIRCUIT_BREAKER_CONFIG,
    upload: DEFAULT_UPLOAD_CONFIG,
    download: DEFAULT_DOWNLOAD_CONFIG,
  };
}

/**
 * Validates a configuration.
 */
export function validateConfig(config: ArtifactRegistryConfig): void {
  if (!config.projectId || config.projectId.trim() === '') {
    throw new ArtifactRegistryError(
      ArtifactRegistryErrorKind.InvalidProject,
      'Project ID cannot be empty'
    );
  }

  // Validate project ID format (GCP project ID rules)
  const projectIdPattern = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
  if (!projectIdPattern.test(config.projectId)) {
    throw new ArtifactRegistryError(
      ArtifactRegistryErrorKind.InvalidProject,
      'Invalid project ID format'
    );
  }

  if (config.apiEndpoint) {
    const urlResult = urlSchema.safeParse(config.apiEndpoint);
    if (!urlResult.success) {
      throw new ArtifactRegistryError(
        ArtifactRegistryErrorKind.InvalidConfiguration,
        `Invalid API endpoint URL: ${config.apiEndpoint}`
      );
    }
  }

  if (config.timeout <= 0) {
    throw new ArtifactRegistryError(
      ArtifactRegistryErrorKind.InvalidConfiguration,
      'Timeout must be greater than 0'
    );
  }

  if (config.connectTimeout <= 0) {
    throw new ArtifactRegistryError(
      ArtifactRegistryErrorKind.InvalidConfiguration,
      'Connect timeout must be greater than 0'
    );
  }
}

/**
 * Creates configuration from environment variables.
 */
export function configFromEnv(): ArtifactRegistryConfig {
  const projectId =
    process.env['GAR_PROJECT_ID'] ||
    process.env['GOOGLE_CLOUD_PROJECT'] ||
    process.env['GCLOUD_PROJECT'];

  if (!projectId) {
    throw new ArtifactRegistryError(
      ArtifactRegistryErrorKind.InvalidConfiguration,
      'Project ID not found in environment. Set GAR_PROJECT_ID, GOOGLE_CLOUD_PROJECT, or GCLOUD_PROJECT'
    );
  }

  const config = createDefaultConfig(projectId);

  // Override with environment variables
  if (process.env['GAR_LOCATION']) {
    config.defaultLocation = process.env['GAR_LOCATION'];
  }

  if (process.env['GAR_API_ENDPOINT']) {
    config.apiEndpoint = process.env['GAR_API_ENDPOINT'];
  }

  if (process.env['GAR_TIMEOUT_SECONDS']) {
    const timeout = parseInt(process.env['GAR_TIMEOUT_SECONDS'], 10);
    if (!isNaN(timeout) && timeout > 0) {
      config.timeout = timeout * 1000;
    }
  }

  // Determine auth method
  const serviceAccountKey = process.env['GAR_SERVICE_ACCOUNT_KEY'];
  const googleCredentials = process.env['GOOGLE_APPLICATION_CREDENTIALS'];

  if (serviceAccountKey) {
    config.auth = { type: 'service_account', keyJson: serviceAccountKey };
  } else if (googleCredentials) {
    config.auth = { type: 'service_account', keyPath: googleCredentials };
  } else {
    config.auth = { type: 'adc' };
  }

  // Retry configuration
  if (process.env['GAR_RETRY_MAX_ATTEMPTS']) {
    const maxAttempts = parseInt(process.env['GAR_RETRY_MAX_ATTEMPTS'], 10);
    if (!isNaN(maxAttempts)) {
      config.retry.maxAttempts = maxAttempts;
    }
  }

  if (process.env['GAR_RETRY_BASE_DELAY_MS']) {
    const baseDelay = parseInt(process.env['GAR_RETRY_BASE_DELAY_MS'], 10);
    if (!isNaN(baseDelay)) {
      config.retry.initialBackoff = baseDelay;
    }
  }

  // Circuit breaker configuration
  if (process.env['GAR_CIRCUIT_BREAKER_THRESHOLD']) {
    const threshold = parseInt(process.env['GAR_CIRCUIT_BREAKER_THRESHOLD'], 10);
    if (!isNaN(threshold)) {
      config.circuitBreaker.failureThreshold = threshold;
    }
  }

  if (process.env['GAR_CIRCUIT_BREAKER_RESET_MS']) {
    const resetMs = parseInt(process.env['GAR_CIRCUIT_BREAKER_RESET_MS'], 10);
    if (!isNaN(resetMs)) {
      config.circuitBreaker.resetTimeout = resetMs;
    }
  }

  return config;
}

/**
 * Builder for ArtifactRegistryConfig.
 */
export class ArtifactRegistryConfigBuilder {
  private config: ArtifactRegistryConfig;

  constructor(projectId: string) {
    this.config = createDefaultConfig(projectId);
  }

  /**
   * Sets the default location.
   */
  location(location: string): this {
    this.config.defaultLocation = location;
    return this;
  }

  /**
   * Sets the API endpoint.
   */
  apiEndpoint(endpoint: string): this {
    this.config.apiEndpoint = endpoint;
    return this;
  }

  /**
   * Sets the authentication method.
   */
  auth(auth: AuthMethod): this {
    this.config.auth = auth;
    return this;
  }

  /**
   * Sets service account authentication from a key file path.
   */
  serviceAccountKey(keyPath: string): this {
    this.config.auth = { type: 'service_account', keyPath };
    return this;
  }

  /**
   * Sets service account authentication from JSON string.
   */
  serviceAccountJson(keyJson: string): this {
    this.config.auth = { type: 'service_account', keyJson };
    return this;
  }

  /**
   * Sets workload identity authentication.
   */
  workloadIdentity(serviceAccount?: string): this {
    this.config.auth = { type: 'workload_identity', serviceAccount };
    return this;
  }

  /**
   * Sets access token authentication.
   */
  accessToken(token: string): this {
    this.config.auth = { type: 'access_token', token };
    return this;
  }

  /**
   * Sets the request timeout.
   */
  timeout(timeoutMs: number): this {
    this.config.timeout = timeoutMs;
    return this;
  }

  /**
   * Sets the connect timeout.
   */
  connectTimeout(timeoutMs: number): this {
    this.config.connectTimeout = timeoutMs;
    return this;
  }

  /**
   * Sets the User-Agent header.
   */
  userAgent(userAgent: string): this {
    this.config.userAgent = userAgent;
    return this;
  }

  /**
   * Sets the retry configuration.
   */
  retry(config: Partial<RetryConfig>): this {
    this.config.retry = { ...this.config.retry, ...config };
    return this;
  }

  /**
   * Disables retries.
   */
  noRetry(): this {
    this.config.retry.enabled = false;
    return this;
  }

  /**
   * Sets the circuit breaker configuration.
   */
  circuitBreaker(config: Partial<CircuitBreakerConfig>): this {
    this.config.circuitBreaker = { ...this.config.circuitBreaker, ...config };
    return this;
  }

  /**
   * Disables circuit breaker.
   */
  noCircuitBreaker(): this {
    this.config.circuitBreaker.enabled = false;
    return this;
  }

  /**
   * Sets the upload configuration.
   */
  upload(config: Partial<UploadConfig>): this {
    this.config.upload = { ...this.config.upload, ...config };
    return this;
  }

  /**
   * Sets the download configuration.
   */
  download(config: Partial<DownloadConfig>): this {
    this.config.download = { ...this.config.download, ...config };
    return this;
  }

  /**
   * Builds and validates the configuration.
   */
  build(): ArtifactRegistryConfig {
    validateConfig(this.config);
    return { ...this.config };
  }
}

/**
 * Namespace for ArtifactRegistryConfig utilities.
 */
export namespace ArtifactRegistryConfig {
  /**
   * Creates a new configuration builder.
   */
  export function builder(projectId: string): ArtifactRegistryConfigBuilder {
    return new ArtifactRegistryConfigBuilder(projectId);
  }

  /**
   * Creates configuration from environment variables.
   */
  export function fromEnv(): ArtifactRegistryConfig {
    return configFromEnv();
  }

  /**
   * Creates a default configuration.
   */
  export function defaultConfig(projectId: string): ArtifactRegistryConfig {
    return createDefaultConfig(projectId);
  }

  /**
   * Validates a configuration.
   */
  export function validate(config: ArtifactRegistryConfig): void {
    validateConfig(config);
  }
}

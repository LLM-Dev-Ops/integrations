/**
 * Azure Files Configuration Module
 *
 * Following the SPARC specification for Azure Files integration.
 */

import { ConfigurationError } from "../errors.js";

/** Azure Files API version */
export const API_VERSION = "2023-11-03";

/** Default range size for chunked operations (4MB) */
export const DEFAULT_RANGE_SIZE = 4 * 1024 * 1024;

/**
 * Azure credentials type.
 */
export type AzureCredentials =
  | { type: "shared_key"; accountName: string; accountKey: string }
  | { type: "sas_token"; token: string }
  | { type: "connection_string"; connectionString: string };

/**
 * Retry configuration.
 */
export interface RetryConfig {
  /** Maximum number of retry attempts. */
  maxAttempts: number;
  /** Base delay in milliseconds. */
  baseDelayMs: number;
  /** Maximum delay in milliseconds. */
  maxDelayMs: number;
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
  resetTimeoutMs: number;
}

/**
 * Timeout configuration per operation type.
 */
export interface TimeoutConfig {
  /** Small file read timeout (< 4MB) in ms. */
  smallFileRead: number;
  /** Large file read timeout (>= 4MB) in ms. */
  largeFileRead: number;
  /** File write timeout in ms. */
  fileWrite: number;
  /** Directory operations timeout in ms. */
  directoryOps: number;
  /** Lease operations timeout in ms. */
  leaseOps: number;
}

/**
 * Azure Files client configuration.
 */
export interface AzureFilesConfig {
  /** Azure storage account name. */
  accountName: string;
  /** Azure credentials. */
  credentials: AzureCredentials;
  /** Default share name (optional). */
  defaultShare?: string;
  /** Retry configuration. */
  retryConfig: RetryConfig;
  /** Circuit breaker configuration. */
  circuitBreakerConfig: CircuitBreakerConfig;
  /** Timeout configuration. */
  timeoutConfig: TimeoutConfig;
  /** Range size for chunked operations (default: 4MB). */
  rangeSize: number;
  /** Custom API endpoint (for emulators like Azurite). */
  apiEndpoint?: string;
  /** Enable request logging. */
  enableLogging: boolean;
}

/**
 * Default retry configuration.
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  multiplier: 2,
};

/**
 * Default circuit breaker configuration.
 */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  resetTimeoutMs: 30000,
};

/**
 * Default timeout configuration.
 */
export const DEFAULT_TIMEOUT_CONFIG: TimeoutConfig = {
  smallFileRead: 30000,
  largeFileRead: 300000,
  fileWrite: 300000,
  directoryOps: 30000,
  leaseOps: 10000,
};

/**
 * Default configuration values.
 */
export const DEFAULT_CONFIG: Omit<AzureFilesConfig, "accountName" | "credentials"> = {
  retryConfig: DEFAULT_RETRY_CONFIG,
  circuitBreakerConfig: DEFAULT_CIRCUIT_BREAKER_CONFIG,
  timeoutConfig: DEFAULT_TIMEOUT_CONFIG,
  rangeSize: DEFAULT_RANGE_SIZE,
  enableLogging: false,
};

/**
 * Azure Files configuration builder.
 */
export class AzureFilesConfigBuilder {
  private config: Partial<AzureFilesConfig> = {};

  /**
   * Set the Azure storage account name.
   */
  accountName(name: string): this {
    this.config.accountName = name;
    return this;
  }

  /**
   * Set explicit credentials.
   */
  credentials(credentials: AzureCredentials): this {
    this.config.credentials = credentials;
    return this;
  }

  /**
   * Use shared key authentication.
   */
  sharedKey(accountName: string, accountKey: string): this {
    this.config.accountName = accountName;
    this.config.credentials = { type: "shared_key", accountName, accountKey };
    return this;
  }

  /**
   * Use SAS token authentication.
   */
  sasToken(token: string): this {
    this.config.credentials = { type: "sas_token", token };
    return this;
  }

  /**
   * Use connection string authentication.
   */
  connectionString(connectionString: string): this {
    this.config.credentials = { type: "connection_string", connectionString };
    // Parse account name from connection string
    const accountMatch = connectionString.match(/AccountName=([^;]+)/);
    if (accountMatch) {
      this.config.accountName = accountMatch[1];
    }
    return this;
  }

  /**
   * Set default share name.
   */
  defaultShare(share: string): this {
    this.config.defaultShare = share;
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
   * Set timeout configuration.
   */
  timeoutConfig(config: TimeoutConfig): this {
    this.config.timeoutConfig = config;
    return this;
  }

  /**
   * Set range size for chunked operations.
   */
  rangeSize(size: number): this {
    this.config.rangeSize = size;
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
    // Account name
    const accountName = process.env.AZURE_STORAGE_ACCOUNT;
    if (accountName) {
      this.config.accountName = accountName;
    }

    // Account key
    const accountKey = process.env.AZURE_STORAGE_KEY;
    if (accountName && accountKey) {
      this.config.credentials = {
        type: "shared_key",
        accountName,
        accountKey,
      };
    }

    // Connection string
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    if (connectionString) {
      this.connectionString(connectionString);
    }

    // SAS token
    const sasToken = process.env.AZURE_STORAGE_SAS_TOKEN;
    if (sasToken) {
      this.config.credentials = { type: "sas_token", token: sasToken };
    }

    // Default share
    const defaultShare = process.env.AZURE_FILES_SHARE;
    if (defaultShare) {
      this.config.defaultShare = defaultShare;
    }

    // Emulator endpoint (Azurite)
    const emulatorHost = process.env.AZURITE_FILES_HOST;
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
  build(): AzureFilesConfig {
    const merged = { ...DEFAULT_CONFIG, ...this.config } as AzureFilesConfig;

    // Validate required fields
    if (!merged.accountName) {
      throw new ConfigurationError(
        "Account name must be specified (set AZURE_STORAGE_ACCOUNT or call accountName())",
        "InvalidAccountName"
      );
    }

    if (!merged.credentials) {
      throw new ConfigurationError(
        "Credentials must be specified (set AZURE_STORAGE_KEY, AZURE_STORAGE_CONNECTION_STRING, or call credentials())",
        "MissingCredentials"
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
 * Create a new Azure Files config builder.
 */
export function configBuilder(): AzureFilesConfigBuilder {
  return new AzureFilesConfigBuilder();
}

/**
 * Resolve the Azure Files API endpoint.
 */
export function resolveEndpoint(config: AzureFilesConfig): string {
  if (config.apiEndpoint) {
    return config.apiEndpoint;
  }
  return `https://${config.accountName}.file.core.windows.net`;
}

/**
 * Validate share name according to Azure Files requirements.
 */
export function validateShareName(share: string): void {
  if (!share) {
    throw new ConfigurationError("Share name cannot be empty", "InvalidShareName");
  }

  if (share.length < 3 || share.length > 63) {
    throw new ConfigurationError(
      "Share name must be 3-63 characters",
      "InvalidShareName"
    );
  }

  // Must be lowercase letters, numbers, and hyphens only
  if (!/^[a-z0-9-]+$/.test(share)) {
    throw new ConfigurationError(
      "Share name can only contain lowercase letters, numbers, and hyphens",
      "InvalidShareName"
    );
  }

  // Cannot start or end with hyphen
  if (share.startsWith("-") || share.endsWith("-")) {
    throw new ConfigurationError(
      "Share name cannot start or end with a hyphen",
      "InvalidShareName"
    );
  }

  // Cannot have consecutive hyphens
  if (share.includes("--")) {
    throw new ConfigurationError(
      "Share name cannot have consecutive hyphens",
      "InvalidShareName"
    );
  }
}

/**
 * Validate file/directory path according to Azure Files requirements.
 */
export function validatePath(path: string): void {
  if (!path) {
    throw new ConfigurationError("Path cannot be empty", "InvalidPath");
  }

  if (path.length > 2048) {
    throw new ConfigurationError(
      "Path cannot exceed 2048 characters",
      "InvalidPath"
    );
  }

  // Cannot contain certain characters
  const invalidChars = /["\\/:|<>*?]/;
  if (invalidChars.test(path)) {
    throw new ConfigurationError(
      'Path cannot contain the following characters: " \\ / : | < > * ?',
      "InvalidPath"
    );
  }
}

/**
 * URL-encode a path for use in Azure Files API.
 */
export function encodePath(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

/**
 * Get timeout for an operation based on file size.
 */
export function getTimeout(config: AzureFilesConfig, operation: "read" | "write" | "directory" | "lease", fileSize?: number): number {
  switch (operation) {
    case "read":
      if (fileSize !== undefined && fileSize >= config.rangeSize) {
        return config.timeoutConfig.largeFileRead;
      }
      return config.timeoutConfig.smallFileRead;
    case "write":
      return config.timeoutConfig.fileWrite;
    case "directory":
      return config.timeoutConfig.directoryOps;
    case "lease":
      return config.timeoutConfig.leaseOps;
  }
}

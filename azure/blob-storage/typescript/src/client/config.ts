/**
 * Azure Blob Storage Configuration
 *
 * Configuration types and builder for BlobStorageClient.
 */

import type { AzureAdCredentials } from '../auth/index.js';

/** Simulation mode configuration */
export type SimulationMode =
  | { type: 'disabled' }
  | { type: 'recording'; path: string }
  | { type: 'replay'; path: string };

/** Retry configuration */
export interface RetryConfig {
  /** Maximum retry attempts (default: 3) */
  maxRetries: number;
  /** Initial backoff in milliseconds (default: 1000) */
  initialBackoffMs: number;
  /** Maximum backoff in milliseconds (default: 30000) */
  maxBackoffMs: number;
  /** Backoff multiplier (default: 2.0) */
  backoffMultiplier: number;
}

/** Blob Storage client configuration */
export interface BlobStorageConfig {
  /** Azure Storage account name */
  accountName: string;
  /** Default container name */
  defaultContainer?: string;
  /** Custom endpoint (for emulator or private endpoints) */
  endpoint?: string;
  /** Connection string (alternative to accountName + auth) */
  connectionString?: string;
  /** Storage account key */
  accountKey?: string;
  /** SAS token */
  sasToken?: string;
  /** Azure AD credentials */
  azureAdCredentials?: AzureAdCredentials;
  /** Request timeout in milliseconds (default: 300000 = 5 min) */
  timeout?: number;
  /** Chunk size for uploads/downloads in bytes (default: 4MB) */
  chunkSize?: number;
  /** Maximum concurrent operations (default: 8) */
  maxConcurrency?: number;
  /** Retry configuration */
  retry?: Partial<RetryConfig>;
  /** Simulation mode */
  simulationMode?: SimulationMode;
}

/** Normalized configuration with all defaults applied */
export interface NormalizedBlobStorageConfig {
  accountName: string;
  defaultContainer?: string;
  endpoint: string;
  timeout: number;
  chunkSize: number;
  maxConcurrency: number;
  retry: RetryConfig;
  simulationMode: SimulationMode;
}

/** Default configuration values */
export const DEFAULT_CONFIG = {
  timeout: 300000, // 5 minutes
  chunkSize: 4 * 1024 * 1024, // 4 MB
  maxConcurrency: 8,
  retry: {
    maxRetries: 3,
    initialBackoffMs: 1000,
    maxBackoffMs: 30000,
    backoffMultiplier: 2.0,
  },
  simulationMode: { type: 'disabled' as const },
} as const;

/** Minimum chunk size (1 MB) */
export const MIN_CHUNK_SIZE = 1 * 1024 * 1024;

/** Maximum chunk size (4000 MB) */
export const MAX_CHUNK_SIZE = 4000 * 1024 * 1024;

/** Maximum blob name length */
export const MAX_BLOB_NAME_LENGTH = 1024;

/** Simple upload size limit (256 MB) */
export const SIMPLE_UPLOAD_LIMIT = 256 * 1024 * 1024;

/**
 * Normalize configuration with defaults
 */
export function normalizeConfig(config: BlobStorageConfig): NormalizedBlobStorageConfig {
  // Validate account name
  if (!config.accountName && !config.connectionString) {
    throw new Error('Either accountName or connectionString is required');
  }

  // Extract account name from connection string if needed
  let accountName = config.accountName;
  if (!accountName && config.connectionString) {
    const match = config.connectionString.match(/AccountName=([^;]+)/);
    accountName = match?.[1] ?? '';
  }

  if (!accountName) {
    throw new Error('Could not determine account name');
  }

  // Validate chunk size
  const chunkSize = config.chunkSize ?? DEFAULT_CONFIG.chunkSize;
  if (chunkSize < MIN_CHUNK_SIZE || chunkSize > MAX_CHUNK_SIZE) {
    throw new Error(`Chunk size must be between ${MIN_CHUNK_SIZE} and ${MAX_CHUNK_SIZE} bytes`);
  }

  // Build endpoint
  let endpoint = config.endpoint;
  if (!endpoint) {
    // Check for custom endpoint in connection string
    if (config.connectionString) {
      const match = config.connectionString.match(/BlobEndpoint=([^;]+)/);
      endpoint = match?.[1];
    }
    // Default to Azure public endpoint
    if (!endpoint) {
      endpoint = `https://${accountName}.blob.core.windows.net`;
    }
  }

  return {
    accountName,
    defaultContainer: config.defaultContainer,
    endpoint,
    timeout: config.timeout ?? DEFAULT_CONFIG.timeout,
    chunkSize,
    maxConcurrency: config.maxConcurrency ?? DEFAULT_CONFIG.maxConcurrency,
    retry: {
      ...DEFAULT_CONFIG.retry,
      ...config.retry,
    },
    simulationMode: config.simulationMode ?? DEFAULT_CONFIG.simulationMode,
  };
}

/**
 * Configuration builder for fluent API
 */
export class BlobStorageConfigBuilder {
  private config: Partial<BlobStorageConfig> = {};

  /**
   * Create builder with account name
   */
  constructor(accountName?: string) {
    if (accountName) {
      this.config.accountName = accountName;
    }
  }

  /**
   * Set account name
   */
  withAccountName(accountName: string): this {
    this.config.accountName = accountName;
    return this;
  }

  /**
   * Set default container
   */
  withContainer(container: string): this {
    this.config.defaultContainer = container;
    return this;
  }

  /**
   * Set custom endpoint
   */
  withEndpoint(endpoint: string): this {
    this.config.endpoint = endpoint;
    return this;
  }

  /**
   * Set connection string
   */
  withConnectionString(connectionString: string): this {
    this.config.connectionString = connectionString;
    return this;
  }

  /**
   * Set storage account key
   */
  withAccountKey(accountKey: string): this {
    this.config.accountKey = accountKey;
    return this;
  }

  /**
   * Set SAS token
   */
  withSasToken(sasToken: string): this {
    this.config.sasToken = sasToken;
    return this;
  }

  /**
   * Set Azure AD credentials
   */
  withAzureAd(credentials: AzureAdCredentials): this {
    this.config.azureAdCredentials = credentials;
    return this;
  }

  /**
   * Set request timeout
   */
  withTimeout(timeoutMs: number): this {
    this.config.timeout = timeoutMs;
    return this;
  }

  /**
   * Set chunk size for uploads/downloads
   */
  withChunkSize(sizeBytes: number): this {
    this.config.chunkSize = sizeBytes;
    return this;
  }

  /**
   * Set maximum concurrency
   */
  withConcurrency(maxConcurrency: number): this {
    this.config.maxConcurrency = maxConcurrency;
    return this;
  }

  /**
   * Set retry configuration
   */
  withRetry(retry: Partial<RetryConfig>): this {
    this.config.retry = retry;
    return this;
  }

  /**
   * Enable recording mode
   */
  withRecording(path: string): this {
    this.config.simulationMode = { type: 'recording', path };
    return this;
  }

  /**
   * Enable replay mode
   */
  withReplay(path: string): this {
    this.config.simulationMode = { type: 'replay', path };
    return this;
  }

  /**
   * Build configuration from environment variables
   */
  static fromEnv(): BlobStorageConfigBuilder {
    const builder = new BlobStorageConfigBuilder();

    // Connection string takes precedence
    const connectionString = process.env['AZURE_STORAGE_CONNECTION_STRING'];
    if (connectionString) {
      return builder.withConnectionString(connectionString);
    }

    // Account name and key
    const accountName = process.env['AZURE_STORAGE_ACCOUNT'];
    const accountKey = process.env['AZURE_STORAGE_KEY'];
    const sasToken = process.env['AZURE_STORAGE_SAS_TOKEN'];
    const container = process.env['AZURE_STORAGE_CONTAINER'];

    if (accountName) {
      builder.withAccountName(accountName);
    }
    if (accountKey) {
      builder.withAccountKey(accountKey);
    }
    if (sasToken) {
      builder.withSasToken(sasToken);
    }
    if (container) {
      builder.withContainer(container);
    }

    // Azure AD credentials
    const tenantId = process.env['AZURE_TENANT_ID'];
    const clientId = process.env['AZURE_CLIENT_ID'];
    const clientSecret = process.env['AZURE_CLIENT_SECRET'];

    if (tenantId && clientId) {
      builder.withAzureAd({
        tenantId,
        clientId,
        clientSecret,
      });
    }

    // Check for managed identity
    if (process.env['AZURE_USE_MANAGED_IDENTITY'] === 'true') {
      builder.withAzureAd({
        tenantId: '',
        clientId: clientId ?? '',
        useManagedIdentity: true,
      });
    }

    return builder;
  }

  /**
   * Build the configuration
   */
  build(): BlobStorageConfig {
    return { ...this.config } as BlobStorageConfig;
  }
}

/**
 * Create a config builder
 */
export function builder(accountName?: string): BlobStorageConfigBuilder {
  return new BlobStorageConfigBuilder(accountName);
}

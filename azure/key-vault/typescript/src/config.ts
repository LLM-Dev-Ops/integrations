/**
 * Azure Key Vault Configuration
 *
 * Configuration types and builders for the Key Vault client.
 */

/**
 * Cache configuration options
 */
export interface CacheConfig {
  /** Whether caching is enabled (default: true) */
  enabled: boolean;
  /** Time-to-live in milliseconds (default: 300000 = 5 minutes) */
  ttl: number;
  /** Maximum number of cache entries (default: 1000) */
  maxEntries: number;
  /** TTL for negative (not found) cache entries in ms (default: 30000 = 30 seconds) */
  negativeTtl: number;
  /** Enable refresh-ahead caching (default: true) */
  refreshAhead: boolean;
  /** Threshold for refresh-ahead as fraction of TTL (default: 0.8) */
  refreshThreshold: number;
}

/**
 * Key Vault client configuration
 */
export interface KeyVaultConfig {
  /** Vault URL (e.g., https://myvault.vault.azure.net) */
  vaultUrl: string;
  /** API version (default: "7.4") */
  apiVersion?: string;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Maximum retry attempts (default: 3) */
  maxRetries?: number;
  /** Cache configuration */
  cache?: Partial<CacheConfig>;
}

/**
 * Normalized configuration with all defaults applied
 */
export interface NormalizedKeyVaultConfig {
  /** Vault URL (normalized, no trailing slash) */
  vaultUrl: string;
  /** Vault hostname (extracted from URL) */
  vaultHost: string;
  /** API version */
  apiVersion: string;
  /** Request timeout in milliseconds */
  timeout: number;
  /** Maximum retry attempts */
  maxRetries: number;
  /** Cache configuration with all defaults */
  cache: CacheConfig;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG = {
  apiVersion: '7.4',
  timeout: 30000,
  maxRetries: 3,
  cache: {
    enabled: true,
    ttl: 300000, // 5 minutes
    maxEntries: 1000,
    negativeTtl: 30000, // 30 seconds
    refreshAhead: true,
    refreshThreshold: 0.8,
  },
} as const;

/**
 * Normalize and validate configuration
 *
 * @param config - Raw configuration input
 * @returns Normalized configuration with defaults applied
 * @throws {Error} If configuration is invalid
 */
export function normalizeConfig(config: KeyVaultConfig): NormalizedKeyVaultConfig {
  // Validate vault URL
  if (!config.vaultUrl) {
    throw new Error('Vault URL is required');
  }

  // Normalize vault URL (remove trailing slash)
  let vaultUrl = config.vaultUrl.trim();
  if (vaultUrl.endsWith('/')) {
    vaultUrl = vaultUrl.slice(0, -1);
  }

  // Validate URL format
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(vaultUrl);
  } catch {
    throw new Error(`Invalid vault URL format: ${vaultUrl}`);
  }

  if (parsedUrl.protocol !== 'https:') {
    throw new Error('Vault URL must use HTTPS');
  }

  if (!parsedUrl.hostname.endsWith('.vault.azure.net')) {
    throw new Error('Vault URL must end with .vault.azure.net');
  }

  // Validate numeric options
  const timeout = config.timeout ?? DEFAULT_CONFIG.timeout;
  if (timeout < 1000) {
    throw new Error('Timeout must be at least 1000ms');
  }

  const maxRetries = config.maxRetries ?? DEFAULT_CONFIG.maxRetries;
  if (maxRetries < 0 || maxRetries > 10) {
    throw new Error('Max retries must be between 0 and 10');
  }

  // Merge cache config
  const cacheConfig: CacheConfig = {
    enabled: config.cache?.enabled ?? DEFAULT_CONFIG.cache.enabled,
    ttl: config.cache?.ttl ?? DEFAULT_CONFIG.cache.ttl,
    maxEntries: config.cache?.maxEntries ?? DEFAULT_CONFIG.cache.maxEntries,
    negativeTtl: config.cache?.negativeTtl ?? DEFAULT_CONFIG.cache.negativeTtl,
    refreshAhead: config.cache?.refreshAhead ?? DEFAULT_CONFIG.cache.refreshAhead,
    refreshThreshold: config.cache?.refreshThreshold ?? DEFAULT_CONFIG.cache.refreshThreshold,
  };

  // Validate cache config
  if (cacheConfig.ttl < 1000) {
    throw new Error('Cache TTL must be at least 1000ms');
  }

  if (cacheConfig.maxEntries < 1) {
    throw new Error('Cache max entries must be at least 1');
  }

  if (cacheConfig.refreshThreshold <= 0 || cacheConfig.refreshThreshold >= 1) {
    throw new Error('Cache refresh threshold must be between 0 and 1');
  }

  return {
    vaultUrl,
    vaultHost: parsedUrl.hostname,
    apiVersion: config.apiVersion ?? DEFAULT_CONFIG.apiVersion,
    timeout,
    maxRetries,
    cache: cacheConfig,
  };
}

/**
 * Create configuration from environment variables
 *
 * Environment variables:
 * - AZURE_KEYVAULT_URL: Vault URL (required)
 * - AZURE_KEYVAULT_API_VERSION: API version
 * - AZURE_KEYVAULT_TIMEOUT_MS: Timeout in milliseconds
 * - AZURE_KEYVAULT_MAX_RETRIES: Maximum retry attempts
 * - AZURE_KEYVAULT_CACHE_ENABLED: Enable caching ("true" or "false")
 * - AZURE_KEYVAULT_CACHE_TTL_MS: Cache TTL in milliseconds
 *
 * @returns Configuration from environment
 * @throws {Error} If required environment variables are missing
 */
export function configFromEnv(): KeyVaultConfig {
  const vaultUrl = process.env['AZURE_KEYVAULT_URL'];
  if (!vaultUrl) {
    throw new Error('AZURE_KEYVAULT_URL environment variable is required');
  }

  const config: KeyVaultConfig = { vaultUrl };

  const apiVersion = process.env['AZURE_KEYVAULT_API_VERSION'];
  if (apiVersion) {
    config.apiVersion = apiVersion;
  }

  const timeout = process.env['AZURE_KEYVAULT_TIMEOUT_MS'];
  if (timeout) {
    config.timeout = parseInt(timeout, 10);
  }

  const maxRetries = process.env['AZURE_KEYVAULT_MAX_RETRIES'];
  if (maxRetries) {
    config.maxRetries = parseInt(maxRetries, 10);
  }

  const cacheEnabled = process.env['AZURE_KEYVAULT_CACHE_ENABLED'];
  if (cacheEnabled !== undefined) {
    config.cache = config.cache ?? {};
    config.cache.enabled = cacheEnabled === 'true';
  }

  const cacheTtl = process.env['AZURE_KEYVAULT_CACHE_TTL_MS'];
  if (cacheTtl) {
    config.cache = config.cache ?? {};
    config.cache.ttl = parseInt(cacheTtl, 10);
  }

  return config;
}

/**
 * Azure Cognitive Search Client Configuration
 *
 * Configuration types and utilities for the ACS client.
 */

import type { ApiVersion } from '../types/index.js';
import type { AzureAdCredentials } from '../auth/index.js';

/** Retry configuration */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxAttempts: number;
  /** Base delay in milliseconds */
  baseDelayMs: number;
  /** Maximum delay in milliseconds */
  maxDelayMs: number;
  /** Backoff multiplier */
  multiplier: number;
}

/** Circuit breaker configuration */
export interface CircuitBreakerConfig {
  /** Number of failures before opening circuit */
  failureThreshold: number;
  /** Number of successes needed to close circuit */
  successThreshold: number;
  /** Time in milliseconds before attempting recovery */
  resetTimeoutMs: number;
}

/** Simulation mode configuration */
export type SimulationMode =
  | { type: 'disabled' }
  | { type: 'recording'; path: string }
  | { type: 'replay'; path: string };

/** Azure Cognitive Search client configuration */
export interface AcsConfig {
  /** Search service name (without .search.windows.net) */
  serviceName: string;
  /** API key for authentication */
  apiKey?: string;
  /** Azure AD credentials for authentication */
  azureAdCredentials?: AzureAdCredentials;
  /** API version to use */
  apiVersion?: ApiVersion;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Retry configuration */
  retryConfig?: Partial<RetryConfig>;
  /** Circuit breaker configuration */
  circuitBreakerConfig?: Partial<CircuitBreakerConfig>;
  /** Simulation mode */
  simulationMode?: SimulationMode;
}

/** Normalized configuration with all defaults applied */
export interface NormalizedAcsConfig {
  serviceName: string;
  endpoint: string;
  apiKey?: string;
  azureAdCredentials?: AzureAdCredentials;
  apiVersion: ApiVersion;
  timeout: number;
  retryConfig: RetryConfig;
  circuitBreakerConfig: CircuitBreakerConfig;
  simulationMode: SimulationMode;
}

/** Default API version */
export const DEFAULT_API_VERSION: ApiVersion = '2024-07-01';

/** Default timeout in milliseconds */
export const DEFAULT_TIMEOUT = 30000;

/** Default retry configuration */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  multiplier: 2,
};

/** Default circuit breaker configuration */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  resetTimeoutMs: 30000,
};

/**
 * Normalize configuration with defaults
 */
export function normalizeConfig(config: AcsConfig): NormalizedAcsConfig {
  if (!config.serviceName) {
    throw new Error('Service name is required');
  }

  if (!config.apiKey && !config.azureAdCredentials) {
    throw new Error('Either API key or Azure AD credentials must be provided');
  }

  const endpoint = `https://${config.serviceName}.search.windows.net`;

  return {
    serviceName: config.serviceName,
    endpoint,
    apiKey: config.apiKey,
    azureAdCredentials: config.azureAdCredentials,
    apiVersion: config.apiVersion ?? DEFAULT_API_VERSION,
    timeout: config.timeout ?? DEFAULT_TIMEOUT,
    retryConfig: {
      ...DEFAULT_RETRY_CONFIG,
      ...config.retryConfig,
    },
    circuitBreakerConfig: {
      ...DEFAULT_CIRCUIT_BREAKER_CONFIG,
      ...config.circuitBreakerConfig,
    },
    simulationMode: config.simulationMode ?? { type: 'disabled' },
  };
}

/**
 * Create configuration from environment variables
 */
export function configFromEnv(): AcsConfig {
  const serviceName = process.env['AZURE_SEARCH_SERVICE_NAME'];
  const apiKey = process.env['AZURE_SEARCH_API_KEY'];
  const tenantId = process.env['AZURE_TENANT_ID'];
  const clientId = process.env['AZURE_CLIENT_ID'];
  const clientSecret = process.env['AZURE_CLIENT_SECRET'];
  const useManagedIdentity = process.env['AZURE_USE_MANAGED_IDENTITY'] === 'true';

  if (!serviceName) {
    throw new Error('AZURE_SEARCH_SERVICE_NAME environment variable is required');
  }

  const config: AcsConfig = { serviceName };

  if (apiKey) {
    config.apiKey = apiKey;
  }

  if (tenantId && clientId) {
    config.azureAdCredentials = {
      tenantId,
      clientId,
      clientSecret,
      useManagedIdentity,
    };
  } else if (useManagedIdentity) {
    config.azureAdCredentials = {
      tenantId: '',
      clientId: clientId ?? '',
      useManagedIdentity: true,
    };
  }

  return config;
}

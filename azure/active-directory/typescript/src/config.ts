/**
 * Azure Active Directory OAuth2 Configuration Module
 *
 * Configuration and builder for Azure AD client.
 * Following the SPARC specification for Azure AD integration.
 */

import type { CredentialType } from './types/index.js';

/**
 * Simulation mode configuration.
 */
export type SimulationMode =
  | { type: 'disabled' }
  | { type: 'recording'; path: string }
  | { type: 'replay'; path: string };

/**
 * Cache configuration.
 */
export interface CacheConfig {
  enabled: boolean;
  maxEntries: number;
  refreshBufferMs: number;  // Refresh token this many ms before expiry
}

/**
 * Retry configuration.
 */
export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  multiplier: number;
}

/**
 * Circuit breaker configuration.
 */
export interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  resetTimeoutMs: number;
}

/**
 * Azure AD client configuration.
 */
export interface AzureAdConfig {
  tenantId: string;
  clientId: string;
  credential: CredentialType;
  authority: string;
  redirectUri?: string;
  cache: CacheConfig;
  retry: RetryConfig;
  circuitBreaker: CircuitBreakerConfig;
  simulation: SimulationMode;
}

/**
 * Default cache configuration.
 */
export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  enabled: true,
  maxEntries: 1000,
  refreshBufferMs: 5 * 60 * 1000,  // 5 minutes
};

/**
 * Default retry configuration.
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 8000,
  multiplier: 2,
};

/**
 * Default circuit breaker configuration.
 */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 3,
  resetTimeoutMs: 30000,
};

/**
 * Default authority.
 */
export const DEFAULT_AUTHORITY = 'https://login.microsoftonline.com';

/**
 * Configuration builder for Azure AD client.
 */
export class AzureAdConfigBuilder {
  private config: Partial<AzureAdConfig> = {
    authority: DEFAULT_AUTHORITY,
    credential: { type: 'none' },
    cache: { ...DEFAULT_CACHE_CONFIG },
    retry: { ...DEFAULT_RETRY_CONFIG },
    circuitBreaker: { ...DEFAULT_CIRCUIT_BREAKER_CONFIG },
    simulation: { type: 'disabled' },
  };

  /**
   * Create a new configuration builder.
   */
  constructor(tenantId: string, clientId: string) {
    this.config.tenantId = tenantId;
    this.config.clientId = clientId;
  }

  /**
   * Set client secret credential.
   */
  withClientSecret(secret: string): this {
    this.config.credential = { type: 'secret', value: secret };
    return this;
  }

  /**
   * Set certificate credential.
   */
  withCertificate(certData: Uint8Array, password?: string): this {
    this.config.credential = { type: 'certificate', certData, password };
    return this;
  }

  /**
   * Set managed identity credential.
   */
  withManagedIdentity(clientId?: string): this {
    this.config.credential = { type: 'managedIdentity', clientId };
    return this;
  }

  /**
   * Set redirect URI.
   */
  withRedirectUri(uri: string): this {
    this.config.redirectUri = uri;
    return this;
  }

  /**
   * Set authority.
   */
  withAuthority(authority: string): this {
    this.config.authority = authority;
    return this;
  }

  /**
   * Set cache configuration.
   */
  withCache(cache: Partial<CacheConfig>): this {
    this.config.cache = { ...DEFAULT_CACHE_CONFIG, ...cache };
    return this;
  }

  /**
   * Disable cache.
   */
  withCacheDisabled(): this {
    this.config.cache = { ...DEFAULT_CACHE_CONFIG, enabled: false };
    return this;
  }

  /**
   * Set retry configuration.
   */
  withRetry(retry: Partial<RetryConfig>): this {
    this.config.retry = { ...DEFAULT_RETRY_CONFIG, ...retry };
    return this;
  }

  /**
   * Set circuit breaker configuration.
   */
  withCircuitBreaker(config: Partial<CircuitBreakerConfig>): this {
    this.config.circuitBreaker = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config };
    return this;
  }

  /**
   * Set simulation mode to recording.
   */
  withRecording(path: string): this {
    this.config.simulation = { type: 'recording', path };
    return this;
  }

  /**
   * Set simulation mode to replay.
   */
  withReplay(path: string): this {
    this.config.simulation = { type: 'replay', path };
    return this;
  }

  /**
   * Build from environment variables.
   */
  static fromEnv(): AzureAdConfigBuilder {
    const tenantId = process.env.AZURE_TENANT_ID;
    const clientId = process.env.AZURE_CLIENT_ID;

    if (!tenantId || !clientId) {
      throw new Error('AZURE_TENANT_ID and AZURE_CLIENT_ID are required');
    }

    const builder = new AzureAdConfigBuilder(tenantId, clientId);

    // Check for various credential types
    const clientSecret = process.env.AZURE_CLIENT_SECRET;
    if (clientSecret) {
      builder.withClientSecret(clientSecret);
    }

    const useManagedIdentity = process.env.AZURE_USE_MANAGED_IDENTITY;
    if (useManagedIdentity) {
      const managedIdentityClientId = process.env.AZURE_MANAGED_IDENTITY_CLIENT_ID;
      builder.withManagedIdentity(managedIdentityClientId);
    }

    const authority = process.env.AZURE_AUTHORITY_HOST;
    if (authority) {
      builder.withAuthority(authority);
    }

    const simulationMode = process.env.AZURE_AD_SIMULATION_MODE;
    const simulationPath = process.env.AZURE_AD_SIMULATION_PATH;
    if (simulationMode === 'recording' && simulationPath) {
      builder.withRecording(simulationPath);
    } else if (simulationMode === 'replay' && simulationPath) {
      builder.withReplay(simulationPath);
    }

    return builder;
  }

  /**
   * Build and validate the configuration.
   */
  build(): AzureAdConfig {
    if (!this.config.tenantId) {
      throw new Error('tenantId is required');
    }
    if (!this.config.clientId) {
      throw new Error('clientId is required');
    }

    return this.config as AzureAdConfig;
  }
}

/**
 * Create a configuration builder.
 */
export function createConfigBuilder(tenantId: string, clientId: string): AzureAdConfigBuilder {
  return new AzureAdConfigBuilder(tenantId, clientId);
}

/**
 * Configuration types and interfaces for Weaviate client.
 * @module config/types
 */

/**
 * Consistency level for batch operations.
 */
export enum ConsistencyLevel {
  /** Single node must acknowledge */
  ONE = 'ONE',
  /** Quorum of nodes must acknowledge (default) */
  QUORUM = 'QUORUM',
  /** All nodes must acknowledge */
  ALL = 'ALL',
}

/**
 * Authentication configuration - None.
 */
export interface NoneAuth {
  type: 'none';
}

/**
 * Authentication configuration - API Key.
 */
export interface ApiKeyAuth {
  type: 'apiKey';
  apiKey: string;
}

/**
 * Authentication configuration - OIDC.
 */
export interface OidcAuth {
  type: 'oidc';
  token: string;
  /** Optional refresh token for token renewal */
  refreshToken?: string;
  /** Optional token expiry timestamp */
  expiresAt?: number;
}

/**
 * Authentication configuration - Client Credentials.
 */
export interface ClientCredentialsAuth {
  type: 'clientCredentials';
  clientId: string;
  clientSecret: string;
  scopes?: string[];
  /** Optional token endpoint URL */
  tokenEndpoint?: string;
}

/**
 * Weaviate authentication configuration.
 * Supports multiple authentication methods.
 */
export type WeaviateAuth =
  | NoneAuth
  | ApiKeyAuth
  | OidcAuth
  | ClientCredentialsAuth;

/**
 * Main configuration interface for Weaviate client.
 */
export interface WeaviateConfig {
  /**
   * Weaviate instance endpoint URL.
   * @example 'http://localhost:8080', 'https://my-weaviate.weaviate.network'
   */
  endpoint: string;

  /**
   * Optional gRPC endpoint for high-throughput operations.
   * @example 'localhost:50051'
   */
  grpcEndpoint?: string;

  /**
   * Authentication configuration.
   * @default { type: 'none' }
   */
  auth?: WeaviateAuth;

  /**
   * Request timeout in milliseconds.
   * @default 30000
   */
  timeout?: number;

  /**
   * Default batch size for batch operations.
   * @default 100
   */
  batchSize?: number;

  /**
   * Default consistency level for operations.
   * @default ConsistencyLevel.QUORUM
   */
  consistencyLevel?: ConsistencyLevel;

  /**
   * Maximum number of retry attempts for failed requests.
   * @default 3
   */
  maxRetries?: number;

  /**
   * Base delay in milliseconds for retry backoff.
   * @default 1000
   */
  retryBackoff?: number;

  /**
   * Number of failures before circuit breaker opens.
   * @default 5
   */
  circuitBreakerThreshold?: number;

  /**
   * Connection pool size for gRPC connections.
   * @default 10
   */
  poolSize?: number;

  /**
   * Idle timeout in milliseconds for pooled connections.
   * @default 300000
   */
  idleTimeout?: number;

  /**
   * Schema cache TTL in milliseconds.
   * @default 300000
   */
  schemaCacheTtl?: number;

  /**
   * Allowlist of tenants for multi-tenancy.
   * If specified, only these tenants can be accessed.
   */
  tenantAllowlist?: string[];

  /**
   * Custom headers to include in all requests.
   */
  headers?: Record<string, string>;
}

/**
 * Type guards for authentication types
 */

export function isNoneAuth(auth: WeaviateAuth): auth is NoneAuth {
  return auth.type === 'none';
}

export function isApiKeyAuth(auth: WeaviateAuth): auth is ApiKeyAuth {
  return auth.type === 'apiKey';
}

export function isOidcAuth(auth: WeaviateAuth): auth is OidcAuth {
  return auth.type === 'oidc';
}

export function isClientCredentialsAuth(auth: WeaviateAuth): auth is ClientCredentialsAuth {
  return auth.type === 'clientCredentials';
}

/**
 * Default configuration values.
 */

/** Default Weaviate endpoint */
export const DEFAULT_ENDPOINT = 'http://localhost:8080';

/** Default request timeout in milliseconds (30 seconds) */
export const DEFAULT_TIMEOUT_MS = 30000;

/** Default batch size for batch operations */
export const DEFAULT_BATCH_SIZE = 100;

/** Default maximum retry attempts */
export const DEFAULT_MAX_RETRIES = 3;

/** Default retry backoff in milliseconds */
export const DEFAULT_RETRY_BACKOFF_MS = 1000;

/** Default circuit breaker failure threshold */
export const DEFAULT_CIRCUIT_BREAKER_THRESHOLD = 5;

/** Default gRPC connection pool size */
export const DEFAULT_POOL_SIZE = 10;

/** Default idle timeout for pooled connections in milliseconds (5 minutes) */
export const DEFAULT_IDLE_TIMEOUT_MS = 300000;

/** Default schema cache TTL in milliseconds (5 minutes) */
export const DEFAULT_SCHEMA_CACHE_TTL_MS = 300000;

/** Default consistency level */
export const DEFAULT_CONSISTENCY_LEVEL = ConsistencyLevel.QUORUM;

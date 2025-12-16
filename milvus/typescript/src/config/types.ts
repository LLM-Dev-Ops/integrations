import { ConsistencyLevel } from '../types/consistency.js';

/**
 * Authentication configuration for Milvus.
 */
export type AuthConfig =
  | { type: 'none' }
  | { type: 'token'; token: string }
  | { type: 'userPass'; username: string; password: string };

/**
 * TLS configuration for secure connections.
 */
export interface TlsConfig {
  /** Path to CA certificate file */
  caCertPath?: string;
  /** Path to client certificate file */
  clientCertPath?: string;
  /** Path to client key file */
  clientKeyPath?: string;
  /** Server name for SNI */
  serverName?: string;
  /** Skip certificate verification (not recommended for production) */
  skipVerify?: boolean;
}

/**
 * Connection pool configuration.
 */
export interface PoolConfig {
  /** Maximum connections in the pool (default: 10) */
  maxConnections: number;
  /** Minimum connections to maintain (default: 1) */
  minConnections: number;
  /** Idle timeout in milliseconds (default: 300000 - 5 minutes) */
  idleTimeoutMs: number;
  /** Maximum connection lifetime in milliseconds (default: 1800000 - 30 minutes) */
  maxLifetimeMs: number;
  /** Connection timeout in milliseconds (default: 10000 - 10 seconds) */
  connectTimeoutMs: number;
}

/**
 * Retry configuration for transient failures.
 */
export interface RetryConfig {
  /** Maximum retry attempts (default: 3) */
  maxRetries: number;
  /** Initial backoff in milliseconds (default: 100) */
  initialBackoffMs: number;
  /** Maximum backoff in milliseconds (default: 10000) */
  maxBackoffMs: number;
  /** Backoff multiplier (default: 2.0) */
  backoffMultiplier: number;
}

/**
 * Full Milvus client configuration.
 */
export interface MilvusConfig {
  /** Milvus host address */
  host: string;
  /** Milvus gRPC port (default: 19530) */
  port: number;
  /** Authentication configuration */
  auth: AuthConfig;
  /** TLS configuration for secure connections */
  tls?: TlsConfig;
  /** Connection pool configuration */
  poolConfig: PoolConfig;
  /** Request timeout in milliseconds (default: 30000) */
  timeoutMs: number;
  /** Retry configuration */
  retryConfig: RetryConfig;
  /** Default consistency level (default: Session) */
  defaultConsistency: ConsistencyLevel;
  /** Auto-load collections when accessed (default: true) */
  autoLoad: boolean;
}

/**
 * Default pool configuration.
 */
export const DEFAULT_POOL_CONFIG: PoolConfig = {
  maxConnections: 10,
  minConnections: 1,
  idleTimeoutMs: 300_000, // 5 minutes
  maxLifetimeMs: 1_800_000, // 30 minutes
  connectTimeoutMs: 10_000, // 10 seconds
};

/**
 * Default retry configuration.
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialBackoffMs: 100,
  maxBackoffMs: 10_000, // 10 seconds
  backoffMultiplier: 2.0,
};

/**
 * Default Milvus configuration.
 */
export function createDefaultConfig(): MilvusConfig {
  return {
    host: 'localhost',
    port: 19530,
    auth: { type: 'none' },
    tls: undefined,
    poolConfig: { ...DEFAULT_POOL_CONFIG },
    timeoutMs: 30_000, // 30 seconds
    retryConfig: { ...DEFAULT_RETRY_CONFIG },
    defaultConsistency: ConsistencyLevel.Session,
    autoLoad: true,
  };
}

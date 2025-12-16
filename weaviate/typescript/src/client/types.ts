/**
 * Client-specific types and interfaces
 *
 * @module client/types
 */

import type { WeaviateConfig } from '../config/types.js';

/**
 * Client state enum
 *
 * Tracks the lifecycle state of the WeaviateClient instance.
 */
export enum ClientState {
  /**
   * Client has been created but not yet connected
   */
  Initialized = 'INITIALIZED',

  /**
   * Client is connected and ready for operations
   */
  Connected = 'CONNECTED',

  /**
   * Client has been closed and cannot be used
   */
  Closed = 'CLOSED',
}

/**
 * Client options - extends WeaviateConfig
 *
 * These are the options that can be passed to createClient.
 */
export interface WeaviateClientOptions extends WeaviateConfig {
  /**
   * Whether to eagerly initialize connections
   * Default: false (lazy initialization)
   */
  eagerConnect?: boolean;

  /**
   * Whether to skip initial health check
   * Default: false
   */
  skipHealthCheck?: boolean;
}

/**
 * Health check status
 */
export interface HealthStatus {
  /**
   * Whether Weaviate is ready
   */
  weaviateReady: boolean;

  /**
   * Schema cache status
   */
  schemaCache?: {
    enabled: boolean;
    size: number;
    hitRate?: number;
  };

  /**
   * Circuit breaker status
   */
  circuitBreaker?: {
    state: string;
    failureCount?: number;
  };

  /**
   * gRPC connection status (if configured)
   */
  grpcConnection?: {
    connected: boolean;
    endpoint?: string;
  };

  /**
   * Overall health status
   */
  healthy: boolean;

  /**
   * Timestamp of health check
   */
  timestamp: Date;

  /**
   * Any errors encountered
   */
  errors?: string[];
}

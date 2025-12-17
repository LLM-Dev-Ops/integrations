/**
 * RuvVector Service Types
 */

/**
 * Telemetry event structure
 */
export interface TelemetryEvent {
  correlationId: string;
  integration: string;
  provider?: string;
  eventType: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
  traceId?: string;
  spanId?: string;
}

/**
 * Query parameters for event retrieval
 */
export interface QueryParams {
  integration?: string;
  correlationId?: string;
  eventType?: string;
  from?: number;
  to?: number;
  limit?: number;
  offset?: number;
}

/**
 * Health check response
 */
export interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  timestamp: number;
  database: {
    connected: boolean;
    poolStats?: {
      total: number;
      idle: number;
      waiting: number;
    };
  };
}

/**
 * API response wrapper
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

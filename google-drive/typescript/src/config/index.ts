/**
 * Configuration module for Google Drive integration.
 *
 * This module provides configuration interfaces, default values, and validation
 * for the Google Drive client. It supports both OAuth2 and Service Account authentication.
 *
 * @module config
 */

import { z } from 'zod';

/**
 * OAuth 2.0 credentials for authentication.
 */
export interface OAuth2Credentials {
  readonly type: 'oauth2';
  readonly clientId: string;
  readonly clientSecret: string;
  readonly refreshToken: string;
  readonly accessToken?: string;
  readonly expiresAt?: Date;
}

/**
 * Service Account credentials for authentication.
 */
export interface ServiceAccountCredentials {
  readonly type: 'service_account';
  readonly clientEmail: string;
  readonly privateKey: string;
  readonly privateKeyId?: string;
  readonly projectId?: string;
  readonly scopes: readonly string[];
  /** Email address to impersonate (for domain-wide delegation) */
  readonly subject?: string;
}

/**
 * Authentication credentials union type.
 */
export type Credentials = OAuth2Credentials | ServiceAccountCredentials;

/**
 * Retry configuration for transient failures.
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  readonly maxRetries: number;

  /** Base delay in milliseconds for exponential backoff */
  readonly baseDelay: number;

  /** Maximum delay in milliseconds between retries */
  readonly maxDelay: number;

  /** Multiplier for exponential backoff */
  readonly backoffMultiplier: number;

  /** Whether to respect Retry-After headers from the server */
  readonly respectRetryAfter: boolean;
}

/**
 * Circuit breaker configuration to prevent cascading failures.
 */
export interface CircuitBreakerConfig {
  /** Number of consecutive failures before opening the circuit */
  readonly failureThreshold: number;

  /** Number of consecutive successes to close the circuit */
  readonly successThreshold: number;

  /** Time in milliseconds to wait before attempting to close the circuit */
  readonly resetTimeout: number;

  /** Whether circuit breaker is enabled */
  readonly enabled: boolean;
}

/**
 * Rate limiting configuration for client-side throttling.
 */
export interface RateLimitConfig {
  /** Maximum queries per 100 seconds per user (Google Drive limit: 1000) */
  readonly userQueriesPer100Seconds: number;

  /** Maximum queries per day per project (Google Drive limit: 10,000,000) */
  readonly projectQueriesPerDay: number;

  /** Maximum concurrent requests allowed */
  readonly maxConcurrentRequests: number;

  /** Whether to enable pre-emptive throttling based on tracked limits */
  readonly preemptiveThrottling: boolean;

  /** Whether rate limiting is enabled */
  readonly enabled: boolean;
}

/**
 * Main configuration for the Google Drive client.
 */
export interface GoogleDriveConfig {
  /** Authentication credentials (OAuth2 or Service Account) */
  readonly credentials: Credentials;

  /** Base URL for the Google Drive API (default: https://www.googleapis.com/drive/v3) */
  readonly baseUrl?: string;

  /** Upload URL for the Google Drive API (default: https://www.googleapis.com/upload/drive/v3) */
  readonly uploadUrl?: string;

  /** Default timeout in milliseconds for requests (default: 300000ms = 5min) */
  readonly timeout?: number;

  /** Maximum number of retries for transient failures (default: 3) */
  readonly maxRetries?: number;

  /** Retry configuration */
  readonly retryConfig?: Partial<RetryConfig>;

  /** Circuit breaker configuration */
  readonly circuitBreakerConfig?: Partial<CircuitBreakerConfig>;

  /** Rate limiting configuration */
  readonly rateLimitConfig?: Partial<RateLimitConfig>;

  /** Chunk size in bytes for resumable uploads (must be multiple of 256KB, default: 8MB) */
  readonly uploadChunkSize?: number;

  /** Custom user agent string */
  readonly userAgent?: string;

  /** Default fields to include in API responses (using partial response) */
  readonly defaultFields?: string;
}

/**
 * Default retry configuration values.
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 60000,
  backoffMultiplier: 2,
  respectRetryAfter: true,
};

/**
 * Default circuit breaker configuration values.
 */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 3,
  resetTimeout: 60000,
  enabled: true,
};

/**
 * Default rate limiting configuration values.
 */
export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  userQueriesPer100Seconds: 1000,
  projectQueriesPerDay: 10_000_000,
  maxConcurrentRequests: 10,
  preemptiveThrottling: true,
  enabled: true,
};

/**
 * OAuth 2.0 scope constants for Google Drive API.
 *
 * @see https://developers.google.com/drive/api/guides/api-specific-auth
 */
export const SCOPES = {
  /** Full access to all files in Google Drive */
  DRIVE: 'https://www.googleapis.com/auth/drive',

  /** Read-only access to file metadata and content */
  DRIVE_READONLY: 'https://www.googleapis.com/auth/drive.readonly',

  /** Access to files created or opened by the app */
  DRIVE_FILE: 'https://www.googleapis.com/auth/drive.file',

  /** Access to the Application Data folder */
  DRIVE_APPDATA: 'https://www.googleapis.com/auth/drive.appdata',

  /** Read-only access to file metadata only (no content) */
  DRIVE_METADATA_READONLY: 'https://www.googleapis.com/auth/drive.metadata.readonly',

  /** Read/write access to file metadata */
  DRIVE_METADATA: 'https://www.googleapis.com/auth/drive.metadata',

  /** Read-only access to Google Photos */
  DRIVE_PHOTOS_READONLY: 'https://www.googleapis.com/auth/drive.photos.readonly',
} as const;

/**
 * Default base URL for Google Drive API v3.
 */
export const DEFAULT_BASE_URL = 'https://www.googleapis.com/drive/v3';

/**
 * Default upload URL for Google Drive API v3.
 */
export const DEFAULT_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3';

/**
 * Default timeout in milliseconds (5 minutes).
 */
export const DEFAULT_TIMEOUT = 300000;

/**
 * Default chunk size for resumable uploads (8MB).
 * Must be a multiple of 256KB as required by Google Drive API.
 */
export const DEFAULT_UPLOAD_CHUNK_SIZE = 8 * 1024 * 1024;

/**
 * Minimum chunk size for resumable uploads (256KB).
 */
export const MIN_UPLOAD_CHUNK_SIZE = 256 * 1024;

/**
 * Default user agent string.
 */
export const DEFAULT_USER_AGENT = '@integrations/google-drive/0.1.0';

/**
 * Creates a complete configuration with default values for any missing fields.
 *
 * @param config - Partial configuration provided by the user
 * @returns Complete configuration with defaults applied
 *
 * @example
 * ```typescript
 * const config = createDefaultConfig({
 *   credentials: {
 *     type: 'oauth2',
 *     clientId: 'your-client-id',
 *     clientSecret: 'your-client-secret',
 *     refreshToken: 'your-refresh-token',
 *   },
 * });
 * ```
 */
export function createDefaultConfig(
  config: GoogleDriveConfig
): Required<Omit<GoogleDriveConfig, 'defaultFields'>> & Pick<GoogleDriveConfig, 'defaultFields'> {
  return {
    credentials: config.credentials,
    baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
    uploadUrl: config.uploadUrl ?? DEFAULT_UPLOAD_URL,
    timeout: config.timeout ?? DEFAULT_TIMEOUT,
    maxRetries: config.maxRetries ?? DEFAULT_RETRY_CONFIG.maxRetries,
    retryConfig: {
      ...DEFAULT_RETRY_CONFIG,
      ...config.retryConfig,
    },
    circuitBreakerConfig: {
      ...DEFAULT_CIRCUIT_BREAKER_CONFIG,
      ...config.circuitBreakerConfig,
    },
    rateLimitConfig: {
      ...DEFAULT_RATE_LIMIT_CONFIG,
      ...config.rateLimitConfig,
    },
    uploadChunkSize: config.uploadChunkSize ?? DEFAULT_UPLOAD_CHUNK_SIZE,
    userAgent: config.userAgent ?? DEFAULT_USER_AGENT,
    defaultFields: config.defaultFields,
  };
}

/**
 * Zod schema for OAuth2 credentials validation.
 */
const OAuth2CredentialsSchema = z.object({
  type: z.literal('oauth2'),
  clientId: z.string().min(1, 'Client ID is required'),
  clientSecret: z.string().min(1, 'Client secret is required'),
  refreshToken: z.string().min(1, 'Refresh token is required'),
  accessToken: z.string().optional(),
  expiresAt: z.date().optional(),
});

/**
 * Zod schema for Service Account credentials validation.
 */
const ServiceAccountCredentialsSchema = z.object({
  type: z.literal('service_account'),
  clientEmail: z.string().email('Invalid service account email'),
  privateKey: z.string().min(1, 'Private key is required'),
  privateKeyId: z.string().optional(),
  projectId: z.string().optional(),
  scopes: z.array(z.string().url('Invalid scope URL')).min(1, 'At least one scope is required'),
  subject: z.string().email('Invalid subject email').optional(),
});

/**
 * Zod schema for credentials validation.
 */
const CredentialsSchema = z.union([OAuth2CredentialsSchema, ServiceAccountCredentialsSchema]);

/**
 * Zod schema for retry configuration validation.
 */
const RetryConfigSchema = z.object({
  maxRetries: z.number().int().min(0).max(10),
  baseDelay: z.number().int().min(0),
  maxDelay: z.number().int().min(0),
  backoffMultiplier: z.number().min(1),
  respectRetryAfter: z.boolean(),
}).refine(
  (config) => config.maxDelay >= config.baseDelay,
  { message: 'maxDelay must be greater than or equal to baseDelay' }
);

/**
 * Zod schema for circuit breaker configuration validation.
 */
const CircuitBreakerConfigSchema = z.object({
  failureThreshold: z.number().int().min(1),
  successThreshold: z.number().int().min(1),
  resetTimeout: z.number().int().min(0),
  enabled: z.boolean(),
});

/**
 * Zod schema for rate limit configuration validation.
 */
const RateLimitConfigSchema = z.object({
  userQueriesPer100Seconds: z.number().int().min(1),
  projectQueriesPerDay: z.number().int().min(1),
  maxConcurrentRequests: z.number().int().min(1),
  preemptiveThrottling: z.boolean(),
  enabled: z.boolean(),
});

/**
 * Zod schema for Google Drive configuration validation.
 */
const GoogleDriveConfigSchema = z.object({
  credentials: CredentialsSchema,
  baseUrl: z.string().url().optional(),
  uploadUrl: z.string().url().optional(),
  timeout: z.number().int().min(0).optional(),
  maxRetries: z.number().int().min(0).max(10).optional(),
  retryConfig: RetryConfigSchema.partial().optional(),
  circuitBreakerConfig: CircuitBreakerConfigSchema.partial().optional(),
  rateLimitConfig: RateLimitConfigSchema.partial().optional(),
  uploadChunkSize: z.number().int().min(MIN_UPLOAD_CHUNK_SIZE).optional(),
  userAgent: z.string().min(1).optional(),
  defaultFields: z.string().optional(),
}).refine(
  (config) => {
    if (config.uploadChunkSize) {
      return config.uploadChunkSize % MIN_UPLOAD_CHUNK_SIZE === 0;
    }
    return true;
  },
  { message: `uploadChunkSize must be a multiple of ${MIN_UPLOAD_CHUNK_SIZE} bytes (256KB)` }
);

/**
 * Configuration validation error.
 */
export class ConfigurationError extends Error {
  constructor(message: string, public readonly errors?: z.ZodError) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

/**
 * Validates the Google Drive configuration.
 *
 * @param config - Configuration to validate
 * @throws {ConfigurationError} If configuration is invalid
 *
 * @example
 * ```typescript
 * try {
 *   validateConfig(config);
 * } catch (error) {
 *   if (error instanceof ConfigurationError) {
 *     console.error('Invalid configuration:', error.message);
 *     console.error('Details:', error.errors);
 *   }
 * }
 * ```
 */
export function validateConfig(config: GoogleDriveConfig): void {
  const result = GoogleDriveConfigSchema.safeParse(config);

  if (!result.success) {
    throw new ConfigurationError(
      'Invalid Google Drive configuration',
      result.error
    );
  }

  // Additional validation for URLs
  if (config.baseUrl && !config.baseUrl.startsWith('https://')) {
    throw new ConfigurationError('baseUrl must use HTTPS');
  }

  if (config.uploadUrl && !config.uploadUrl.startsWith('https://')) {
    throw new ConfigurationError('uploadUrl must use HTTPS');
  }

  // Validate upload chunk size
  if (config.uploadChunkSize) {
    if (config.uploadChunkSize < MIN_UPLOAD_CHUNK_SIZE) {
      throw new ConfigurationError(
        `uploadChunkSize must be at least ${MIN_UPLOAD_CHUNK_SIZE} bytes (256KB)`
      );
    }

    if (config.uploadChunkSize % MIN_UPLOAD_CHUNK_SIZE !== 0) {
      throw new ConfigurationError(
        `uploadChunkSize must be a multiple of ${MIN_UPLOAD_CHUNK_SIZE} bytes (256KB)`
      );
    }
  }
}

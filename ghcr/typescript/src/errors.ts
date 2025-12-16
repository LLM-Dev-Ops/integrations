/**
 * Error types for GitHub Container Registry integration.
 * @module errors
 */

import type { RateLimitInfo } from './types/rate-limit.js';

/**
 * Error kinds for categorizing GHCR errors.
 */
export enum GhcrErrorKind {
  // Authentication errors
  AuthFailed = 'auth_failed',
  Unauthorized = 'unauthorized',
  TokenExpired = 'token_expired',
  InvalidCredentials = 'invalid_credentials',

  // Authorization errors
  Forbidden = 'forbidden',
  InsufficientScope = 'insufficient_scope',
  VulnDataNotAvailable = 'vuln_data_not_available',

  // Resource errors
  NotFound = 'not_found',
  ManifestNotFound = 'manifest_not_found',
  BlobNotFound = 'blob_not_found',
  TagNotFound = 'tag_not_found',
  VersionNotFound = 'version_not_found',

  // Rate limiting errors
  RateLimited = 'rate_limited',
  ThrottleTimeout = 'throttle_timeout',

  // Protocol errors
  UnsupportedMediaType = 'unsupported_media_type',
  InvalidManifest = 'invalid_manifest',
  DigestMismatch = 'digest_mismatch',
  MissingHeader = 'missing_header',
  InvalidImageRef = 'invalid_image_ref',
  InvalidImageName = 'invalid_image_name',
  InvalidTag = 'invalid_tag',
  InvalidDigest = 'invalid_digest',

  // Upload errors
  UploadFailed = 'upload_failed',
  ChunkFailed = 'chunk_failed',
  MountFailed = 'mount_failed',
  UploadSessionExpired = 'upload_session_expired',

  // Server errors
  ServerError = 'server_error',
  ServiceUnavailable = 'service_unavailable',
  BadGateway = 'bad_gateway',
  GatewayTimeout = 'gateway_timeout',

  // Network errors
  ConnectionFailed = 'connection_failed',
  Timeout = 'timeout',

  // Configuration errors
  ConfigError = 'config_error',
  InvalidConfig = 'invalid_config',

  // Simulation errors
  SimulationMismatch = 'simulation_mismatch',
  SimulationNotFound = 'simulation_not_found',

  // Internal errors
  Internal = 'internal',
  Unknown = 'unknown',
}

/**
 * Maps HTTP status codes to error kinds.
 */
export function errorKindFromStatus(status: number): GhcrErrorKind {
  switch (status) {
    case 400:
      return GhcrErrorKind.InvalidManifest;
    case 401:
      return GhcrErrorKind.Unauthorized;
    case 403:
      return GhcrErrorKind.Forbidden;
    case 404:
      return GhcrErrorKind.NotFound;
    case 408:
      return GhcrErrorKind.Timeout;
    case 429:
      return GhcrErrorKind.RateLimited;
    case 500:
      return GhcrErrorKind.ServerError;
    case 502:
      return GhcrErrorKind.BadGateway;
    case 503:
      return GhcrErrorKind.ServiceUnavailable;
    case 504:
      return GhcrErrorKind.GatewayTimeout;
    default:
      if (status >= 500) {
        return GhcrErrorKind.ServerError;
      }
      return GhcrErrorKind.Unknown;
  }
}

/**
 * Checks if an error kind is retryable.
 */
export function isRetryable(kind: GhcrErrorKind): boolean {
  return [
    GhcrErrorKind.RateLimited,
    GhcrErrorKind.ServerError,
    GhcrErrorKind.ServiceUnavailable,
    GhcrErrorKind.BadGateway,
    GhcrErrorKind.GatewayTimeout,
    GhcrErrorKind.Timeout,
    GhcrErrorKind.ConnectionFailed,
    GhcrErrorKind.Unauthorized, // Token might have expired
  ].includes(kind);
}

/**
 * Error options for GhcrError constructor.
 */
export interface GhcrErrorOptions {
  /** HTTP status code */
  statusCode?: number;
  /** Rate limit information */
  rateLimitInfo?: RateLimitInfo;
  /** Retry-After value in seconds */
  retryAfter?: number;
  /** Underlying cause */
  cause?: Error;
  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * GitHub Container Registry error.
 */
export class GhcrError extends Error {
  /** Error kind */
  public readonly kind: GhcrErrorKind;
  /** HTTP status code */
  public readonly statusCode?: number;
  /** Rate limit information */
  public readonly rateLimitInfo?: RateLimitInfo;
  /** Retry-After value in seconds */
  public readonly retryAfter?: number;
  /** Underlying cause */
  public override readonly cause?: Error;
  /** Additional context */
  public readonly context?: Record<string, unknown>;

  constructor(
    kind: GhcrErrorKind,
    message: string,
    options?: GhcrErrorOptions
  ) {
    super(message);
    this.name = 'GhcrError';
    this.kind = kind;
    this.statusCode = options?.statusCode;
    this.rateLimitInfo = options?.rateLimitInfo;
    this.retryAfter = options?.retryAfter;
    this.cause = options?.cause;
    this.context = options?.context;

    // Maintains proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, GhcrError);
    }
  }

  /**
   * Checks if this error is retryable.
   */
  isRetryable(): boolean {
    return isRetryable(this.kind);
  }

  /**
   * Gets the retry delay in milliseconds.
   */
  getRetryDelay(): number | undefined {
    if (this.retryAfter !== undefined) {
      return this.retryAfter * 1000;
    }
    return undefined;
  }

  /**
   * Creates a new error with additional context.
   */
  withContext(context: Record<string, unknown>): GhcrError {
    return new GhcrError(this.kind, this.message, {
      statusCode: this.statusCode,
      rateLimitInfo: this.rateLimitInfo,
      retryAfter: this.retryAfter,
      cause: this.cause,
      context: { ...this.context, ...context },
    });
  }

  /**
   * Formats the error for logging.
   */
  override toString(): string {
    let result = `[${this.kind}] ${this.message}`;
    if (this.statusCode) {
      result += ` (HTTP ${this.statusCode})`;
    }
    if (this.retryAfter) {
      result += ` [retry after ${this.retryAfter}s]`;
    }
    return result;
  }

  /**
   * Converts to JSON for serialization.
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      kind: this.kind,
      message: this.message,
      statusCode: this.statusCode,
      rateLimitInfo: this.rateLimitInfo,
      retryAfter: this.retryAfter,
      context: this.context,
    };
  }

  // Factory methods for common errors

  static authFailed(message: string, statusCode?: number): GhcrError {
    return new GhcrError(GhcrErrorKind.AuthFailed, message, { statusCode });
  }

  static unauthorized(message: string = 'Unauthorized'): GhcrError {
    return new GhcrError(GhcrErrorKind.Unauthorized, message, { statusCode: 401 });
  }

  static forbidden(message: string = 'Forbidden'): GhcrError {
    return new GhcrError(GhcrErrorKind.Forbidden, message, { statusCode: 403 });
  }

  static notFound(resource: string): GhcrError {
    return new GhcrError(
      GhcrErrorKind.NotFound,
      `${resource} not found`,
      { statusCode: 404 }
    );
  }

  static manifestNotFound(ref: string): GhcrError {
    return new GhcrError(
      GhcrErrorKind.ManifestNotFound,
      `Manifest not found: ${ref}`,
      { statusCode: 404 }
    );
  }

  static blobNotFound(digest: string): GhcrError {
    return new GhcrError(
      GhcrErrorKind.BlobNotFound,
      `Blob not found: ${digest}`,
      { statusCode: 404 }
    );
  }

  static rateLimited(
    message: string,
    rateLimitInfo?: RateLimitInfo,
    retryAfter?: number
  ): GhcrError {
    return new GhcrError(
      GhcrErrorKind.RateLimited,
      message,
      { statusCode: 429, rateLimitInfo, retryAfter }
    );
  }

  static unsupportedMediaType(mediaType: string): GhcrError {
    return new GhcrError(
      GhcrErrorKind.UnsupportedMediaType,
      `Unsupported media type: ${mediaType}`
    );
  }

  static invalidManifest(reason: string): GhcrError {
    return new GhcrError(
      GhcrErrorKind.InvalidManifest,
      `Invalid manifest: ${reason}`
    );
  }

  static digestMismatch(expected: string, actual: string): GhcrError {
    return new GhcrError(
      GhcrErrorKind.DigestMismatch,
      `Digest mismatch: expected ${expected}, got ${actual}`,
      { context: { expected, actual } }
    );
  }

  static uploadFailed(reason: string, cause?: Error): GhcrError {
    return new GhcrError(
      GhcrErrorKind.UploadFailed,
      `Upload failed: ${reason}`,
      { cause }
    );
  }

  static serverError(message: string, statusCode: number = 500): GhcrError {
    return new GhcrError(
      GhcrErrorKind.ServerError,
      message,
      { statusCode }
    );
  }

  static timeout(operation: string, timeoutMs: number): GhcrError {
    return new GhcrError(
      GhcrErrorKind.Timeout,
      `Operation '${operation}' timed out after ${timeoutMs}ms`
    );
  }

  static configError(message: string): GhcrError {
    return new GhcrError(GhcrErrorKind.ConfigError, message);
  }

  static fromResponse(status: number, message: string, headers?: Headers): GhcrError {
    const kind = errorKindFromStatus(status);

    let retryAfter: number | undefined;
    if (headers?.get('retry-after')) {
      const value = headers.get('retry-after');
      if (value) {
        const parsed = parseInt(value, 10);
        if (!isNaN(parsed)) {
          retryAfter = parsed;
        }
      }
    }

    return new GhcrError(kind, message, { statusCode: status, retryAfter });
  }
}

/**
 * Type guard for GhcrError.
 */
export function isGhcrError(error: unknown): error is GhcrError {
  return error instanceof GhcrError;
}

/**
 * Result type for operations that can fail.
 */
export type GhcrResult<T> = Promise<T>;

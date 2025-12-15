/**
 * Azure Blob Storage Error Types
 *
 * Error handling specific to Azure Blob Storage following SPARC specification.
 */

/** Base error options */
export interface BlobStorageErrorOptions {
  message: string;
  statusCode?: number;
  code?: string;
  container?: string;
  blobName?: string;
  requestId?: string;
  retryable?: boolean;
  retryAfterMs?: number;
  cause?: Error;
}

/**
 * Base class for all Azure Blob Storage errors
 */
export abstract class BlobStorageError extends Error {
  public readonly statusCode?: number;
  public readonly code?: string;
  public readonly container?: string;
  public readonly blobName?: string;
  public readonly requestId?: string;
  public readonly retryable: boolean;
  public readonly retryAfterMs?: number;
  public override readonly cause?: Error;

  constructor(options: BlobStorageErrorOptions) {
    super(options.message);
    this.name = this.constructor.name;
    this.statusCode = options.statusCode;
    this.code = options.code;
    this.container = options.container;
    this.blobName = options.blobName;
    this.requestId = options.requestId;
    this.retryable = options.retryable ?? false;
    this.retryAfterMs = options.retryAfterMs;
    this.cause = options.cause;

    Error.captureStackTrace?.(this, this.constructor);
  }

  /** Check if error is retryable */
  isRetryable(): boolean {
    return this.retryable;
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      code: this.code,
      container: this.container,
      blobName: this.blobName,
      requestId: this.requestId,
      retryable: this.retryable,
      retryAfterMs: this.retryAfterMs,
    };
  }
}

/**
 * Blob not found error (404)
 */
export class BlobNotFoundError extends BlobStorageError {
  constructor(options: Omit<BlobStorageErrorOptions, 'retryable' | 'code'>) {
    super({ ...options, retryable: false, code: 'BlobNotFound' });
  }
}

/**
 * Container not found error (404)
 */
export class ContainerNotFoundError extends BlobStorageError {
  constructor(options: Omit<BlobStorageErrorOptions, 'retryable' | 'code'>) {
    super({ ...options, retryable: false, code: 'ContainerNotFound' });
  }
}

/**
 * Blob already exists error (409)
 */
export class BlobAlreadyExistsError extends BlobStorageError {
  constructor(options: Omit<BlobStorageErrorOptions, 'retryable' | 'code'>) {
    super({ ...options, retryable: false, code: 'BlobAlreadyExists' });
  }
}

/**
 * Authentication error (401)
 */
export class AuthenticationError extends BlobStorageError {
  constructor(options: Omit<BlobStorageErrorOptions, 'retryable' | 'code'>) {
    super({ ...options, retryable: false, code: 'AuthenticationFailed' });
  }
}

/**
 * Authorization error (403)
 */
export class AuthorizationError extends BlobStorageError {
  constructor(options: Omit<BlobStorageErrorOptions, 'retryable' | 'code'>) {
    super({ ...options, retryable: false, code: 'AuthorizationFailed' });
  }
}

/**
 * Quota exceeded error (403)
 */
export class QuotaExceededError extends BlobStorageError {
  constructor(options: Omit<BlobStorageErrorOptions, 'retryable' | 'code'>) {
    super({ ...options, retryable: false, code: 'QuotaExceeded' });
  }
}

/**
 * Server busy error (503) - retryable
 */
export class ServerBusyError extends BlobStorageError {
  constructor(options: Omit<BlobStorageErrorOptions, 'retryable' | 'code'>) {
    super({ ...options, retryable: true, code: 'ServerBusy' });
  }
}

/**
 * Service unavailable error (503) - retryable
 */
export class ServiceUnavailableError extends BlobStorageError {
  constructor(options: Omit<BlobStorageErrorOptions, 'retryable' | 'code'>) {
    super({ ...options, retryable: true, code: 'ServiceUnavailable' });
  }
}

/**
 * Timeout error - retryable
 */
export class TimeoutError extends BlobStorageError {
  public readonly operation: string;

  constructor(options: Omit<BlobStorageErrorOptions, 'retryable' | 'code'> & { operation: string }) {
    super({ ...options, retryable: true, code: 'Timeout' });
    this.operation = options.operation;
  }
}

/**
 * Network error - retryable
 */
export class NetworkError extends BlobStorageError {
  constructor(options: Omit<BlobStorageErrorOptions, 'retryable' | 'code'>) {
    super({ ...options, retryable: true, code: 'NetworkError' });
  }
}

/**
 * Upload failed error
 */
export class UploadFailedError extends BlobStorageError {
  public readonly reason: string;

  constructor(options: Omit<BlobStorageErrorOptions, 'code'> & { reason: string }) {
    super({ ...options, code: 'UploadFailed' });
    this.reason = options.reason;
  }
}

/**
 * Download failed error
 */
export class DownloadFailedError extends BlobStorageError {
  public readonly reason: string;

  constructor(options: Omit<BlobStorageErrorOptions, 'code'> & { reason: string }) {
    super({ ...options, code: 'DownloadFailed' });
    this.reason = options.reason;
  }
}

/**
 * Checksum mismatch error
 */
export class ChecksumMismatchError extends BlobStorageError {
  public readonly expected: string;
  public readonly actual: string;

  constructor(options: Omit<BlobStorageErrorOptions, 'retryable' | 'code'> & { expected: string; actual: string }) {
    super({ ...options, retryable: false, code: 'ChecksumMismatch' });
    this.expected = options.expected;
    this.actual = options.actual;
  }
}

/**
 * Copy failed error
 */
export class CopyFailedError extends BlobStorageError {
  public readonly copyId: string;

  constructor(options: Omit<BlobStorageErrorOptions, 'retryable' | 'code'> & { copyId: string }) {
    super({ ...options, retryable: false, code: 'CopyFailed' });
    this.copyId = options.copyId;
  }
}

/**
 * Copy aborted error
 */
export class CopyAbortedError extends BlobStorageError {
  public readonly copyId: string;

  constructor(options: Omit<BlobStorageErrorOptions, 'retryable' | 'code'> & { copyId: string }) {
    super({ ...options, retryable: false, code: 'CopyAborted' });
    this.copyId = options.copyId;
  }
}

/**
 * Configuration error
 */
export class ConfigurationError extends BlobStorageError {
  constructor(options: Omit<BlobStorageErrorOptions, 'retryable' | 'code'>) {
    super({ ...options, retryable: false, code: 'ConfigurationError' });
  }
}

/**
 * Simulation no match error - when replay mode can't find recording
 */
export class SimulationNoMatchError extends BlobStorageError {
  public readonly operation: string;
  public readonly matchKey: string;

  constructor(options: Omit<BlobStorageErrorOptions, 'retryable' | 'code'> & { operation: string; matchKey: string }) {
    super({ ...options, retryable: false, code: 'SimulationNoMatch' });
    this.operation = options.operation;
    this.matchKey = options.matchKey;
  }
}

/**
 * Simulation load error - when recordings can't be loaded
 */
export class SimulationLoadError extends BlobStorageError {
  public readonly path: string;

  constructor(options: Omit<BlobStorageErrorOptions, 'retryable' | 'code'> & { path: string }) {
    super({ ...options, retryable: false, code: 'SimulationLoadError' });
    this.path = options.path;
  }
}

/**
 * Validation error for invalid requests
 */
export class ValidationError extends BlobStorageError {
  public readonly field?: string;

  constructor(options: Omit<BlobStorageErrorOptions, 'retryable' | 'code'> & { field?: string }) {
    super({ ...options, retryable: false, code: 'ValidationError' });
    this.field = options.field;
  }
}

/**
 * Create error from HTTP response
 */
export function createErrorFromResponse(
  statusCode: number,
  body: string | { error?: { code?: string; message?: string } },
  headers?: Record<string, string>,
  container?: string,
  blobName?: string
): BlobStorageError {
  const requestId = headers?.['x-ms-request-id'];
  const retryAfter = headers?.['retry-after'];
  const retryAfterMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined;

  let code: string | undefined;
  let message: string;

  if (typeof body === 'string') {
    message = body;
    // Try to parse error code from XML response
    const codeMatch = body.match(/<Code>([^<]+)<\/Code>/);
    code = codeMatch?.[1];
  } else {
    code = body.error?.code;
    message = body.error?.message ?? 'Unknown error';
  }

  const baseOptions = { message, statusCode, requestId, container, blobName, retryAfterMs };

  switch (statusCode) {
    case 401:
      return new AuthenticationError(baseOptions);
    case 403:
      if (code === 'QuotaExceeded') {
        return new QuotaExceededError(baseOptions);
      }
      return new AuthorizationError(baseOptions);
    case 404:
      if (code === 'ContainerNotFound') {
        return new ContainerNotFoundError(baseOptions);
      }
      return new BlobNotFoundError(baseOptions);
    case 409:
      return new BlobAlreadyExistsError(baseOptions);
    case 503:
      if (code === 'ServerBusy') {
        return new ServerBusyError(baseOptions);
      }
      return new ServiceUnavailableError(baseOptions);
    default:
      return new BlobStorageError({
        ...baseOptions,
        code,
        retryable: statusCode >= 500 || statusCode === 429,
      }) as BlobStorageError;
  }
}

/**
 * Check if status code is retryable
 */
export function isRetryableStatus(statusCode: number): boolean {
  return (
    statusCode === 408 || // Request Timeout
    statusCode === 429 || // Too Many Requests
    statusCode === 500 || // Internal Server Error
    statusCode === 502 || // Bad Gateway
    statusCode === 503 || // Service Unavailable
    statusCode === 504    // Gateway Timeout
  );
}

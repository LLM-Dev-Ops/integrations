/**
 * Azure Key Vault Error Types
 *
 * Error handling specific to Azure Key Vault following SPARC specification.
 */

/** Base error options */
export interface KeyVaultErrorOptions {
  message: string;
  statusCode?: number;
  code?: string;
  vault?: string;
  resourceName?: string;
  requestId?: string;
  retryable?: boolean;
  retryAfterMs?: number;
  cause?: Error;
}

/**
 * Base class for all Azure Key Vault errors
 */
export class KeyVaultError extends Error {
  public readonly statusCode?: number;
  public readonly code?: string;
  public readonly vault?: string;
  public readonly resourceName?: string;
  public readonly requestId?: string;
  public readonly retryable: boolean;
  public readonly retryAfterMs?: number;
  public override readonly cause?: Error;

  constructor(options: KeyVaultErrorOptions) {
    super(options.message);
    this.name = this.constructor.name;
    this.statusCode = options.statusCode;
    this.code = options.code;
    this.vault = options.vault;
    this.resourceName = options.resourceName;
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
      vault: this.vault,
      resourceName: this.resourceName,
      requestId: this.requestId,
      retryable: this.retryable,
      retryAfterMs: this.retryAfterMs,
    };
  }
}

/**
 * Authentication failed error (401) - not retryable
 */
export class AuthenticationFailedError extends KeyVaultError {
  constructor(options: Omit<KeyVaultErrorOptions, 'retryable' | 'code'>) {
    super({ ...options, retryable: false, code: 'AuthenticationFailed' });
  }
}

/**
 * Access denied error (403) - not retryable
 */
export class AccessDeniedError extends KeyVaultError {
  constructor(options: Omit<KeyVaultErrorOptions, 'retryable' | 'code'>) {
    super({ ...options, retryable: false, code: 'AccessDenied' });
  }
}

/**
 * Secret not found error (404) - not retryable
 */
export class SecretNotFoundError extends KeyVaultError {
  constructor(options: Omit<KeyVaultErrorOptions, 'retryable' | 'code'>) {
    super({ ...options, retryable: false, code: 'SecretNotFound' });
  }
}

/**
 * Key not found error (404) - not retryable
 */
export class KeyNotFoundError extends KeyVaultError {
  constructor(options: Omit<KeyVaultErrorOptions, 'retryable' | 'code'>) {
    super({ ...options, retryable: false, code: 'KeyNotFound' });
  }
}

/**
 * Certificate not found error (404) - not retryable
 */
export class CertificateNotFoundError extends KeyVaultError {
  constructor(options: Omit<KeyVaultErrorOptions, 'retryable' | 'code'>) {
    super({ ...options, retryable: false, code: 'CertificateNotFound' });
  }
}

/**
 * Version not found error (404) - not retryable
 */
export class VersionNotFoundError extends KeyVaultError {
  public readonly name: string;
  public readonly version: string;

  constructor(options: Omit<KeyVaultErrorOptions, 'retryable' | 'code'> & { name: string; version: string }) {
    super({ ...options, retryable: false, code: 'VersionNotFound' });
    this.name = options.name;
    this.version = options.version;
  }
}

/**
 * Resource disabled error - not retryable
 */
export class ResourceDisabledError extends KeyVaultError {
  constructor(options: Omit<KeyVaultErrorOptions, 'retryable' | 'code'>) {
    super({ ...options, retryable: false, code: 'ResourceDisabled' });
  }
}

/**
 * Resource deleted error (409) - not retryable
 */
export class ResourceDeletedError extends KeyVaultError {
  constructor(options: Omit<KeyVaultErrorOptions, 'retryable' | 'code'>) {
    super({ ...options, retryable: false, code: 'ResourceDeleted' });
  }
}

/**
 * Secret expired error - not retryable
 */
export class SecretExpiredError extends KeyVaultError {
  constructor(options: Omit<KeyVaultErrorOptions, 'retryable' | 'code'>) {
    super({ ...options, retryable: false, code: 'SecretExpired' });
  }
}

/**
 * Unsupported algorithm error - not retryable
 */
export class UnsupportedAlgorithmError extends KeyVaultError {
  constructor(options: Omit<KeyVaultErrorOptions, 'retryable' | 'code'>) {
    super({ ...options, retryable: false, code: 'UnsupportedAlgorithm' });
  }
}

/**
 * Invalid key operation error - not retryable
 */
export class InvalidKeyOperationError extends KeyVaultError {
  public readonly key: string;
  public readonly operation: string;

  constructor(options: Omit<KeyVaultErrorOptions, 'retryable' | 'code'> & { key: string; operation: string }) {
    super({ ...options, retryable: false, code: 'InvalidKeyOperation' });
    this.key = options.key;
    this.operation = options.operation;
  }
}

/**
 * Decryption failed error - not retryable
 */
export class DecryptionFailedError extends KeyVaultError {
  constructor(options: Omit<KeyVaultErrorOptions, 'retryable' | 'code'>) {
    super({ ...options, retryable: false, code: 'DecryptionFailed' });
  }
}

/**
 * Signature verification failed error - not retryable
 */
export class SignatureVerificationFailedError extends KeyVaultError {
  constructor(options: Omit<KeyVaultErrorOptions, 'retryable' | 'code'>) {
    super({ ...options, retryable: false, code: 'SignatureVerificationFailed' });
  }
}

/**
 * Rate limited error (429) - retryable
 */
export class RateLimitedError extends KeyVaultError {
  constructor(options: Omit<KeyVaultErrorOptions, 'retryable' | 'code'>) {
    super({ ...options, retryable: true, code: 'RateLimited' });
  }
}

/**
 * Service unavailable error (503) - retryable
 */
export class ServiceUnavailableError extends KeyVaultError {
  constructor(options: Omit<KeyVaultErrorOptions, 'retryable' | 'code'>) {
    super({ ...options, retryable: true, code: 'ServiceUnavailable' });
  }
}

/**
 * Internal error (500) - retryable
 */
export class InternalError extends KeyVaultError {
  constructor(options: Omit<KeyVaultErrorOptions, 'retryable' | 'code'>) {
    super({ ...options, retryable: true, code: 'InternalError' });
  }
}

/**
 * Connection error - retryable
 */
export class ConnectionError extends KeyVaultError {
  constructor(options: Omit<KeyVaultErrorOptions, 'retryable' | 'code'>) {
    super({ ...options, retryable: true, code: 'ConnectionError' });
  }
}

/**
 * Timeout error - retryable
 */
export class TimeoutError extends KeyVaultError {
  public readonly timeoutMs: number;

  constructor(options: Omit<KeyVaultErrorOptions, 'retryable' | 'code'> & { timeoutMs: number }) {
    super({ ...options, retryable: true, code: 'Timeout' });
    this.timeoutMs = options.timeoutMs;
  }
}

/**
 * Invalid secret name error - not retryable
 */
export class InvalidSecretNameError extends KeyVaultError {
  constructor(options: Omit<KeyVaultErrorOptions, 'retryable' | 'code'>) {
    super({ ...options, retryable: false, code: 'InvalidSecretName' });
  }
}

/**
 * Secret too large error - not retryable
 */
export class SecretTooLargeError extends KeyVaultError {
  public readonly size: number;
  public readonly maxSize: number;

  constructor(options: Omit<KeyVaultErrorOptions, 'retryable' | 'code'> & { size: number; maxSize: number }) {
    super({ ...options, retryable: false, code: 'SecretTooLarge' });
    this.size = options.size;
    this.maxSize = options.maxSize;
  }
}

/**
 * Configuration error - not retryable
 */
export class ConfigurationError extends KeyVaultError {
  constructor(options: Omit<KeyVaultErrorOptions, 'retryable' | 'code'>) {
    super({ ...options, retryable: false, code: 'ConfigurationError' });
  }
}

/**
 * Secret not yet valid error - not retryable
 */
export class SecretNotYetValidError extends KeyVaultError {
  public readonly validFrom: Date;

  constructor(options: Omit<KeyVaultErrorOptions, 'retryable' | 'code'> & { validFrom: Date }) {
    super({ ...options, retryable: false, code: 'SecretNotYetValid' });
    this.validFrom = options.validFrom;
  }
}

/**
 * Create error from HTTP response
 */
export function createErrorFromResponse(
  statusCode: number,
  body: string | { error?: { code?: string; message?: string } },
  headers?: Record<string, string>,
  vault?: string,
  resourceName?: string
): KeyVaultError {
  const requestId = headers?.['x-ms-request-id'];
  const retryAfter = headers?.['retry-after'];
  const retryAfterMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined;

  let code: string | undefined;
  let message: string;

  if (typeof body === 'string') {
    message = body;
    // Try to parse error code from JSON response
    try {
      const parsed = JSON.parse(body);
      code = parsed.error?.code;
      message = parsed.error?.message ?? message;
    } catch {
      // Body is not JSON, use as-is
    }
  } else {
    code = body.error?.code;
    message = body.error?.message ?? 'Unknown error';
  }

  const baseOptions = { message, statusCode, requestId, vault, resourceName, retryAfterMs };

  switch (statusCode) {
    case 401:
      return new AuthenticationFailedError(baseOptions);
    case 403:
      return new AccessDeniedError(baseOptions);
    case 404:
      if (code === 'SecretNotFound') {
        return new SecretNotFoundError(baseOptions);
      }
      if (code === 'KeyNotFound') {
        return new KeyNotFoundError(baseOptions);
      }
      if (code === 'CertificateNotFound') {
        return new CertificateNotFoundError(baseOptions);
      }
      if (code === 'VersionNotFound') {
        return new VersionNotFoundError({ ...baseOptions, name: '', version: '' });
      }
      // Default to SecretNotFound for 404
      return new SecretNotFoundError(baseOptions);
    case 409:
      return new ResourceDeletedError(baseOptions);
    case 429:
      return new RateLimitedError(baseOptions);
    case 500:
      return new InternalError(baseOptions);
    case 503:
      return new ServiceUnavailableError(baseOptions);
    default:
      return new KeyVaultError({
        ...baseOptions,
        code,
        retryable: isRetryableStatus(statusCode),
      }) as KeyVaultError;
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

/**
 * Azure Active Directory OAuth2 Error Module
 *
 * Error types for Azure AD authentication operations.
 * Following the SPARC specification for Azure AD integration.
 */

/**
 * Error codes for Azure AD errors.
 */
export type AzureAdErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'CERTIFICATE_ERROR'
  | 'INVALID_GRANT'
  | 'INVALID_SCOPE'
  | 'EXPIRED_TOKEN'
  | 'INVALID_TOKEN'
  | 'AUTHORIZATION_PENDING'
  | 'SLOW_DOWN'
  | 'USER_CANCELLED'
  | 'DEVICE_CODE_EXPIRED'
  | 'TENANT_NOT_FOUND'
  | 'MANAGED_IDENTITY_UNAVAILABLE'
  | 'NETWORK_ERROR'
  | 'SERVER_ERROR'
  | 'SIMULATION_NO_MATCH'
  | 'SIMULATION_LOAD_ERROR'
  | 'CONFIGURATION_ERROR';

/**
 * Azure AD error class.
 */
export class AzureAdError extends Error {
  readonly code: AzureAdErrorCode;
  readonly errorCode?: string;  // Azure AD error code
  readonly correlationId?: string;
  readonly timestamp: Date;
  readonly isRetryable: boolean;
  override readonly cause?: Error;

  constructor(
    code: AzureAdErrorCode,
    message: string,
    options?: {
      errorCode?: string;
      correlationId?: string;
      isRetryable?: boolean;
      cause?: Error;
    }
  ) {
    super(message);
    this.name = 'AzureAdError';
    this.code = code;
    this.errorCode = options?.errorCode;
    this.correlationId = options?.correlationId;
    this.timestamp = new Date();
    this.isRetryable = options?.isRetryable ?? false;
    this.cause = options?.cause;
    Error.captureStackTrace?.(this, AzureAdError);
  }
}

/**
 * Check if an error is retryable.
 */
export function isRetryable(error: AzureAdError): boolean {
  return error.isRetryable;
}

/**
 * Create error from OAuth error response.
 */
export function fromOAuthError(error: string, description: string, correlationId?: string): AzureAdError {
  switch (error) {
    case 'invalid_grant':
      return new AzureAdError('INVALID_GRANT', description, {
        errorCode: error,
        correlationId,
        isRetryable: false
      });
    case 'invalid_scope':
      return new AzureAdError('INVALID_SCOPE', description, {
        errorCode: error,
        correlationId,
        isRetryable: false
      });
    case 'authorization_pending':
      return new AzureAdError('AUTHORIZATION_PENDING', description, {
        errorCode: error,
        correlationId,
        isRetryable: true
      });
    case 'slow_down':
      return new AzureAdError('SLOW_DOWN', description, {
        errorCode: error,
        correlationId,
        isRetryable: true
      });
    case 'access_denied':
      return new AzureAdError('USER_CANCELLED', description, {
        errorCode: error,
        correlationId,
        isRetryable: false
      });
    case 'expired_token':
      return new AzureAdError('DEVICE_CODE_EXPIRED', description, {
        errorCode: error,
        correlationId,
        isRetryable: false
      });
    default:
      return new AzureAdError('SERVER_ERROR', description, {
        errorCode: error,
        correlationId,
        isRetryable: error.includes('temporarily')
      });
  }
}

/**
 * Create network error.
 */
export function networkError(cause: Error): AzureAdError {
  return new AzureAdError('NETWORK_ERROR', `Network error: ${cause.message}`, {
    isRetryable: true,
    cause,
  });
}

/**
 * Create configuration error.
 */
export function configError(message: string): AzureAdError {
  return new AzureAdError('CONFIGURATION_ERROR', message, { isRetryable: false });
}

/**
 * Create invalid credentials error.
 */
export function invalidCredentials(message: string): AzureAdError {
  return new AzureAdError('INVALID_CREDENTIALS', message, { isRetryable: false });
}

/**
 * Create expired token error.
 */
export function expiredToken(expiredAt: number): AzureAdError {
  return new AzureAdError('EXPIRED_TOKEN', `Token expired at ${new Date(expiredAt * 1000).toISOString()}`, {
    isRetryable: false,
  });
}

/**
 * Create invalid token error.
 */
export function invalidToken(message: string): AzureAdError {
  return new AzureAdError('INVALID_TOKEN', message, { isRetryable: false });
}

/**
 * Create managed identity unavailable error.
 */
export function managedIdentityUnavailable(message: string): AzureAdError {
  return new AzureAdError('MANAGED_IDENTITY_UNAVAILABLE', message, { isRetryable: false });
}

/**
 * Create simulation no match error.
 */
export function simulationNoMatch(key: string): AzureAdError {
  return new AzureAdError('SIMULATION_NO_MATCH', `No simulation recording found for: ${key}`, {
    isRetryable: false,
  });
}

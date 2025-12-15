/**
 * HuggingFace Inference Endpoints Error Types
 * Error taxonomy as specified in SPARC documentation
 */

export enum HfErrorCode {
  // Client errors (4xx)
  ValidationError = 'VALIDATION_ERROR',
  AuthenticationError = 'AUTHENTICATION_ERROR',
  PermissionDenied = 'PERMISSION_DENIED',
  NotFound = 'NOT_FOUND',
  RateLimited = 'RATE_LIMITED',

  // Cold start errors
  ModelLoading = 'MODEL_LOADING',
  ColdStartTimeout = 'COLD_START_TIMEOUT',

  // Endpoint errors
  EndpointPaused = 'ENDPOINT_PAUSED',
  EndpointFailed = 'ENDPOINT_FAILED',
  EndpointUnhealthy = 'ENDPOINT_UNHEALTHY',

  // Server errors (5xx)
  ServiceUnavailable = 'SERVICE_UNAVAILABLE',
  GatewayTimeout = 'GATEWAY_TIMEOUT',
  ServerError = 'SERVER_ERROR',

  // Network errors
  NetworkError = 'NETWORK_ERROR',

  // Stream errors
  StreamInterrupted = 'STREAM_INTERRUPTED',

  // Provider errors
  ModelNotAvailableOnProvider = 'MODEL_NOT_AVAILABLE_ON_PROVIDER',

  // Configuration errors
  ConfigurationError = 'CONFIGURATION_ERROR',
}

export class HfError extends Error {
  public readonly code: HfErrorCode;
  public readonly statusCode?: number;
  public readonly retryable: boolean;
  public readonly retryAfterMs?: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: HfErrorCode,
    options?: {
      statusCode?: number;
      retryable?: boolean;
      retryAfterMs?: number;
      details?: Record<string, unknown>;
      cause?: Error;
    }
  ) {
    super(message, { cause: options?.cause });
    this.name = 'HfError';
    this.code = code;
    this.statusCode = options?.statusCode;
    this.retryable = options?.retryable ?? this.isRetryableCode(code);
    this.retryAfterMs = options?.retryAfterMs;
    this.details = options?.details;
  }

  private isRetryableCode(code: HfErrorCode): boolean {
    return [
      HfErrorCode.ServiceUnavailable,
      HfErrorCode.GatewayTimeout,
      HfErrorCode.ServerError,
      HfErrorCode.NetworkError,
      HfErrorCode.ModelLoading,
      HfErrorCode.RateLimited,
    ].includes(code);
  }

  /**
   * Returns retry delay if applicable
   */
  getRetryAfter(): number | undefined {
    if (this.code === HfErrorCode.RateLimited && this.retryAfterMs) {
      return this.retryAfterMs;
    }
    return undefined;
  }

  /**
   * Check if this is a retryable error
   */
  isRetryable(): boolean {
    return this.retryable;
  }

  /**
   * Create a human-readable error message
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      retryable: this.retryable,
      retryAfterMs: this.retryAfterMs,
      details: this.details,
    };
  }
}

// Convenience error factory functions

export function createValidationError(message: string, details?: Record<string, unknown>): HfError {
  return new HfError(message, HfErrorCode.ValidationError, {
    statusCode: 400,
    retryable: false,
    details,
  });
}

export function createAuthenticationError(message: string): HfError {
  return new HfError(message, HfErrorCode.AuthenticationError, {
    statusCode: 401,
    retryable: false,
  });
}

export function createPermissionDeniedError(message: string): HfError {
  return new HfError(message, HfErrorCode.PermissionDenied, {
    statusCode: 403,
    retryable: false,
  });
}

export function createNotFoundError(resource: string, message: string): HfError {
  return new HfError(message, HfErrorCode.NotFound, {
    statusCode: 404,
    retryable: false,
    details: { resource },
  });
}

export function createRateLimitedError(message: string, retryAfterMs?: number): HfError {
  return new HfError(message, HfErrorCode.RateLimited, {
    statusCode: 429,
    retryable: true,
    retryAfterMs,
  });
}

export function createModelLoadingError(message: string): HfError {
  return new HfError(message, HfErrorCode.ModelLoading, {
    statusCode: 503,
    retryable: true,
  });
}

export function createColdStartTimeoutError(model: string, waited: number): HfError {
  return new HfError(
    `Cold start timeout after ${waited}ms for model ${model}`,
    HfErrorCode.ColdStartTimeout,
    {
      retryable: false,
      details: { model, waited },
    }
  );
}

export function createEndpointPausedError(endpoint: string): HfError {
  return new HfError(
    `Endpoint ${endpoint} is paused`,
    HfErrorCode.EndpointPaused,
    {
      retryable: false,
      details: { endpoint },
    }
  );
}

export function createEndpointFailedError(endpoint: string, message: string): HfError {
  return new HfError(message, HfErrorCode.EndpointFailed, {
    retryable: false,
    details: { endpoint },
  });
}

export function createServiceUnavailableError(message: string): HfError {
  return new HfError(message, HfErrorCode.ServiceUnavailable, {
    statusCode: 503,
    retryable: true,
  });
}

export function createGatewayTimeoutError(message: string): HfError {
  return new HfError(message, HfErrorCode.GatewayTimeout, {
    statusCode: 504,
    retryable: true,
  });
}

export function createServerError(message: string, statusCode: number): HfError {
  return new HfError(message, HfErrorCode.ServerError, {
    statusCode,
    retryable: statusCode >= 500,
  });
}

export function createNetworkError(message: string, cause?: Error): HfError {
  return new HfError(message, HfErrorCode.NetworkError, {
    retryable: true,
    cause,
  });
}

export function createStreamInterruptedError(message: string): HfError {
  return new HfError(message, HfErrorCode.StreamInterrupted, {
    retryable: true,
  });
}

export function createModelNotAvailableOnProviderError(
  model: string,
  provider: string
): HfError {
  return new HfError(
    `Model ${model} not available on provider ${provider}`,
    HfErrorCode.ModelNotAvailableOnProvider,
    {
      retryable: false,
      details: { model, provider },
    }
  );
}

export function createConfigurationError(message: string): HfError {
  return new HfError(message, HfErrorCode.ConfigurationError, {
    retryable: false,
  });
}

/**
 * Parse HTTP response into appropriate HfError
 */
export async function parseHttpError(
  response: Response,
  defaultMessage: string = 'Request failed'
): Promise<HfError> {
  let errorMessage = defaultMessage;
  let errorDetails: Record<string, unknown> | undefined;

  try {
    const body = await response.text();
    if (body) {
      try {
        const json = JSON.parse(body);
        errorMessage = json.error || json.message || json.detail || defaultMessage;
        errorDetails = json;
      } catch {
        errorMessage = body;
      }
    }
  } catch {
    // Ignore parse errors
  }

  const status = response.status;
  const retryAfterHeader = response.headers.get('retry-after');
  const retryAfterMs = retryAfterHeader ? parseInt(retryAfterHeader, 10) * 1000 : undefined;

  switch (status) {
    case 400:
      return createValidationError(errorMessage, errorDetails);
    case 401:
      return createAuthenticationError(errorMessage);
    case 403:
      return createPermissionDeniedError(errorMessage);
    case 404:
      return createNotFoundError('resource', errorMessage);
    case 429:
      return createRateLimitedError(errorMessage, retryAfterMs);
    case 503:
      // Check if this is a model loading response
      if (errorMessage.toLowerCase().includes('loading') ||
          errorMessage.toLowerCase().includes('initializing')) {
        return createModelLoadingError(errorMessage);
      }
      return createServiceUnavailableError(errorMessage);
    case 504:
      return createGatewayTimeoutError(errorMessage);
    default:
      return createServerError(errorMessage, status);
  }
}

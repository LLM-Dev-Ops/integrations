/**
 * Base error class for all HubSpot API-related errors.
 * Provides structured error information including status code, category, and context.
 */
export class HubSpotError extends Error {
  /**
   * HTTP status code associated with the error
   */
  public readonly statusCode?: number;

  /**
   * Error category from HubSpot API
   */
  public readonly category?: string;

  /**
   * Additional contextual information about the error
   */
  public readonly context?: Record<string, unknown>;

  constructor(options: {
    message: string;
    statusCode?: number;
    category?: string;
    context?: Record<string, unknown>;
  }) {
    super(options.message);
    this.name = 'HubSpotError';
    this.statusCode = options.statusCode;
    this.category = options.category;
    this.context = options.context;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Returns a JSON representation of the error
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      category: this.category,
      context: this.context,
    };
  }
}

// ==================== Authentication Errors ====================

/**
 * Base class for authentication-related errors
 */
export class AuthenticationError extends HubSpotError {
  constructor(options: {
    message: string;
    category?: string;
    context?: Record<string, unknown>;
  }) {
    super({
      ...options,
      statusCode: 401,
    });
    this.name = 'AuthenticationError';
  }
}

/**
 * Error thrown when the API token is invalid
 */
export class InvalidTokenError extends AuthenticationError {
  constructor(context?: Record<string, unknown>) {
    super({
      message: 'The provided API token is invalid',
      category: 'INVALID_AUTHENTICATION',
      context,
    });
    this.name = 'InvalidTokenError';
  }
}

/**
 * Error thrown when the API token has expired
 */
export class ExpiredTokenError extends AuthenticationError {
  constructor(expiresAt?: Date, context?: Record<string, unknown>) {
    super({
      message: `The API token has expired${expiresAt ? ` at ${expiresAt.toISOString()}` : ''}`,
      category: 'EXPIRED_AUTHENTICATION',
      context: { ...context, expiresAt: expiresAt?.toISOString() },
    });
    this.name = 'ExpiredTokenError';
  }
}

/**
 * Error thrown when the API token lacks required OAuth scopes
 */
export class InsufficientScopesError extends AuthenticationError {
  constructor(requiredScopes: string[], providedScopes?: string[], context?: Record<string, unknown>) {
    super({
      message: `Insufficient OAuth scopes. Required: ${requiredScopes.join(', ')}${providedScopes ? `. Provided: ${providedScopes.join(', ')}` : ''}`,
      category: 'MISSING_SCOPES',
      context: { ...context, requiredScopes, providedScopes },
    });
    this.name = 'InsufficientScopesError';
  }
}

// ==================== Rate Limit Errors ====================

/**
 * Base class for rate limit errors
 */
export class RateLimitError extends HubSpotError {
  /**
   * Time in milliseconds to wait before retrying
   */
  public readonly retryAfter: number;

  /**
   * Type of rate limit that was exceeded
   */
  public readonly limitType: 'daily' | 'burst' | 'search';

  constructor(options: {
    message: string;
    limitType: 'daily' | 'burst' | 'search';
    retryAfter: number;
    category?: string;
    context?: Record<string, unknown>;
  }) {
    super({
      ...options,
      statusCode: 429,
      context: { ...options.context, retryAfter: options.retryAfter, limitType: options.limitType },
    });
    this.name = 'RateLimitError';
    this.retryAfter = options.retryAfter;
    this.limitType = options.limitType;
  }
}

/**
 * Error thrown when the daily API call limit is exceeded
 */
export class DailyLimitExceededError extends RateLimitError {
  constructor(retryAfter: number, usedCalls?: number, dailyLimit?: number, context?: Record<string, unknown>) {
    super({
      message: `Daily API call limit exceeded${usedCalls && dailyLimit ? ` (${usedCalls}/${dailyLimit})` : ''}. Resets in ${Math.ceil(retryAfter / 1000)}s`,
      limitType: 'daily',
      retryAfter,
      category: 'RATE_LIMIT',
      context: { ...context, usedCalls, dailyLimit },
    });
    this.name = 'DailyLimitExceededError';
  }
}

/**
 * Error thrown when the burst rate limit (requests per 10 seconds) is exceeded
 */
export class BurstLimitExceededError extends RateLimitError {
  constructor(retryAfter: number, context?: Record<string, unknown>) {
    super({
      message: `Burst rate limit exceeded (100 requests per 10 seconds). Retry after ${Math.ceil(retryAfter / 1000)}s`,
      limitType: 'burst',
      retryAfter,
      category: 'RATE_LIMIT',
      context,
    });
    this.name = 'BurstLimitExceededError';
  }
}

/**
 * Error thrown when the search API rate limit is exceeded
 */
export class SearchLimitExceededError extends RateLimitError {
  constructor(retryAfter: number, searchesPerSecond?: number, context?: Record<string, unknown>) {
    super({
      message: `Search API rate limit exceeded${searchesPerSecond ? ` (${searchesPerSecond} searches/second)` : ''}. Retry after ${Math.ceil(retryAfter / 1000)}s`,
      limitType: 'search',
      retryAfter,
      category: 'RATE_LIMIT',
      context: { ...context, searchesPerSecond },
    });
    this.name = 'SearchLimitExceededError';
  }
}

// ==================== Validation Errors ====================

/**
 * Base class for validation errors
 */
export class ValidationError extends HubSpotError {
  constructor(options: {
    message: string;
    category?: string;
    context?: Record<string, unknown>;
  }) {
    super({
      ...options,
      statusCode: 400,
    });
    this.name = 'ValidationError';
  }
}

/**
 * Error thrown when an invalid property is provided
 */
export class InvalidPropertyError extends ValidationError {
  constructor(propertyName: string, objectType: string, reason?: string, context?: Record<string, unknown>) {
    super({
      message: `Invalid property '${propertyName}' for object type '${objectType}'${reason ? `: ${reason}` : ''}`,
      category: 'INVALID_PROPERTY',
      context: { ...context, propertyName, objectType, reason },
    });
    this.name = 'InvalidPropertyError';
  }
}

/**
 * Error thrown when a required property is missing
 */
export class MissingRequiredError extends ValidationError {
  constructor(propertyName: string, objectType: string, context?: Record<string, unknown>) {
    super({
      message: `Missing required property '${propertyName}' for object type '${objectType}'`,
      category: 'MISSING_REQUIRED_PROPERTY',
      context: { ...context, propertyName, objectType },
    });
    this.name = 'MissingRequiredError';
  }
}

/**
 * Error thrown when a property value has an invalid format
 */
export class InvalidFormatError extends ValidationError {
  constructor(propertyName: string, expectedFormat: string, actualValue?: unknown, context?: Record<string, unknown>) {
    super({
      message: `Invalid format for property '${propertyName}'. Expected: ${expectedFormat}${actualValue !== undefined ? `, got: ${JSON.stringify(actualValue)}` : ''}`,
      category: 'INVALID_FORMAT',
      context: { ...context, propertyName, expectedFormat, actualValue },
    });
    this.name = 'InvalidFormatError';
  }
}

/**
 * Error thrown when a duplicate value is provided for a unique property
 */
export class DuplicateValueError extends ValidationError {
  constructor(propertyName: string, value: unknown, existingObjectId?: string, context?: Record<string, unknown>) {
    super({
      message: `Duplicate value for unique property '${propertyName}': ${JSON.stringify(value)}${existingObjectId ? ` (existing object: ${existingObjectId})` : ''}`,
      category: 'DUPLICATE_VALUE',
      context: { ...context, propertyName, value, existingObjectId },
    });
    this.name = 'DuplicateValueError';
  }
}

// ==================== Object Errors ====================

/**
 * Base class for CRM object-related errors
 */
export class ObjectError extends HubSpotError {
  constructor(options: {
    message: string;
    statusCode?: number;
    category?: string;
    context?: Record<string, unknown>;
  }) {
    super(options);
    this.name = 'ObjectError';
  }
}

/**
 * Error thrown when a requested CRM object is not found
 */
export class ObjectNotFoundError extends ObjectError {
  constructor(objectType: string, objectId: string, context?: Record<string, unknown>) {
    super({
      message: `${objectType} not found: ${objectId}`,
      statusCode: 404,
      category: 'OBJECT_NOT_FOUND',
      context: { ...context, objectType, objectId },
    });
    this.name = 'ObjectNotFoundError';
  }
}

/**
 * Error thrown when attempting to operate on an archived object
 */
export class ObjectArchivedError extends ObjectError {
  constructor(objectType: string, objectId: string, archivedAt?: Date, context?: Record<string, unknown>) {
    super({
      message: `${objectType} is archived: ${objectId}${archivedAt ? ` (archived at ${archivedAt.toISOString()})` : ''}`,
      statusCode: 410,
      category: 'OBJECT_ARCHIVED',
      context: { ...context, objectType, objectId, archivedAt: archivedAt?.toISOString() },
    });
    this.name = 'ObjectArchivedError';
  }
}

/**
 * Error thrown when an association between objects is not allowed
 */
export class AssociationNotAllowedError extends ObjectError {
  constructor(fromType: string, toType: string, reason?: string, context?: Record<string, unknown>) {
    super({
      message: `Association from ${fromType} to ${toType} is not allowed${reason ? `: ${reason}` : ''}`,
      statusCode: 400,
      category: 'INVALID_ASSOCIATION',
      context: { ...context, fromType, toType, reason },
    });
    this.name = 'AssociationNotAllowedError';
  }
}

/**
 * Error thrown when an invalid pipeline stage is specified
 */
export class PipelineStageInvalidError extends ObjectError {
  constructor(objectType: string, stageId: string, pipelineId?: string, context?: Record<string, unknown>) {
    super({
      message: `Invalid pipeline stage '${stageId}' for ${objectType}${pipelineId ? ` in pipeline '${pipelineId}'` : ''}`,
      statusCode: 400,
      category: 'INVALID_PIPELINE_STAGE',
      context: { ...context, objectType, stageId, pipelineId },
    });
    this.name = 'PipelineStageInvalidError';
  }
}

// ==================== Webhook Errors ====================

/**
 * Base class for webhook-related errors
 */
export class WebhookError extends HubSpotError {
  constructor(options: {
    message: string;
    statusCode?: number;
    category?: string;
    context?: Record<string, unknown>;
  }) {
    super(options);
    this.name = 'WebhookError';
  }
}

/**
 * Error thrown when a webhook signature is invalid
 */
export class InvalidSignatureError extends WebhookError {
  constructor(context?: Record<string, unknown>) {
    super({
      message: 'Webhook signature validation failed',
      statusCode: 401,
      category: 'INVALID_SIGNATURE',
      context,
    });
    this.name = 'InvalidSignatureError';
  }
}

/**
 * Error thrown when a webhook event is too old
 */
export class ExpiredEventError extends WebhookError {
  constructor(eventId: number, occurredAt: number, maxAge: number, context?: Record<string, unknown>) {
    super({
      message: `Webhook event ${eventId} is too old (occurred at ${new Date(occurredAt).toISOString()}, max age: ${maxAge}ms)`,
      statusCode: 400,
      category: 'EXPIRED_EVENT',
      context: { ...context, eventId, occurredAt, maxAge },
    });
    this.name = 'ExpiredEventError';
  }
}

/**
 * Error thrown when a webhook payload is malformed
 */
export class MalformedPayloadError extends WebhookError {
  constructor(reason: string, payload?: unknown, context?: Record<string, unknown>) {
    super({
      message: `Malformed webhook payload: ${reason}`,
      statusCode: 400,
      category: 'MALFORMED_PAYLOAD',
      context: { ...context, reason, payload },
    });
    this.name = 'MalformedPayloadError';
  }
}

// ==================== Network Errors ====================

/**
 * Base class for network-related errors
 */
export class NetworkError extends HubSpotError {
  constructor(options: {
    message: string;
    statusCode?: number;
    category?: string;
    context?: Record<string, unknown>;
  }) {
    super(options);
    this.name = 'NetworkError';
  }
}

/**
 * Error thrown when a request times out
 */
export class TimeoutError extends NetworkError {
  constructor(timeoutMs: number, endpoint?: string, context?: Record<string, unknown>) {
    super({
      message: `Request timed out after ${timeoutMs}ms${endpoint ? ` for endpoint: ${endpoint}` : ''}`,
      statusCode: 408,
      category: 'TIMEOUT',
      context: { ...context, timeoutMs, endpoint },
    });
    this.name = 'TimeoutError';
  }
}

/**
 * Error thrown when a network connection fails
 */
export class ConnectionFailedError extends NetworkError {
  constructor(reason: string, endpoint?: string, context?: Record<string, unknown>) {
    super({
      message: `Connection failed${endpoint ? ` to ${endpoint}` : ''}: ${reason}`,
      category: 'CONNECTION_FAILED',
      context: { ...context, reason, endpoint },
    });
    this.name = 'ConnectionFailedError';
  }
}

/**
 * Error thrown when the HubSpot API service is unavailable
 */
export class ServiceUnavailableError extends NetworkError {
  constructor(retryAfter?: number, context?: Record<string, unknown>) {
    super({
      message: `HubSpot API service is currently unavailable${retryAfter ? `. Retry after ${Math.ceil(retryAfter / 1000)}s` : ''}`,
      statusCode: 503,
      category: 'SERVICE_UNAVAILABLE',
      context: { ...context, retryAfter },
    });
    this.name = 'ServiceUnavailableError';
  }
}

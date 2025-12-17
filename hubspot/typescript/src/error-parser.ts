import {
  HubSpotError,
  AuthenticationError,
  InvalidTokenError,
  ExpiredTokenError,
  InsufficientScopesError,
  RateLimitError,
  DailyLimitExceededError,
  BurstLimitExceededError,
  SearchLimitExceededError,
  ValidationError,
  InvalidPropertyError,
  MissingRequiredError,
  InvalidFormatError,
  DuplicateValueError,
  ObjectError,
  ObjectNotFoundError,
  ObjectArchivedError,
  AssociationNotAllowedError,
  PipelineStageInvalidError,
  WebhookError,
  InvalidSignatureError,
  ExpiredEventError,
  MalformedPayloadError,
  NetworkError,
  TimeoutError,
  ConnectionFailedError,
  ServiceUnavailableError,
} from './errors.js';

/**
 * Structure of HubSpot API error responses
 */
interface HubSpotApiErrorResponse {
  status: string;
  message: string;
  correlationId?: string;
  category?: string;
  subCategory?: string;
  errors?: Array<{
    message: string;
    in?: string;
    code?: string;
    context?: Record<string, unknown>;
  }>;
  context?: Record<string, unknown>;
}

/**
 * HTTP response with error details
 */
interface ErrorResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
  endpoint?: string;
}

/**
 * Parses HubSpot API error responses into typed error objects.
 *
 * This function analyzes HTTP error responses from the HubSpot API and maps them
 * to specific error types based on status codes, error categories, and error messages.
 *
 * @param response - The HTTP error response from HubSpot API
 * @returns An appropriate HubSpotError subclass based on the error response
 *
 * @example
 * ```typescript
 * const error = parseHubSpotError({
 *   statusCode: 404,
 *   headers: {},
 *   body: { message: "Contact not found", category: "OBJECT_NOT_FOUND" }
 * });
 * if (error instanceof ObjectNotFoundError) {
 *   console.log(`Object not found: ${error.context.objectType}`);
 * }
 * ```
 */
export function parseHubSpotError(response: ErrorResponse): HubSpotError {
  const { statusCode, headers, body, endpoint } = response;

  // Parse response body
  let errorData: HubSpotApiErrorResponse | null = null;
  if (typeof body === 'object' && body !== null) {
    errorData = body as HubSpotApiErrorResponse;
  }

  const message = errorData?.message ?? 'Unknown HubSpot API error';
  const category = errorData?.category;
  const correlationId = errorData?.correlationId;
  const context: Record<string, unknown> = {
    ...errorData?.context,
    correlationId,
    endpoint,
  };

  // Parse based on status code
  switch (statusCode) {
    case 401:
      return parseAuthenticationError(message, category, errorData, context);

    case 429:
      return parseRateLimitError(headers, message, category, context);

    case 400:
      return parseValidationError(message, category, errorData, context);

    case 404:
      return parseObjectNotFoundError(message, errorData, context);

    case 410:
      return parseObjectArchivedError(message, errorData, context);

    case 408:
      return new TimeoutError(
        parseInt(headers['request-timeout'] ?? '30000', 10),
        endpoint,
        context
      );

    case 503:
    case 502:
    case 504:
      return parseServiceUnavailableError(headers, message, context);

    default:
      // Generic HubSpot error
      return new HubSpotError({
        message,
        statusCode,
        category,
        context,
      });
  }
}

/**
 * Parses authentication-related errors (401)
 */
function parseAuthenticationError(
  message: string,
  category: string | undefined,
  errorData: HubSpotApiErrorResponse | null,
  context: Record<string, unknown>
): AuthenticationError {
  // Check for expired token
  if (
    category === 'EXPIRED_AUTHENTICATION' ||
    message.toLowerCase().includes('expired') ||
    message.toLowerCase().includes('token has expired')
  ) {
    return new ExpiredTokenError(undefined, context);
  }

  // Check for insufficient scopes
  if (
    category === 'MISSING_SCOPES' ||
    message.toLowerCase().includes('scope') ||
    message.toLowerCase().includes('permission')
  ) {
    // Try to extract required scopes from error message or context
    const requiredScopes = extractScopes(message, errorData);
    return new InsufficientScopesError(requiredScopes, undefined, context);
  }

  // Check for invalid token
  if (
    category === 'INVALID_AUTHENTICATION' ||
    message.toLowerCase().includes('invalid') ||
    message.toLowerCase().includes('unauthorized')
  ) {
    return new InvalidTokenError(context);
  }

  // Generic authentication error
  return new AuthenticationError({ message, category, context });
}

/**
 * Parses rate limit errors (429)
 */
function parseRateLimitError(
  headers: Record<string, string>,
  message: string,
  category: string | undefined,
  context: Record<string, unknown>
): RateLimitError {
  // Extract retry-after from headers (in seconds)
  const retryAfterSeconds = parseInt(headers['retry-after'] ?? '10', 10);
  const retryAfter = retryAfterSeconds * 1000;

  // Extract rate limit info from headers
  const dailyRemaining = headers['x-hubspot-ratelimit-daily-remaining'];
  const burstRemaining = headers['x-hubspot-ratelimit-secondly-remaining'];

  // Determine which limit was exceeded
  if (
    message.toLowerCase().includes('daily') ||
    dailyRemaining === '0'
  ) {
    const usedCalls = parseInt(headers['x-hubspot-ratelimit-daily'] ?? '0', 10);
    const dailyLimit = parseInt(headers['x-hubspot-ratelimit-daily'] ?? '0', 10);
    return new DailyLimitExceededError(retryAfter, usedCalls, dailyLimit, context);
  }

  if (
    message.toLowerCase().includes('search') ||
    category === 'SEARCH_RATE_LIMIT'
  ) {
    return new SearchLimitExceededError(retryAfter, undefined, context);
  }

  // Default to burst limit
  return new BurstLimitExceededError(retryAfter, context);
}

/**
 * Parses validation errors (400)
 */
function parseValidationError(
  message: string,
  category: string | undefined,
  errorData: HubSpotApiErrorResponse | null,
  context: Record<string, unknown>
): ValidationError {
  // Check for specific validation error types
  const errors = errorData?.errors ?? [];

  // Check for missing required property
  if (
    category === 'MISSING_REQUIRED_PROPERTY' ||
    message.toLowerCase().includes('required') ||
    errors.some((e) => e.code === 'MISSING_REQUIRED_PROPERTY')
  ) {
    const propertyName = extractPropertyName(message, errorData) ?? 'unknown';
    const objectType = extractObjectType(context) ?? 'object';
    return new MissingRequiredError(propertyName, objectType, context);
  }

  // Check for invalid property
  if (
    category === 'INVALID_PROPERTY' ||
    message.toLowerCase().includes('invalid property') ||
    errors.some((e) => e.code === 'INVALID_PROPERTY')
  ) {
    const propertyName = extractPropertyName(message, errorData) ?? 'unknown';
    const objectType = extractObjectType(context) ?? 'object';
    const reason = errors.find((e) => e.code === 'INVALID_PROPERTY')?.message;
    return new InvalidPropertyError(propertyName, objectType, reason, context);
  }

  // Check for invalid format
  if (
    category === 'INVALID_FORMAT' ||
    message.toLowerCase().includes('invalid format') ||
    message.toLowerCase().includes('must be') ||
    errors.some((e) => e.code === 'INVALID_FORMAT')
  ) {
    const propertyName = extractPropertyName(message, errorData) ?? 'unknown';
    const expectedFormat = extractExpectedFormat(message) ?? 'unknown';
    return new InvalidFormatError(propertyName, expectedFormat, undefined, context);
  }

  // Check for duplicate value
  if (
    category === 'DUPLICATE_VALUE' ||
    message.toLowerCase().includes('duplicate') ||
    message.toLowerCase().includes('already exists') ||
    errors.some((e) => e.code === 'DUPLICATE_VALUE')
  ) {
    const propertyName = extractPropertyName(message, errorData) ?? 'unknown';
    const value = errorData?.context?.value;
    const existingObjectId = errorData?.context?.existingObjectId as string | undefined;
    return new DuplicateValueError(propertyName, value, existingObjectId, context);
  }

  // Check for association errors
  if (
    category === 'INVALID_ASSOCIATION' ||
    message.toLowerCase().includes('association')
  ) {
    const fromType = extractObjectType(context) ?? 'object';
    const toType = (context.toType as string) ?? 'object';
    return new AssociationNotAllowedError(fromType, toType, message, context);
  }

  // Check for pipeline stage errors
  if (
    category === 'INVALID_PIPELINE_STAGE' ||
    message.toLowerCase().includes('pipeline') ||
    message.toLowerCase().includes('stage')
  ) {
    const objectType = extractObjectType(context) ?? 'object';
    const stageId = (context.stageId as string) ?? 'unknown';
    const pipelineId = context.pipelineId as string | undefined;
    return new PipelineStageInvalidError(objectType, stageId, pipelineId, context);
  }

  // Generic validation error
  return new ValidationError({ message, category, context });
}

/**
 * Parses object not found errors (404)
 */
function parseObjectNotFoundError(
  message: string,
  errorData: HubSpotApiErrorResponse | null,
  context: Record<string, unknown>
): ObjectNotFoundError {
  const objectType = extractObjectType(context) ?? 'object';
  const objectId = extractObjectId(message, context) ?? 'unknown';
  return new ObjectNotFoundError(objectType, objectId, context);
}

/**
 * Parses object archived errors (410)
 */
function parseObjectArchivedError(
  message: string,
  errorData: HubSpotApiErrorResponse | null,
  context: Record<string, unknown>
): ObjectArchivedError {
  const objectType = extractObjectType(context) ?? 'object';
  const objectId = extractObjectId(message, context) ?? 'unknown';
  const archivedAt = errorData?.context?.archivedAt
    ? new Date(errorData.context.archivedAt as string | number)
    : undefined;
  return new ObjectArchivedError(objectType, objectId, archivedAt, context);
}

/**
 * Parses service unavailable errors (503, 502, 504)
 */
function parseServiceUnavailableError(
  headers: Record<string, string>,
  message: string,
  context: Record<string, unknown>
): ServiceUnavailableError {
  const retryAfterSeconds = parseInt(headers['retry-after'] ?? '0', 10);
  const retryAfter = retryAfterSeconds > 0 ? retryAfterSeconds * 1000 : undefined;
  return new ServiceUnavailableError(retryAfter, context);
}

/**
 * Parses network errors (connection failures, timeouts)
 */
export function parseNetworkError(error: Error, endpoint?: string): NetworkError {
  const context: Record<string, unknown> = { endpoint };

  // Check for timeout
  if (
    error.message.toLowerCase().includes('timeout') ||
    error.message.toLowerCase().includes('timed out')
  ) {
    return new TimeoutError(30000, endpoint, context);
  }

  // Check for connection failures
  if (
    error.message.toLowerCase().includes('econnrefused') ||
    error.message.toLowerCase().includes('enotfound') ||
    error.message.toLowerCase().includes('econnreset') ||
    error.message.toLowerCase().includes('network')
  ) {
    return new ConnectionFailedError(error.message, endpoint, context);
  }

  // Generic network error
  return new NetworkError({
    message: error.message,
    category: 'NETWORK_ERROR',
    context,
  });
}

// ==================== Helper Functions ====================

/**
 * Extracts OAuth scopes from error message or data
 */
function extractScopes(message: string, errorData: HubSpotApiErrorResponse | null): string[] {
  // Try to extract from context
  if (errorData?.context?.requiredScopes) {
    const scopes = errorData.context.requiredScopes;
    if (Array.isArray(scopes)) {
      return scopes as string[];
    }
  }

  // Try to extract from message (e.g., "Required scopes: crm.objects.contacts.read, crm.objects.contacts.write")
  const scopeMatch = message.match(/scopes?:\s*([^\n.]+)/i);
  if (scopeMatch) {
    return scopeMatch[1]
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  return [];
}

/**
 * Extracts property name from error message or data
 */
function extractPropertyName(message: string, errorData: HubSpotApiErrorResponse | null): string | null {
  // Try to extract from context
  if (errorData?.context?.propertyName) {
    return errorData.context.propertyName as string;
  }

  // Try to extract from errors array
  const propertyError = errorData?.errors?.find((e) => e.in === 'property');
  if (propertyError?.context?.propertyName) {
    return propertyError.context.propertyName as string;
  }

  // Try to extract from message (e.g., "Property 'email' is invalid")
  const propertyMatch = message.match(/property\s+['"]?([a-z_][a-z0-9_]*)['"]?/i);
  if (propertyMatch) {
    return propertyMatch[1];
  }

  return null;
}

/**
 * Extracts object type from context or endpoint
 */
function extractObjectType(context: Record<string, unknown>): string | null {
  // Check context
  if (context.objectType) {
    return context.objectType as string;
  }

  // Try to extract from endpoint
  if (context.endpoint) {
    const endpoint = context.endpoint as string;
    const typeMatch = endpoint.match(/\/objects\/([a-z_]+)/);
    if (typeMatch) {
      return typeMatch[1];
    }
  }

  return null;
}

/**
 * Extracts object ID from message or context
 */
function extractObjectId(message: string, context: Record<string, unknown>): string | null {
  // Check context
  if (context.objectId) {
    return String(context.objectId);
  }

  // Try to extract from message (e.g., "Contact with ID 12345 not found")
  const idMatch = message.match(/(?:id|ID)\s+['"]?(\d+)['"]?/);
  if (idMatch) {
    return idMatch[1];
  }

  return null;
}

/**
 * Extracts expected format from error message
 */
function extractExpectedFormat(message: string): string | null {
  // Try to extract format (e.g., "must be a valid email address")
  const formatMatch = message.match(/must be\s+(?:a\s+)?(?:valid\s+)?([a-z\s]+)/i);
  if (formatMatch) {
    return formatMatch[1].trim();
  }

  return null;
}

/**
 * Checks if an error is retryable based on its type.
 *
 * @param error - The HubSpot error to check
 * @returns true if the error is retryable, false otherwise
 *
 * @example
 * ```typescript
 * const error = parseHubSpotError(response);
 * if (isRetryable(error)) {
 *   // Attempt retry with backoff
 * }
 * ```
 */
export function isRetryable(error: HubSpotError): boolean {
  // Retryable errors are typically transient issues
  const retryableErrorNames = [
    'RateLimitError',
    'DailyLimitExceededError',
    'BurstLimitExceededError',
    'SearchLimitExceededError',
    'TimeoutError',
    'ServiceUnavailableError',
    'ConnectionFailedError',
  ];

  return retryableErrorNames.includes(error.name);
}

/**
 * Determines if an error is a client error (4xx) vs server error (5xx).
 *
 * @param error - The HubSpot error to check
 * @returns true if the error is caused by client (user input/config), false if it's a server error
 */
export function isClientError(error: HubSpotError): boolean {
  if (!error.statusCode) {
    return false;
  }
  return error.statusCode >= 400 && error.statusCode < 500;
}

/**
 * Determines if an error is a server error (5xx).
 *
 * @param error - The HubSpot error to check
 * @returns true if the error is a server error, false otherwise
 */
export function isServerError(error: HubSpotError): boolean {
  if (!error.statusCode) {
    return false;
  }
  return error.statusCode >= 500 && error.statusCode < 600;
}

/**
 * Gets the recommended retry delay for a retryable error.
 *
 * @param error - The HubSpot error to check
 * @param attemptNumber - The current retry attempt number (0-indexed)
 * @returns The recommended delay in milliseconds, or null if not retryable
 *
 * @example
 * ```typescript
 * const error = parseHubSpotError(response);
 * const delay = getRetryDelay(error, 0);
 * if (delay) {
 *   await sleep(delay);
 *   // Retry the request
 * }
 * ```
 */
export function getRetryDelay(error: HubSpotError, attemptNumber: number): number | null {
  if (!isRetryable(error)) {
    return null;
  }

  // Use explicit retryAfter if available (rate limit errors)
  if (error instanceof RateLimitError) {
    return error.retryAfter;
  }

  if (error instanceof ServiceUnavailableError && error.context?.retryAfter) {
    return error.context.retryAfter as number;
  }

  // Exponential backoff for other retryable errors
  // 1s, 2s, 4s, 8s, 16s (capped at 30s)
  const baseDelay = 1000;
  const maxDelay = 30000;
  const delay = Math.min(baseDelay * Math.pow(2, attemptNumber), maxDelay);

  // Add jitter (±30%)
  const jitter = delay * 0.3 * (Math.random() * 2 - 1);
  return Math.floor(delay + jitter);
}

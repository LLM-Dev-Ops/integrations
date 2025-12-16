/**
 * Jira error types and handling following SPARC specification.
 *
 * Error hierarchy with proper categorization for retryable vs non-retryable errors.
 * Maps HTTP status codes to appropriate error types.
 */

/**
 * Error codes for Jira errors.
 */
export enum JiraErrorCode {
  // Configuration errors
  ConfigurationError = 'CONFIGURATION_ERROR',
  NoAuthentication = 'NO_AUTHENTICATION',

  // Authentication errors
  AuthenticationError = 'AUTHENTICATION_ERROR',
  TokenExpired = 'TOKEN_EXPIRED',
  TokenRefreshFailed = 'TOKEN_REFRESH_FAILED',

  // Access errors
  PermissionDenied = 'PERMISSION_DENIED',
  IssueNotFound = 'ISSUE_NOT_FOUND',
  ProjectNotFound = 'PROJECT_NOT_FOUND',
  ResourceNotFound = 'RESOURCE_NOT_FOUND',

  // Validation errors
  ValidationError = 'VALIDATION_ERROR',
  InvalidIssueKey = 'INVALID_ISSUE_KEY',
  InvalidJql = 'INVALID_JQL',
  RequiredFieldMissing = 'REQUIRED_FIELD_MISSING',
  FieldNotEditable = 'FIELD_NOT_EDITABLE',

  // Workflow errors
  WorkflowError = 'WORKFLOW_ERROR',
  TransitionNotAllowed = 'TRANSITION_NOT_ALLOWED',
  TransitionNotFound = 'TRANSITION_NOT_FOUND',
  AlreadyInStatus = 'ALREADY_IN_STATUS',

  // Rate limiting
  RateLimited = 'RATE_LIMITED',
  RateLimitTimeout = 'RATE_LIMIT_TIMEOUT',

  // Network/Server errors
  NetworkError = 'NETWORK_ERROR',
  TimeoutError = 'TIMEOUT_ERROR',
  ServerError = 'SERVER_ERROR',
  ServiceUnavailable = 'SERVICE_UNAVAILABLE',

  // Webhook errors
  WebhookSignatureInvalid = 'WEBHOOK_SIGNATURE_INVALID',
  WebhookTimestampExpired = 'WEBHOOK_TIMESTAMP_EXPIRED',
  WebhookPayloadInvalid = 'WEBHOOK_PAYLOAD_INVALID',

  // Simulation errors
  SimulationNoMatch = 'SIMULATION_NO_MATCH',
  SimulationLoadError = 'SIMULATION_LOAD_ERROR',

  // Bulk operation errors
  BulkOperationPartialFailure = 'BULK_OPERATION_PARTIAL_FAILURE',

  // Circuit breaker
  CircuitBreakerOpen = 'CIRCUIT_BREAKER_OPEN',
}

/**
 * Jira API error response structure.
 */
export interface JiraApiErrorResponse {
  /** Error messages array */
  errorMessages?: string[];
  /** Field-specific errors */
  errors?: Record<string, string>;
  /** Status code (for some error types) */
  status?: number;
}

/**
 * Base Jira error class.
 */
export class JiraError extends Error {
  /** Error code */
  readonly code: JiraErrorCode;
  /** HTTP status code (if applicable) */
  readonly statusCode?: number;
  /** Whether this error is retryable */
  readonly retryable: boolean;
  /** Retry-after duration in milliseconds */
  readonly retryAfterMs?: number;
  /** Additional error details */
  readonly details?: Record<string, unknown>;

  constructor(options: {
    code: JiraErrorCode;
    message: string;
    statusCode?: number;
    retryable?: boolean;
    retryAfterMs?: number;
    details?: Record<string, unknown>;
    cause?: Error;
  }) {
    super(options.message, { cause: options.cause });
    this.name = 'JiraError';
    this.code = options.code;
    this.statusCode = options.statusCode;
    this.retryable = options.retryable ?? false;
    this.retryAfterMs = options.retryAfterMs;
    this.details = options.details;
  }

  /**
   * Creates a JSON representation of the error.
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      retryable: this.retryable,
      retryAfterMs: this.retryAfterMs,
      details: this.details,
    };
  }
}

// ============================================================================
// Configuration Errors (Non-Retryable)
// ============================================================================

/**
 * Configuration error.
 */
export class ConfigurationError extends JiraError {
  constructor(message: string) {
    super({
      code: JiraErrorCode.ConfigurationError,
      message: `Configuration error: ${message}`,
      retryable: false,
    });
    this.name = 'ConfigurationError';
  }
}

/**
 * No authentication configured.
 */
export class NoAuthenticationError extends JiraError {
  constructor() {
    super({
      code: JiraErrorCode.NoAuthentication,
      message: 'No authentication configured (API token, OAuth, or Connect JWT required)',
      retryable: false,
    });
    this.name = 'NoAuthenticationError';
  }
}

// ============================================================================
// Authentication Errors (Conditionally Retryable)
// ============================================================================

/**
 * Authentication failed.
 */
export class AuthenticationError extends JiraError {
  constructor(message: string = 'Authentication failed') {
    super({
      code: JiraErrorCode.AuthenticationError,
      message,
      statusCode: 401,
      retryable: false,
    });
    this.name = 'AuthenticationError';
  }
}

/**
 * Token has expired.
 */
export class TokenExpiredError extends JiraError {
  constructor() {
    super({
      code: JiraErrorCode.TokenExpired,
      message: 'Authentication token has expired',
      statusCode: 401,
      retryable: true, // Can retry after refresh
    });
    this.name = 'TokenExpiredError';
  }
}

/**
 * Token refresh failed.
 */
export class TokenRefreshFailedError extends JiraError {
  constructor(message: string = 'Failed to refresh authentication token') {
    super({
      code: JiraErrorCode.TokenRefreshFailed,
      message,
      retryable: false,
    });
    this.name = 'TokenRefreshFailedError';
  }
}

// ============================================================================
// Access Errors (Non-Retryable)
// ============================================================================

/**
 * Permission denied.
 */
export class PermissionDeniedError extends JiraError {
  constructor(message: string = 'Permission denied for this operation') {
    super({
      code: JiraErrorCode.PermissionDenied,
      message,
      statusCode: 403,
      retryable: false,
    });
    this.name = 'PermissionDeniedError';
  }
}

/**
 * Issue not found.
 */
export class IssueNotFoundError extends JiraError {
  constructor(issueKeyOrId: string) {
    super({
      code: JiraErrorCode.IssueNotFound,
      message: `Issue not found: ${issueKeyOrId}`,
      statusCode: 404,
      retryable: false,
      details: { issueKeyOrId },
    });
    this.name = 'IssueNotFoundError';
  }
}

/**
 * Project not found.
 */
export class ProjectNotFoundError extends JiraError {
  constructor(projectKeyOrId: string) {
    super({
      code: JiraErrorCode.ProjectNotFound,
      message: `Project not found: ${projectKeyOrId}`,
      statusCode: 404,
      retryable: false,
      details: { projectKeyOrId },
    });
    this.name = 'ProjectNotFoundError';
  }
}

/**
 * Generic resource not found.
 */
export class ResourceNotFoundError extends JiraError {
  constructor(resource: string) {
    super({
      code: JiraErrorCode.ResourceNotFound,
      message: `Resource not found: ${resource}`,
      statusCode: 404,
      retryable: false,
      details: { resource },
    });
    this.name = 'ResourceNotFoundError';
  }
}

// ============================================================================
// Validation Errors (Non-Retryable)
// ============================================================================

/**
 * Validation error.
 */
export class ValidationError extends JiraError {
  constructor(errors: string[], fieldErrors?: Record<string, string>) {
    super({
      code: JiraErrorCode.ValidationError,
      message: `Validation failed: ${errors.join(', ')}`,
      statusCode: 400,
      retryable: false,
      details: { errors, fieldErrors },
    });
    this.name = 'ValidationError';
  }
}

/**
 * Invalid issue key format.
 */
export class InvalidIssueKeyError extends JiraError {
  constructor(key: string) {
    super({
      code: JiraErrorCode.InvalidIssueKey,
      message: `Invalid issue key format: ${key}`,
      retryable: false,
      details: { key },
    });
    this.name = 'InvalidIssueKeyError';
  }
}

/**
 * Invalid JQL query.
 */
export class InvalidJqlError extends JiraError {
  constructor(jql: string, reason?: string) {
    super({
      code: JiraErrorCode.InvalidJql,
      message: reason ? `Invalid JQL: ${reason}` : `Invalid JQL query: ${jql}`,
      statusCode: 400,
      retryable: false,
      details: { jql, reason },
    });
    this.name = 'InvalidJqlError';
  }
}

/**
 * Required field missing.
 */
export class RequiredFieldMissingError extends JiraError {
  constructor(fields: string[]) {
    super({
      code: JiraErrorCode.RequiredFieldMissing,
      message: `Required fields missing: ${fields.join(', ')}`,
      statusCode: 400,
      retryable: false,
      details: { fields },
    });
    this.name = 'RequiredFieldMissingError';
  }
}

/**
 * Field not editable.
 */
export class FieldNotEditableError extends JiraError {
  constructor(field: string) {
    super({
      code: JiraErrorCode.FieldNotEditable,
      message: `Field is not editable: ${field}`,
      statusCode: 400,
      retryable: false,
      details: { field },
    });
    this.name = 'FieldNotEditableError';
  }
}

// ============================================================================
// Workflow Errors (Non-Retryable)
// ============================================================================

/**
 * General workflow error.
 */
export class WorkflowError extends JiraError {
  constructor(message: string) {
    super({
      code: JiraErrorCode.WorkflowError,
      message: `Workflow error: ${message}`,
      statusCode: 409,
      retryable: false,
    });
    this.name = 'WorkflowError';
  }
}

/**
 * Transition not allowed from current status.
 */
export class TransitionNotAllowedError extends JiraError {
  constructor(transition: string, currentStatus: string) {
    super({
      code: JiraErrorCode.TransitionNotAllowed,
      message: `Transition '${transition}' not allowed from status '${currentStatus}'`,
      statusCode: 409,
      retryable: false,
      details: { transition, currentStatus },
    });
    this.name = 'TransitionNotAllowedError';
  }
}

/**
 * Transition not found.
 */
export class TransitionNotFoundError extends JiraError {
  constructor(transitionNameOrId: string) {
    super({
      code: JiraErrorCode.TransitionNotFound,
      message: `Transition not found: ${transitionNameOrId}`,
      statusCode: 404,
      retryable: false,
      details: { transitionNameOrId },
    });
    this.name = 'TransitionNotFoundError';
  }
}

/**
 * Issue is already in target status.
 */
export class AlreadyInStatusError extends JiraError {
  constructor(status: string) {
    super({
      code: JiraErrorCode.AlreadyInStatus,
      message: `Issue is already in status: ${status}`,
      retryable: false,
      details: { status },
    });
    this.name = 'AlreadyInStatusError';
  }
}

// ============================================================================
// Rate Limiting Errors (Retryable)
// ============================================================================

/**
 * Rate limited by Jira API.
 */
export class RateLimitedError extends JiraError {
  constructor(retryAfterMs: number) {
    super({
      code: JiraErrorCode.RateLimited,
      message: `Rate limited, retry after ${retryAfterMs}ms`,
      statusCode: 429,
      retryable: true,
      retryAfterMs,
    });
    this.name = 'RateLimitedError';
  }
}

/**
 * Rate limit wait time exceeded timeout.
 */
export class RateLimitTimeoutError extends JiraError {
  constructor(waitTime: number, maxWait: number) {
    super({
      code: JiraErrorCode.RateLimitTimeout,
      message: `Rate limit wait time (${waitTime}ms) exceeds maximum (${maxWait}ms)`,
      retryable: false,
      details: { waitTime, maxWait },
    });
    this.name = 'RateLimitTimeoutError';
  }
}

// ============================================================================
// Network/Server Errors (Retryable)
// ============================================================================

/**
 * Network error.
 */
export class NetworkError extends JiraError {
  constructor(message: string, cause?: Error) {
    super({
      code: JiraErrorCode.NetworkError,
      message: `Network error: ${message}`,
      retryable: true,
      cause,
    });
    this.name = 'NetworkError';
  }
}

/**
 * Request timeout.
 */
export class TimeoutError extends JiraError {
  constructor(timeoutMs: number) {
    super({
      code: JiraErrorCode.TimeoutError,
      message: `Request timed out after ${timeoutMs}ms`,
      retryable: true,
      details: { timeoutMs },
    });
    this.name = 'TimeoutError';
  }
}

/**
 * Jira server error.
 */
export class ServerError extends JiraError {
  constructor(statusCode: number, message: string = 'Jira server error') {
    super({
      code: JiraErrorCode.ServerError,
      message,
      statusCode,
      retryable: true,
    });
    this.name = 'ServerError';
  }
}

/**
 * Service unavailable.
 */
export class ServiceUnavailableError extends JiraError {
  constructor(retryAfterMs?: number) {
    super({
      code: JiraErrorCode.ServiceUnavailable,
      message: 'Jira service is temporarily unavailable',
      statusCode: 503,
      retryable: true,
      retryAfterMs,
    });
    this.name = 'ServiceUnavailableError';
  }
}

// ============================================================================
// Webhook Errors (Non-Retryable)
// ============================================================================

/**
 * Invalid webhook signature.
 */
export class WebhookSignatureInvalidError extends JiraError {
  constructor() {
    super({
      code: JiraErrorCode.WebhookSignatureInvalid,
      message: 'Invalid webhook signature',
      statusCode: 401,
      retryable: false,
    });
    this.name = 'WebhookSignatureInvalidError';
  }
}

/**
 * Webhook timestamp too old.
 */
export class WebhookTimestampExpiredError extends JiraError {
  constructor(ageMs: number, maxAgeMs: number) {
    super({
      code: JiraErrorCode.WebhookTimestampExpired,
      message: `Webhook timestamp expired (age: ${ageMs}ms, max: ${maxAgeMs}ms)`,
      statusCode: 400,
      retryable: false,
      details: { ageMs, maxAgeMs },
    });
    this.name = 'WebhookTimestampExpiredError';
  }
}

/**
 * Invalid webhook payload.
 */
export class WebhookPayloadInvalidError extends JiraError {
  constructor(reason: string) {
    super({
      code: JiraErrorCode.WebhookPayloadInvalid,
      message: `Invalid webhook payload: ${reason}`,
      statusCode: 400,
      retryable: false,
      details: { reason },
    });
    this.name = 'WebhookPayloadInvalidError';
  }
}

// ============================================================================
// Simulation Errors (Non-Retryable)
// ============================================================================

/**
 * No matching simulation recording.
 */
export class SimulationNoMatchError extends JiraError {
  constructor(key: string) {
    super({
      code: JiraErrorCode.SimulationNoMatch,
      message: `No simulation recording matches key: ${key}`,
      retryable: false,
      details: { key },
    });
    this.name = 'SimulationNoMatchError';
  }
}

/**
 * Failed to load simulation recordings.
 */
export class SimulationLoadError extends JiraError {
  constructor(path: string, cause?: Error) {
    super({
      code: JiraErrorCode.SimulationLoadError,
      message: `Failed to load simulation recordings from: ${path}`,
      retryable: false,
      details: { path },
      cause,
    });
    this.name = 'SimulationLoadError';
  }
}

// ============================================================================
// Bulk Operation Errors
// ============================================================================

/**
 * Bulk operation had partial failures.
 */
export class BulkOperationPartialFailureError extends JiraError {
  constructor(successCount: number, failureCount: number) {
    super({
      code: JiraErrorCode.BulkOperationPartialFailure,
      message: `Bulk operation partially failed: ${successCount} succeeded, ${failureCount} failed`,
      retryable: false,
      details: { successCount, failureCount },
    });
    this.name = 'BulkOperationPartialFailureError';
  }
}

// ============================================================================
// Circuit Breaker Errors
// ============================================================================

/**
 * Circuit breaker is open.
 */
export class CircuitBreakerOpenError extends JiraError {
  constructor(resetTimeMs: number) {
    super({
      code: JiraErrorCode.CircuitBreakerOpen,
      message: 'Circuit breaker is open, rejecting requests',
      retryable: false,
      details: { resetTimeMs },
    });
    this.name = 'CircuitBreakerOpenError';
  }
}

// ============================================================================
// Error Parsing Utilities
// ============================================================================

/**
 * Parses a Jira API error response into the appropriate error type.
 */
export function parseJiraApiError(
  statusCode: number,
  body: JiraApiErrorResponse | null,
  retryAfterHeader?: string
): JiraError {
  const errorMessages = body?.errorMessages ?? [];
  const fieldErrors = body?.errors ?? {};
  const message = errorMessages.length > 0
    ? errorMessages.join('; ')
    : Object.entries(fieldErrors).map(([k, v]) => `${k}: ${v}`).join('; ') || `HTTP ${statusCode}`;

  switch (statusCode) {
    case 400:
      // Check for specific validation errors
      if (Object.keys(fieldErrors).length > 0) {
        return new ValidationError(errorMessages, fieldErrors);
      }
      // Check for JQL errors
      if (message.toLowerCase().includes('jql')) {
        return new InvalidJqlError('', message);
      }
      return new ValidationError([message]);

    case 401:
      if (message.toLowerCase().includes('expired')) {
        return new TokenExpiredError();
      }
      return new AuthenticationError(message);

    case 403:
      return new PermissionDeniedError(message);

    case 404:
      // Try to determine resource type from message
      if (message.toLowerCase().includes('issue')) {
        return new IssueNotFoundError(message);
      }
      if (message.toLowerCase().includes('project')) {
        return new ProjectNotFoundError(message);
      }
      return new ResourceNotFoundError(message);

    case 409:
      return new WorkflowError(message);

    case 429: {
      // Rate limited - extract retry-after
      let retryAfterMs = 60000; // Default 60 seconds
      if (retryAfterHeader) {
        const retryAfter = parseFloat(retryAfterHeader);
        // Jira can return seconds or milliseconds
        retryAfterMs = retryAfter < 1000 ? retryAfter * 1000 : retryAfter;
      }
      return new RateLimitedError(retryAfterMs);
    }

    case 503: {
      let retryAfterMs: number | undefined;
      if (retryAfterHeader) {
        retryAfterMs = parseFloat(retryAfterHeader) * 1000;
      }
      return new ServiceUnavailableError(retryAfterMs);
    }

    default:
      if (statusCode >= 500) {
        return new ServerError(statusCode, message);
      }
      return new ValidationError([message]);
  }
}

/**
 * Checks if an error is a Jira error.
 */
export function isJiraError(error: unknown): error is JiraError {
  return error instanceof JiraError;
}

/**
 * Checks if an error is retryable.
 */
export function isRetryableError(error: unknown): boolean {
  if (isJiraError(error)) {
    return error.retryable;
  }
  // Network errors from fetch are typically retryable
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return true;
  }
  return false;
}

/**
 * Gets retry delay from error, if applicable.
 */
export function getRetryDelayMs(error: unknown): number | undefined {
  if (isJiraError(error)) {
    return error.retryAfterMs;
  }
  return undefined;
}

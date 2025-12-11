/**
 * Error types for the Slack client.
 */

/**
 * Base error class for Slack operations
 */
export abstract class SlackError extends Error {
  abstract readonly code: string;
  abstract readonly retryable: boolean;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }

  /**
   * Get HTTP status code if applicable
   */
  get httpStatus(): number | undefined {
    return undefined;
  }

  /**
   * Get retry-after duration if applicable
   */
  get retryAfter(): number | undefined {
    return undefined;
  }
}

/**
 * Configuration errors
 */
export class ConfigurationError extends SlackError {
  readonly code = 'SLACK_CONFIG';
  readonly retryable = false;

  constructor(message: string) {
    super(`Configuration error: ${message}`);
  }
}

/**
 * Authentication errors (401)
 */
export class AuthenticationError extends SlackError {
  readonly code = 'SLACK_AUTH';
  readonly retryable = false;

  constructor(
    message: string,
    public readonly errorCode?: string
  ) {
    super(`Authentication error: ${message}`);
  }

  get httpStatus(): number {
    return 401;
  }

  static invalidAuth(): AuthenticationError {
    return new AuthenticationError('Invalid authentication credentials', 'invalid_auth');
  }

  static tokenRevoked(): AuthenticationError {
    return new AuthenticationError('Token has been revoked', 'token_revoked');
  }

  static tokenExpired(): AuthenticationError {
    return new AuthenticationError('Token has expired', 'token_expired');
  }
}

/**
 * Authorization errors (403)
 */
export class AuthorizationError extends SlackError {
  readonly code = 'SLACK_AUTHZ';
  readonly retryable = false;

  constructor(
    message: string,
    public readonly errorCode?: string
  ) {
    super(`Authorization error: ${message}`);
  }

  get httpStatus(): number {
    return 403;
  }

  static missingScope(scope: string): AuthorizationError {
    return new AuthorizationError(`Missing scope: ${scope}`, 'missing_scope');
  }

  static channelNotFound(): AuthorizationError {
    return new AuthorizationError('Channel not found', 'channel_not_found');
  }

  static userNotFound(): AuthorizationError {
    return new AuthorizationError('User not found', 'user_not_found');
  }
}

/**
 * Request validation errors (400)
 */
export class RequestError extends SlackError {
  readonly code = 'SLACK_REQUEST';
  readonly retryable = false;

  constructor(
    message: string,
    public readonly errorCode?: string
  ) {
    super(`Request error: ${message}`);
  }

  get httpStatus(): number {
    return 400;
  }

  static invalidArguments(message: string): RequestError {
    return new RequestError(message, 'invalid_arguments');
  }

  static messageTooLong(): RequestError {
    return new RequestError('Message is too long', 'msg_too_long');
  }
}

/**
 * Rate limit errors (429)
 */
export class RateLimitError extends SlackError {
  readonly code = 'SLACK_RATE_LIMIT';
  readonly retryable = true;
  private readonly _retryAfter: number;

  constructor(
    retryAfterSeconds: number,
    public readonly tier?: string
  ) {
    super(`Rate limited, retry after ${retryAfterSeconds} seconds`);
    this._retryAfter = retryAfterSeconds * 1000;
  }

  get httpStatus(): number {
    return 429;
  }

  get retryAfter(): number {
    return this._retryAfter;
  }
}

/**
 * Network errors
 */
export class NetworkError extends SlackError {
  readonly code = 'SLACK_NETWORK';
  readonly retryable: boolean;

  constructor(
    message: string,
    public readonly errorType: 'timeout' | 'connection' | 'dns' | 'http'
  ) {
    super(`Network error: ${message}`);
    this.retryable = errorType === 'timeout' || errorType === 'connection';
  }

  static timeout(): NetworkError {
    return new NetworkError('Request timed out', 'timeout');
  }

  static connectionFailed(message: string): NetworkError {
    return new NetworkError(`Connection failed: ${message}`, 'connection');
  }
}

/**
 * Server errors (5xx)
 */
export class ServerError extends SlackError {
  readonly code = 'SLACK_SERVER';
  readonly retryable = true;

  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(`Server error: ${message}`);
  }

  get httpStatus(): number {
    return this.statusCode;
  }

  static internalError(): ServerError {
    return new ServerError('Internal server error', 500);
  }

  static serviceUnavailable(): ServerError {
    return new ServerError('Service unavailable', 503);
  }
}

/**
 * Response parsing errors
 */
export class ResponseError extends SlackError {
  readonly code = 'SLACK_RESPONSE';
  readonly retryable = false;

  constructor(message: string) {
    super(`Response error: ${message}`);
  }
}

/**
 * Webhook errors
 */
export class WebhookError extends SlackError {
  readonly code = 'SLACK_WEBHOOK';
  readonly retryable = false;

  constructor(
    message: string,
    public readonly errorType: 'signature' | 'timestamp' | 'payload'
  ) {
    super(`Webhook error: ${message}`);
  }

  static invalidSignature(): WebhookError {
    return new WebhookError('Invalid signature', 'signature');
  }

  static expiredTimestamp(timestamp: number): WebhookError {
    return new WebhookError(`Timestamp is too old: ${timestamp}`, 'timestamp');
  }
}

/**
 * Socket Mode errors
 */
export class SocketModeError extends SlackError {
  readonly code = 'SLACK_SOCKET_MODE';
  readonly retryable: boolean;

  constructor(
    message: string,
    public readonly errorType: 'connection' | 'reconnect' | 'ack' | 'envelope'
  ) {
    super(`Socket Mode error: ${message}`);
    this.retryable = errorType === 'connection';
  }

  static connectionFailed(message: string): SocketModeError {
    return new SocketModeError(`Connection failed: ${message}`, 'connection');
  }

  static reconnectFailed(attempts: number): SocketModeError {
    return new SocketModeError(`Failed to reconnect after ${attempts} attempts`, 'reconnect');
  }
}

/**
 * Generic API error for unmapped Slack errors
 */
export class ApiError extends SlackError {
  readonly code = 'SLACK_API';
  readonly retryable = false;

  constructor(
    public readonly errorCode: string,
    message: string
  ) {
    super(`API error: ${errorCode} - ${message}`);
  }
}

/**
 * Create an error from a Slack API error response
 */
export function fromSlackError(code: string, message?: string): SlackError {
  const msg = message || 'Unknown error';

  switch (code) {
    case 'invalid_auth':
      return AuthenticationError.invalidAuth();
    case 'account_inactive':
      return new AuthenticationError('Account is inactive', code);
    case 'token_revoked':
      return AuthenticationError.tokenRevoked();
    case 'token_expired':
      return AuthenticationError.tokenExpired();
    case 'not_authed':
      return new AuthorizationError('Not authenticated', code);
    case 'missing_scope':
      return AuthorizationError.missingScope(msg);
    case 'channel_not_found':
      return AuthorizationError.channelNotFound();
    case 'user_not_found':
      return AuthorizationError.userNotFound();
    case 'invalid_arguments':
      return RequestError.invalidArguments(msg);
    case 'msg_too_long':
      return RequestError.messageTooLong();
    case 'internal_error':
      return ServerError.internalError();
    case 'service_unavailable':
      return ServerError.serviceUnavailable();
    default:
      return new ApiError(code, msg);
  }
}

/**
 * Type guard for SlackError
 */
export function isSlackError(error: unknown): error is SlackError {
  return error instanceof SlackError;
}

/**
 * Type guard for retryable errors
 */
export function isRetryableError(error: unknown): boolean {
  return isSlackError(error) && error.retryable;
}

/**
 * Microsoft Teams Error Types
 *
 * Comprehensive error hierarchy following the SPARC specification.
 */

/**
 * Error codes for Teams errors.
 */
export enum TeamsErrorCode {
  // Authentication
  AuthenticationFailed = 'AUTHENTICATION_FAILED',
  TokenExpired = 'TOKEN_EXPIRED',
  TenantNotAuthorized = 'TENANT_NOT_AUTHORIZED',
  InsufficientPermissions = 'INSUFFICIENT_PERMISSIONS',

  // Webhook
  WebhookConfigurationError = 'WEBHOOK_CONFIG_ERROR',
  WebhookNotFound = 'WEBHOOK_NOT_FOUND',
  InvalidWebhookUrl = 'INVALID_WEBHOOK_URL',

  // Bot
  BotNotConfigured = 'BOT_NOT_CONFIGURED',
  ConversationNotFound = 'CONVERSATION_NOT_FOUND',
  BotNotInTeam = 'BOT_NOT_IN_TEAM',
  UserBlockedBot = 'USER_BLOCKED_BOT',
  ActivityNotFound = 'ACTIVITY_NOT_FOUND',
  InvalidActivity = 'INVALID_ACTIVITY',

  // Resources
  TeamNotFound = 'TEAM_NOT_FOUND',
  ChannelNotFound = 'CHANNEL_NOT_FOUND',
  ChannelArchived = 'CHANNEL_ARCHIVED',
  ChatNotFound = 'CHAT_NOT_FOUND',
  UserNotFound = 'USER_NOT_FOUND',

  // Validation
  ValidationError = 'VALIDATION_ERROR',
  CardTooLarge = 'CARD_TOO_LARGE',
  CardValidationFailed = 'CARD_VALIDATION_FAILED',
  TextTooLong = 'TEXT_TOO_LONG',
  MessageTooLarge = 'MESSAGE_TOO_LARGE',

  // Resilience
  RateLimited = 'RATE_LIMITED',
  CircuitBreakerOpen = 'CIRCUIT_BREAKER_OPEN',
  Timeout = 'TIMEOUT',

  // Transport
  HttpError = 'HTTP_ERROR',
  NetworkError = 'NETWORK_ERROR',
  ServiceUnavailable = 'SERVICE_UNAVAILABLE',

  // Routing
  CircularRouting = 'CIRCULAR_ROUTING',
  AllDestinationsFailed = 'ALL_DESTINATIONS_FAILED',
  NoRouteFound = 'NO_ROUTE_FOUND',

  // Serialization
  SerializationError = 'SERIALIZATION_ERROR',

  // Configuration
  ConfigurationError = 'CONFIGURATION_ERROR',
}

/**
 * Base Teams error class.
 */
export class TeamsError extends Error {
  readonly code: TeamsErrorCode;
  readonly statusCode?: number;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;
  readonly requestId?: string;
  readonly details?: Record<string, unknown>;

  constructor(options: {
    code: TeamsErrorCode;
    message: string;
    statusCode?: number;
    retryable?: boolean;
    retryAfterMs?: number;
    requestId?: string;
    details?: Record<string, unknown>;
    cause?: Error;
  }) {
    super(options.message, { cause: options.cause });
    this.name = 'TeamsError';
    this.code = options.code;
    this.statusCode = options.statusCode;
    this.retryable = options.retryable ?? false;
    this.retryAfterMs = options.retryAfterMs;
    this.requestId = options.requestId;
    this.details = options.details;
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      retryable: this.retryable,
      retryAfterMs: this.retryAfterMs,
      requestId: this.requestId,
      details: this.details,
    };
  }
}

// ============================================================================
// Authentication Errors (Non-Retryable)
// ============================================================================

export class AuthenticationError extends TeamsError {
  constructor(message: string, options?: { requestId?: string; statusCode?: number }) {
    super({
      code: TeamsErrorCode.AuthenticationFailed,
      message,
      statusCode: options?.statusCode ?? 401,
      retryable: false,
      requestId: options?.requestId,
    });
    this.name = 'AuthenticationError';
  }
}

export class TokenExpiredError extends TeamsError {
  constructor(message: string = 'Access token has expired') {
    super({
      code: TeamsErrorCode.TokenExpired,
      message,
      statusCode: 401,
      retryable: false,
    });
    this.name = 'TokenExpiredError';
  }
}

export class TenantNotAuthorizedError extends TeamsError {
  readonly tenantId: string;

  constructor(tenantId: string) {
    super({
      code: TeamsErrorCode.TenantNotAuthorized,
      message: `Tenant not authorized: ${tenantId}`,
      statusCode: 401,
      retryable: false,
      details: { tenantId },
    });
    this.name = 'TenantNotAuthorizedError';
    this.tenantId = tenantId;
  }
}

export class InsufficientPermissionsError extends TeamsError {
  readonly permission: string;

  constructor(permission: string) {
    super({
      code: TeamsErrorCode.InsufficientPermissions,
      message: `Insufficient permissions: ${permission} required`,
      statusCode: 403,
      retryable: false,
      details: { permission },
    });
    this.name = 'InsufficientPermissionsError';
    this.permission = permission;
  }
}

// ============================================================================
// Webhook Errors
// ============================================================================

export class WebhookConfigurationError extends TeamsError {
  constructor(message: string) {
    super({
      code: TeamsErrorCode.WebhookConfigurationError,
      message,
      retryable: false,
    });
    this.name = 'WebhookConfigurationError';
  }
}

export class InvalidWebhookUrlError extends TeamsError {
  constructor(message: string = 'Invalid webhook URL format') {
    super({
      code: TeamsErrorCode.InvalidWebhookUrl,
      message,
      retryable: false,
    });
    this.name = 'InvalidWebhookUrlError';
  }
}

// ============================================================================
// Bot Errors
// ============================================================================

export class BotNotConfiguredError extends TeamsError {
  constructor() {
    super({
      code: TeamsErrorCode.BotNotConfigured,
      message: 'Bot credentials not configured',
      retryable: false,
    });
    this.name = 'BotNotConfiguredError';
  }
}

export class ConversationNotFoundError extends TeamsError {
  readonly conversationId: string;

  constructor(conversationId: string) {
    super({
      code: TeamsErrorCode.ConversationNotFound,
      message: `Conversation not found: ${conversationId}`,
      statusCode: 404,
      retryable: false,
      details: { conversationId },
    });
    this.name = 'ConversationNotFoundError';
    this.conversationId = conversationId;
  }
}

export class BotNotInTeamError extends TeamsError {
  readonly teamId: string;

  constructor(teamId: string) {
    super({
      code: TeamsErrorCode.BotNotInTeam,
      message: `Bot is not in team: ${teamId}`,
      statusCode: 403,
      retryable: false,
      details: { teamId },
    });
    this.name = 'BotNotInTeamError';
    this.teamId = teamId;
  }
}

export class UserBlockedBotError extends TeamsError {
  readonly userId: string;

  constructor(userId: string) {
    super({
      code: TeamsErrorCode.UserBlockedBot,
      message: `User has blocked the bot: ${userId}`,
      statusCode: 403,
      retryable: false,
      details: { userId },
    });
    this.name = 'UserBlockedBotError';
    this.userId = userId;
  }
}

export class ActivityNotFoundError extends TeamsError {
  readonly activityId: string;

  constructor(activityId: string) {
    super({
      code: TeamsErrorCode.ActivityNotFound,
      message: `Activity not found: ${activityId}`,
      statusCode: 404,
      retryable: false,
      details: { activityId },
    });
    this.name = 'ActivityNotFoundError';
    this.activityId = activityId;
  }
}

export class InvalidActivityError extends TeamsError {
  constructor(message: string) {
    super({
      code: TeamsErrorCode.InvalidActivity,
      message,
      statusCode: 400,
      retryable: false,
    });
    this.name = 'InvalidActivityError';
  }
}

// ============================================================================
// Resource Errors
// ============================================================================

export class TeamNotFoundError extends TeamsError {
  readonly teamId: string;

  constructor(teamId: string) {
    super({
      code: TeamsErrorCode.TeamNotFound,
      message: `Team not found: ${teamId}`,
      statusCode: 404,
      retryable: false,
      details: { teamId },
    });
    this.name = 'TeamNotFoundError';
    this.teamId = teamId;
  }
}

export class ChannelNotFoundError extends TeamsError {
  readonly channelId: string;

  constructor(channelId: string) {
    super({
      code: TeamsErrorCode.ChannelNotFound,
      message: `Channel not found: ${channelId}`,
      statusCode: 404,
      retryable: false,
      details: { channelId },
    });
    this.name = 'ChannelNotFoundError';
    this.channelId = channelId;
  }
}

export class ChannelArchivedError extends TeamsError {
  readonly channelId: string;

  constructor(channelId: string) {
    super({
      code: TeamsErrorCode.ChannelArchived,
      message: `Channel is archived: ${channelId}`,
      statusCode: 403,
      retryable: false,
      details: { channelId },
    });
    this.name = 'ChannelArchivedError';
    this.channelId = channelId;
  }
}

export class ChatNotFoundError extends TeamsError {
  readonly chatId: string;

  constructor(chatId: string) {
    super({
      code: TeamsErrorCode.ChatNotFound,
      message: `Chat not found: ${chatId}`,
      statusCode: 404,
      retryable: false,
      details: { chatId },
    });
    this.name = 'ChatNotFoundError';
    this.chatId = chatId;
  }
}

export class UserNotFoundError extends TeamsError {
  readonly userId: string;

  constructor(userId: string) {
    super({
      code: TeamsErrorCode.UserNotFound,
      message: `User not found: ${userId}`,
      statusCode: 404,
      retryable: false,
      details: { userId },
    });
    this.name = 'UserNotFoundError';
    this.userId = userId;
  }
}

// ============================================================================
// Validation Errors
// ============================================================================

export class ValidationError extends TeamsError {
  readonly errors: string[];

  constructor(errors: string[]) {
    super({
      code: TeamsErrorCode.ValidationError,
      message: `Validation failed: ${errors.join(', ')}`,
      retryable: false,
      details: { errors },
    });
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

export class CardTooLargeError extends TeamsError {
  readonly size: number;
  readonly maxSize: number;

  constructor(size: number, maxSize: number = 28672) {
    super({
      code: TeamsErrorCode.CardTooLarge,
      message: `Card too large: ${size} bytes (max ${maxSize})`,
      retryable: false,
      details: { size, maxSize },
    });
    this.name = 'CardTooLargeError';
    this.size = size;
    this.maxSize = maxSize;
  }
}

export class CardValidationError extends TeamsError {
  constructor(message: string) {
    super({
      code: TeamsErrorCode.CardValidationFailed,
      message,
      statusCode: 400,
      retryable: false,
    });
    this.name = 'CardValidationError';
  }
}

export class TextTooLongError extends TeamsError {
  readonly length: number;
  readonly maxLength: number;

  constructor(length: number, maxLength: number = 4096) {
    super({
      code: TeamsErrorCode.TextTooLong,
      message: `Text too long: ${length} chars (max ${maxLength})`,
      retryable: false,
      details: { length, maxLength },
    });
    this.name = 'TextTooLongError';
    this.length = length;
    this.maxLength = maxLength;
  }
}

export class MessageTooLargeError extends TeamsError {
  readonly size: number;
  readonly maxSize: number;

  constructor(size: number, maxSize: number) {
    super({
      code: TeamsErrorCode.MessageTooLarge,
      message: `Message too large: ${size} bytes (max ${maxSize})`,
      statusCode: 413,
      retryable: false,
      details: { size, maxSize },
    });
    this.name = 'MessageTooLargeError';
    this.size = size;
    this.maxSize = maxSize;
  }
}

// ============================================================================
// Resilience Errors
// ============================================================================

export class RateLimitedError extends TeamsError {
  constructor(retryAfterMs: number, options?: { requestId?: string }) {
    super({
      code: TeamsErrorCode.RateLimited,
      message: `Rate limited, retry after ${retryAfterMs}ms`,
      statusCode: 429,
      retryable: true,
      retryAfterMs,
      requestId: options?.requestId,
    });
    this.name = 'RateLimitedError';
  }
}

export class CircuitBreakerOpenError extends TeamsError {
  readonly endpoint: string;

  constructor(endpoint: string) {
    super({
      code: TeamsErrorCode.CircuitBreakerOpen,
      message: `Circuit breaker is open for endpoint: ${endpoint}`,
      retryable: false,
      details: { endpoint },
    });
    this.name = 'CircuitBreakerOpenError';
    this.endpoint = endpoint;
  }
}

export class TimeoutError extends TeamsError {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super({
      code: TeamsErrorCode.Timeout,
      message: `Request timed out after ${timeoutMs}ms`,
      retryable: true,
      details: { timeoutMs },
    });
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

// ============================================================================
// Transport Errors
// ============================================================================

export class HttpError extends TeamsError {
  constructor(statusCode: number, message: string, options?: { requestId?: string }) {
    super({
      code: TeamsErrorCode.HttpError,
      message: `HTTP ${statusCode}: ${message}`,
      statusCode,
      retryable: statusCode >= 500,
      requestId: options?.requestId,
    });
    this.name = 'HttpError';
  }
}

export class NetworkError extends TeamsError {
  constructor(message: string, cause?: Error) {
    super({
      code: TeamsErrorCode.NetworkError,
      message: `Network error: ${message}`,
      retryable: true,
      cause,
    });
    this.name = 'NetworkError';
  }
}

export class ServiceUnavailableError extends TeamsError {
  constructor(message: string = 'Service unavailable', options?: { retryAfterMs?: number; requestId?: string }) {
    super({
      code: TeamsErrorCode.ServiceUnavailable,
      message,
      statusCode: 503,
      retryable: true,
      retryAfterMs: options?.retryAfterMs,
      requestId: options?.requestId,
    });
    this.name = 'ServiceUnavailableError';
  }
}

// ============================================================================
// Routing Errors
// ============================================================================

export class CircularRoutingError extends TeamsError {
  constructor() {
    super({
      code: TeamsErrorCode.CircularRouting,
      message: 'Circular routing detected',
      retryable: false,
    });
    this.name = 'CircularRoutingError';
  }
}

export class AllDestinationsFailedError extends TeamsError {
  readonly failedDestinations: number;

  constructor(failedDestinations: number) {
    super({
      code: TeamsErrorCode.AllDestinationsFailed,
      message: `All ${failedDestinations} destinations failed`,
      retryable: false,
      details: { failedDestinations },
    });
    this.name = 'AllDestinationsFailedError';
    this.failedDestinations = failedDestinations;
  }
}

export class NoRouteFoundError extends TeamsError {
  readonly messageId: string;

  constructor(messageId: string) {
    super({
      code: TeamsErrorCode.NoRouteFound,
      message: `No route found for message: ${messageId}`,
      retryable: false,
      details: { messageId },
    });
    this.name = 'NoRouteFoundError';
    this.messageId = messageId;
  }
}

// ============================================================================
// Configuration Errors
// ============================================================================

export class ConfigurationError extends TeamsError {
  constructor(message: string) {
    super({
      code: TeamsErrorCode.ConfigurationError,
      message: `Configuration error: ${message}`,
      retryable: false,
    });
    this.name = 'ConfigurationError';
  }
}

// ============================================================================
// Error Parsing Utilities
// ============================================================================

/**
 * Graph API error response structure.
 */
export interface GraphApiErrorResponse {
  error?: {
    code?: string;
    message?: string;
    innerError?: {
      code?: string;
      message?: string;
      'request-id'?: string;
      date?: string;
    };
  };
}

/**
 * Bot Framework error response structure.
 */
export interface BotFrameworkErrorResponse {
  error?: {
    code?: string;
    message?: string;
  };
  message?: string;
}

/**
 * Parse Graph API error response.
 */
export function parseGraphApiError(
  statusCode: number,
  body: GraphApiErrorResponse | null,
  headers?: Headers
): TeamsError {
  const message = body?.error?.message ?? `HTTP ${statusCode}`;
  const errorCode = body?.error?.code;
  const requestId = body?.error?.innerError?.['request-id'];
  const retryAfter = headers?.get('Retry-After');
  const retryAfterMs = retryAfter ? parseFloat(retryAfter) * 1000 : undefined;

  switch (statusCode) {
    case 401:
      if (errorCode === 'InvalidAuthenticationToken') {
        return new TokenExpiredError(message);
      }
      return new AuthenticationError(message, { requestId, statusCode });

    case 403:
      if (errorCode === 'Authorization_RequestDenied') {
        const permission = extractPermission(message);
        return new InsufficientPermissionsError(permission);
      }
      return new AuthenticationError(message, { requestId, statusCode });

    case 404:
      if (message.toLowerCase().includes('team')) {
        return new TeamNotFoundError(extractId(message) ?? 'unknown');
      }
      if (message.toLowerCase().includes('channel')) {
        return new ChannelNotFoundError(extractId(message) ?? 'unknown');
      }
      if (message.toLowerCase().includes('chat')) {
        return new ChatNotFoundError(extractId(message) ?? 'unknown');
      }
      return new HttpError(statusCode, message, { requestId });

    case 429:
      return new RateLimitedError(retryAfterMs ?? 1000, { requestId });

    case 500:
      return new HttpError(statusCode, message, { requestId });

    case 502:
    case 503:
    case 504:
      return new ServiceUnavailableError(message, { retryAfterMs, requestId });

    default:
      return new HttpError(statusCode, message, { requestId });
  }
}

/**
 * Parse Bot Framework error response.
 */
export function parseBotFrameworkError(
  statusCode: number,
  body: BotFrameworkErrorResponse | null,
  url?: string
): TeamsError {
  const message = body?.error?.message ?? body?.message ?? `HTTP ${statusCode}`;

  switch (statusCode) {
    case 401:
      return new AuthenticationError('Bot authentication failed', { statusCode });

    case 403:
      if (message.toLowerCase().includes('blocked')) {
        return new UserBlockedBotError(extractUserId(message) ?? 'unknown');
      }
      if (message.toLowerCase().includes('removed')) {
        return new BotNotInTeamError(extractTeamId(message) ?? 'unknown');
      }
      return new AuthenticationError(message, { statusCode });

    case 404:
      const conversationId = extractConversationIdFromUrl(url);
      return new ConversationNotFoundError(conversationId ?? 'unknown');

    case 429:
      return new RateLimitedError(1000);

    default:
      return new HttpError(statusCode, message);
  }
}

/**
 * Parse webhook error response.
 */
export function parseWebhookError(statusCode: number, body: string): TeamsError {
  const message = body || `HTTP ${statusCode}`;

  switch (statusCode) {
    case 400:
      if (message.toLowerCase().includes('card')) {
        return new CardValidationError(message);
      }
      if (message.toLowerCase().includes('connector')) {
        return new WebhookConfigurationError('Connector may be disabled');
      }
      return new ValidationError([message]);

    case 403:
      return new WebhookConfigurationError('Webhook access denied - connector may be disabled');

    case 404:
      return new InvalidWebhookUrlError('Webhook URL invalid or expired');

    case 429:
      return new RateLimitedError(1000);

    case 502:
    case 503:
      return new ServiceUnavailableError('Teams service temporarily unavailable');

    default:
      return new HttpError(statusCode, message);
  }
}

/**
 * Check if an error is a Teams error.
 */
export function isTeamsError(error: unknown): error is TeamsError {
  return error instanceof TeamsError;
}

/**
 * Check if an error is retryable.
 */
export function isRetryable(error: unknown): boolean {
  if (isTeamsError(error)) {
    return error.retryable;
  }
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return true;
  }
  return false;
}

// Helper functions
function extractPermission(message: string): string {
  const match = message.match(/requires? (\w+\.\w+(?:\.\w+)?)/i);
  return match?.[1] ?? 'unknown permission';
}

function extractId(message: string): string | undefined {
  const match = message.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return match?.[0];
}

function extractUserId(message: string): string | undefined {
  return extractId(message);
}

function extractTeamId(message: string): string | undefined {
  return extractId(message);
}

function extractConversationIdFromUrl(url?: string): string | undefined {
  if (!url) return undefined;
  const match = url.match(/conversations\/([^/]+)/);
  return match?.[1];
}

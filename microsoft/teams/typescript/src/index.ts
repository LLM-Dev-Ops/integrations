/**
 * Microsoft Teams Integration Module
 *
 * Provides a thin adapter layer for Microsoft Teams messaging, notifications,
 * and workflow interaction following the SPARC specification.
 *
 * @packageDocumentation
 */

// Main client
export { TeamsClient } from './client.js';

// Configuration
export {
  TeamsConfig,
  TeamsConfigBuilder,
  TeamsAuthConfig,
  TeamsResilienceConfig,
  TeamsEndpoints,
  RateLimitConfig,
  RetryConfig,
  CircuitBreakerConfig,
  MultiTenantConfig,
  SimulationMode,
  SecretString,
  configBuilder,
  // Constants
  GRAPH_API_BASE_URL,
  BOT_FRAMEWORK_URL,
  DEFAULT_USER_AGENT,
  DEFAULT_REQUEST_TIMEOUT_MS,
  MAX_CARD_SIZE_BYTES,
  MAX_TEXT_LENGTH,
  MAX_MESSAGE_SIZE_BYTES,
  WEBHOOK_RATE_LIMIT_PER_SECOND,
  BOT_RATE_LIMIT_PER_SECOND,
  MAX_ROUTING_DEPTH,
  // Defaults
  DEFAULT_RATE_LIMIT_CONFIG,
  DEFAULT_RETRY_CONFIG,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  DEFAULT_ENDPOINTS,
  DEFAULT_RESILIENCE_CONFIG,
} from './config/index.js';

// Errors
export {
  TeamsError,
  TeamsErrorCode,
  // Authentication errors
  AuthenticationError,
  TokenExpiredError,
  TenantNotAuthorizedError,
  InsufficientPermissionsError,
  // Webhook errors
  WebhookConfigurationError,
  InvalidWebhookUrlError,
  // Bot errors
  BotNotConfiguredError,
  ConversationNotFoundError,
  BotNotInTeamError,
  UserBlockedBotError,
  ActivityNotFoundError,
  InvalidActivityError,
  // Resource errors
  TeamNotFoundError,
  ChannelNotFoundError,
  ChannelArchivedError,
  ChatNotFoundError,
  UserNotFoundError,
  // Validation errors
  ValidationError,
  CardTooLargeError,
  CardValidationError,
  TextTooLongError,
  MessageTooLargeError,
  // Resilience errors
  RateLimitedError,
  CircuitBreakerOpenError,
  TimeoutError,
  // Transport errors
  HttpError,
  NetworkError,
  ServiceUnavailableError,
  // Routing errors
  CircularRoutingError,
  AllDestinationsFailedError,
  NoRouteFoundError,
  // Configuration errors
  ConfigurationError,
  // Utilities
  isTeamsError,
  isRetryable,
  parseGraphApiError,
  parseBotFrameworkError,
  parseWebhookError,
} from './errors.js';

// Types
export type {
  // Common
  ResourceResponse,
  ChannelAccount,
  ConversationAccount,
  ConversationReference,
  Attachment,
  Mention,
  Entity,
  // Activity
  Activity,
  ActivityType,
  SuggestedActions,
  CardAction,
  MessageReaction,
  // Teams/Channels/Chats
  Team,
  TeamVisibility,
  Channel,
  ChannelMembershipType,
  Chat,
  ChatType,
  ChatMessage,
  MessageBody,
  ChatMessageMention,
  ChatMessageAttachment,
  ContentType,
  MessageImportance,
  ConversationMember,
  CreateConversationParams,
  CreateChatParams,
  // Adaptive Cards
  AdaptiveCard,
  AdaptiveCardVersion,
  AdaptiveCardAction,
  CardElement,
  TextBlockElement,
  ImageElement,
  FactSetElement,
  ColumnSetElement,
  ContainerElement,
  ColumnElement,
  ActionSetElement,
  Fact,
  TextSize,
  TextWeight,
  TextColor,
  HorizontalAlignment,
  ImageSize,
  ColumnWidth,
  OpenUrlAction,
  SubmitAction,
  ShowCardAction,
  ExecuteAction,
  InputTextElement,
  InputChoiceSetElement,
  // Webhook
  WebhookResponse,
  WebhookPayload,
  MessageCardPayload,
  AdaptiveCardPayload,
  FormattedMessage,
  MessageSection,
  PotentialAction,
  // Routing
  RoutableMessage,
  RoutingRule,
  RoutingCondition,
  Destination,
  DeliveryResult,
  RoutingResult,
  Severity,
  // Pagination
  PaginatedResponse,
  ListOptions,
} from './types/index.js';

// Services
export { WebhookService } from './services/webhook/index.js';
export { GraphService, TokenProvider } from './services/graph/index.js';
export { BotService, ActivityHandler } from './services/bot/index.js';

// Cards
export {
  CardBuilder,
  ContainerBuilder,
  ColumnSetBuilder,
  ColumnBuilder,
  createCardBuilder,
  createTextCard,
  createNotificationCard,
  createStatusCard,
} from './cards/index.js';

// Routing
export {
  MessageRouter,
  RoutingRuleBuilder,
  createRouter,
  createRuleBuilder,
  createCatchAllRule,
  createSeverityRule,
  createTagRule,
} from './routing/index.js';

// Resilience
export {
  CircuitBreaker,
  RetryExecutor,
  RateLimiter,
  ResilientExecutor,
  CircuitState,
  createCircuitBreaker,
  createRetryExecutor,
  createRateLimiter,
  createResilientExecutor,
  withTimeout,
} from './resilience/index.js';

// Simulation
export {
  MockTeamsClient,
  MockWebhookService,
  MockGraphService,
  MockBotService,
} from './simulation/index.js';

// Validation
export {
  validateTextLength,
  validateCardSize,
  validateAdaptiveCard,
  validateWebhookUrl,
  validateUrl,
  validateActivity,
  validateConversationReference,
  validateTeamId,
  validateChannelId,
  validateChatId,
  validateUserId,
  validateMessageSize,
  validatePayload,
  sanitizeText,
  validateAndSanitizeText,
  isValidUuid,
} from './validation.js';

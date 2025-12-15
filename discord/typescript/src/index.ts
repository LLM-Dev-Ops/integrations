/**
 * Discord Integration Module
 *
 * Thin adapter layer for Discord REST API and webhook operations.
 *
 * ## Features
 *
 * - Webhook execution with optional message return
 * - Channel and DM message operations
 * - Thread creation and messaging
 * - Automatic rate limit handling
 * - Simulation mode for testing
 *
 * ## Quick Start
 *
 * ```typescript
 * import { DiscordClient, DiscordConfigBuilder, EmbedBuilder } from '@llmdevops/discord-integration';
 *
 * // Create client with webhook
 * const config = new DiscordConfigBuilder()
 *   .withWebhook(process.env.DISCORD_WEBHOOK_URL!)
 *   .build();
 *
 * const client = await DiscordClient.create(config);
 *
 * // Send a simple message
 * await client.executeWebhook({
 *   content: 'Hello from LLM Dev Ops!',
 *   wait: true,
 * });
 *
 * // Send a rich embed
 * const embed = new EmbedBuilder()
 *   .title('Alert')
 *   .description('Something important happened')
 *   .color(0xFF0000)
 *   .timestamp()
 *   .build();
 *
 * await client.executeWebhook({
 *   embeds: [embed],
 * });
 * ```
 *
 * ## Simulation Mode
 *
 * For testing without Discord API access:
 *
 * ```typescript
 * const config = new DiscordConfigBuilder()
 *   .withWebhook('https://discord.com/api/webhooks/123/token')
 *   .withReplay('./fixtures/recordings.json')
 *   .build();
 * ```
 *
 * @module @llmdevops/discord-integration
 */

// Client
export {
  DiscordClient,
  DiscordClientOptions,
  WebhookParams,
  EditWebhookParams,
  DeleteWebhookParams,
  SendMessageParams,
  EditMessageParams,
  ReactionParams,
  CreateThreadParams,
} from './client/index.js';

// Configuration
export {
  DiscordConfig,
  DiscordConfigBuilder,
  SimulationMode,
  RateLimitConfig,
  RetryConfig,
  SecretString,
  parseWebhookUrl,
  buildWebhookUrl,
  DISCORD_API_BASE_URL,
  DEFAULT_RATE_LIMIT_CONFIG,
  DEFAULT_RETRY_CONFIG,
} from './config/index.js';

// Types
export {
  // Snowflake
  Snowflake,
  DISCORD_EPOCH,
  isValidSnowflake,
  parseSnowflake,
  getSnowflakeTimestamp,
  getSnowflakeDate,
  generateMockSnowflake,
  compareSnowflakes,
  // Message
  User,
  MessageReference,
  Message,
  EmbedFooter,
  EmbedMedia,
  EmbedAuthor,
  EmbedField,
  Embed,
  EmbedBuilder,
  getEmbedCharacterCount,
  MAX_MESSAGE_CONTENT_LENGTH,
  MAX_EMBEDS_PER_MESSAGE,
  MAX_EMBED_TOTAL_CHARACTERS,
  // Components
  ComponentType,
  ButtonStyle,
  PartialEmoji,
  Button,
  SelectOption,
  StringSelectMenu,
  UserSelectMenu,
  RoleSelectMenu,
  ChannelSelectMenu,
  TextInputStyle,
  TextInput,
  InteractiveComponent,
  ActionRow,
  MAX_ACTION_ROWS,
  MAX_BUTTONS_PER_ROW,
  createButton,
  createActionRow,
  // Channel
  ChannelType,
  ThreadAutoArchiveDuration,
  Channel,
  ThreadMetadata,
  ThreadMember,
  ChannelTarget,
  channelById,
  channelByName,
  isTextChannel,
  isThread,
  isDMChannel,
} from './types/index.js';

// Errors
export {
  DiscordError,
  DiscordErrorCode,
  DiscordApiErrorResponse,
  RateLimitedError,
  RateLimitTimeoutError,
  QueueFullError,
  QueueTimeoutError,
  NoAuthenticationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  InvalidWebhookUrlError,
  UnknownChannelRouteError,
  NoWebhookConfiguredError,
  BadRequestError,
  ValidationError,
  ServerError,
  NetworkError,
  SimulationNoMatchError,
  SimulationLoadError,
  ConfigurationError,
  parseDiscordApiError,
  isDiscordError,
  isRetryableError,
} from './errors/index.js';

// Resilience
export {
  RateLimitBucket,
  RateLimiter,
  buildRoute,
  RetryHooks,
  RetryExecutor,
  createRetryExecutor,
} from './resilience/index.js';

// Simulation
export {
  SerializedRequest,
  SerializedResponse,
  RecordedInteraction,
  SimulationFile,
  MatchingMode,
  SimulationRecorder,
  SimulationReplayer,
  SimulationLayer,
} from './simulation/index.js';

// Observability
export {
  LogLevel,
  Logger,
  ConsoleLogger,
  NoopLogger,
  InMemoryLogger,
  MetricsCollector,
  MetricNames,
  NoopMetricsCollector,
  InMemoryMetricsCollector,
  SpanStatus,
  SpanContext,
  Tracer,
  NoopTracer,
  InMemoryTracer,
  InMemorySpanContext,
} from './observability/index.js';

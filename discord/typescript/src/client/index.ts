/**
 * Discord client - main entry point for Discord API operations.
 *
 * Provides a thin adapter layer for Discord REST API and webhook operations.
 */

import {
  DiscordConfig,
  DiscordConfigBuilder,
  parseWebhookUrl,
} from '../config/index.js';
import {
  DiscordError,
  NoWebhookConfiguredError,
  UnknownChannelRouteError,
  ValidationError,
} from '../errors/index.js';
import { RateLimiter } from '../resilience/rate-limiter.js';
import { RetryExecutor } from '../resilience/retry.js';
import { SimulationLayer } from '../simulation/index.js';
import { DiscordTransport } from '../transport/index.js';
import {
  Logger,
  MetricsCollector,
  Tracer,
  NoopLogger,
  NoopMetricsCollector,
  NoopTracer,
  MetricNames,
} from '../observability/index.js';
import {
  Snowflake,
  Message,
  Embed,
  ActionRow,
  Channel,
  ChannelTarget,
  ChannelType,
  ThreadAutoArchiveDuration,
  MAX_MESSAGE_CONTENT_LENGTH,
  MAX_EMBEDS_PER_MESSAGE,
  MAX_EMBED_TOTAL_CHARACTERS,
  getEmbedCharacterCount,
} from '../types/index.js';

// ============================================================================
// Parameter Types
// ============================================================================

/**
 * Parameters for executing a webhook.
 */
export interface WebhookParams {
  /** Webhook URL (uses default if not provided) */
  url?: string;
  /** Message content */
  content?: string;
  /** Override webhook username */
  username?: string;
  /** Override webhook avatar URL */
  avatarUrl?: string;
  /** Message embeds */
  embeds?: Embed[];
  /** Message components */
  components?: ActionRow[];
  /** Thread ID to send to */
  threadId?: Snowflake;
  /** Whether to wait for message creation and return it */
  wait?: boolean;
}

/**
 * Parameters for editing a webhook message.
 */
export interface EditWebhookParams {
  /** Webhook URL (uses default if not provided) */
  url?: string;
  /** Message ID to edit */
  messageId: Snowflake;
  /** New message content */
  content?: string;
  /** New message embeds */
  embeds?: Embed[];
  /** New message components */
  components?: ActionRow[];
}

/**
 * Parameters for deleting a webhook message.
 */
export interface DeleteWebhookParams {
  /** Webhook URL (uses default if not provided) */
  url?: string;
  /** Message ID to delete */
  messageId: Snowflake;
}

/**
 * Parameters for sending a message.
 */
export interface SendMessageParams {
  /** Channel target (ID or named route) */
  channel: ChannelTarget;
  /** Message content */
  content?: string;
  /** Message embeds */
  embeds?: Embed[];
  /** Message components */
  components?: ActionRow[];
  /** Message ID to reply to */
  replyTo?: Snowflake;
  /** Whether to mention the replied user */
  mentionRepliedUser?: boolean;
}

/**
 * Parameters for editing a message.
 */
export interface EditMessageParams {
  /** Channel target (ID or named route) */
  channel: ChannelTarget;
  /** Message ID to edit */
  messageId: Snowflake;
  /** New message content */
  content?: string;
  /** New message embeds */
  embeds?: Embed[];
  /** New message components */
  components?: ActionRow[];
}

/**
 * Parameters for adding a reaction.
 */
export interface ReactionParams {
  /** Channel target (ID or named route) */
  channel: ChannelTarget;
  /** Message ID */
  messageId: Snowflake;
  /** Emoji (Unicode character or custom emoji format "name:id") */
  emoji: string;
}

/**
 * Parameters for creating a thread.
 */
export interface CreateThreadParams {
  /** Channel to create thread in */
  channel: ChannelTarget;
  /** Thread name */
  name: string;
  /** Message to start thread from (optional) */
  messageId?: Snowflake;
  /** Auto-archive duration */
  autoArchiveDuration?: ThreadAutoArchiveDuration;
  /** Thread type (public or private) */
  type?: ChannelType.PublicThread | ChannelType.PrivateThread;
  /** Whether non-moderators can invite (private threads only) */
  invitable?: boolean;
}

/**
 * Discord client options.
 */
export interface DiscordClientOptions {
  /** Logger instance */
  logger?: Logger;
  /** Metrics collector instance */
  metrics?: MetricsCollector;
  /** Tracer instance */
  tracer?: Tracer;
}

// ============================================================================
// Discord Client
// ============================================================================

/**
 * Discord REST API and webhook client.
 *
 * Thread-safe and shareable. Provides webhook operations, message operations,
 * channel operations, and DM support with automatic rate limiting and retry.
 */
export class DiscordClient {
  private readonly config: DiscordConfig;
  private readonly transport: DiscordTransport;
  private readonly rateLimiter: RateLimiter;
  private readonly simulation: SimulationLayer;
  private readonly logger: Logger;
  private readonly metrics: MetricsCollector;

  private constructor(
    config: DiscordConfig,
    transport: DiscordTransport,
    rateLimiter: RateLimiter,
    simulation: SimulationLayer,
    logger: Logger,
    metrics: MetricsCollector
  ) {
    this.config = config;
    this.transport = transport;
    this.rateLimiter = rateLimiter;
    this.simulation = simulation;
    this.logger = logger;
    this.metrics = metrics;
  }

  /**
   * Creates a new Discord client.
   */
  static async create(
    config: DiscordConfig,
    options: DiscordClientOptions = {}
  ): Promise<DiscordClient> {
    const logger = options.logger ?? new NoopLogger();
    const metrics = options.metrics ?? new NoopMetricsCollector();
    const tracer = options.tracer ?? new NoopTracer();

    const rateLimiter = new RateLimiter(config.rateLimitConfig);
    const retryExecutor = new RetryExecutor(config.retryConfig, {
      onRetry: (attempt, error, delay) => {
        logger.warn('Retrying Discord request', { attempt, error: error.message, delayMs: delay });
        metrics.incrementCounter(MetricNames.RETRY_ATTEMPTS, 1);
      },
    });

    const simulation = new SimulationLayer(config.simulationMode);
    await simulation.initialize();

    const transport = new DiscordTransport({
      config,
      rateLimiter,
      retryExecutor,
      simulation,
      logger,
      metrics,
      tracer,
    });

    return new DiscordClient(config, transport, rateLimiter, simulation, logger, metrics);
  }

  /**
   * Creates a client from a builder.
   */
  static async fromBuilder(
    builder: DiscordConfigBuilder,
    options?: DiscordClientOptions
  ): Promise<DiscordClient> {
    return DiscordClient.create(builder.build(), options);
  }

  /**
   * Creates a client from environment variables.
   */
  static async fromEnv(options?: DiscordClientOptions): Promise<DiscordClient> {
    return DiscordClient.fromBuilder(DiscordConfigBuilder.fromEnv(), options);
  }

  // ==========================================================================
  // Webhook Operations
  // ==========================================================================

  /**
   * Executes a webhook, optionally returning the created message.
   */
  async executeWebhook(params: WebhookParams): Promise<Message | undefined> {
    const webhookUrl = params.url ?? this.config.defaultWebhookUrl;
    if (!webhookUrl) {
      throw new NoWebhookConfiguredError();
    }

    this.validateWebhookMessage(params);

    const { webhookId, webhookToken } = parseWebhookUrl(webhookUrl);
    const query: Record<string, string | boolean> = {};
    if (params.wait) {
      query.wait = true;
    }
    if (params.threadId) {
      query.thread_id = params.threadId;
    }

    const body: Record<string, unknown> = {};
    if (params.content !== undefined) body.content = params.content;
    if (params.username) body.username = params.username;
    if (params.avatarUrl) body.avatar_url = params.avatarUrl;
    if (params.embeds?.length) body.embeds = params.embeds;
    if (params.components?.length) body.components = params.components;

    const response = await this.transport.execute<Message | undefined>({
      method: 'POST',
      path: `/webhooks/${webhookId}/${webhookToken}`,
      body,
      query,
      isWebhook: true,
      operation: 'webhook:execute',
      majorParams: { webhookId },
    });

    this.metrics.incrementCounter(MetricNames.WEBHOOKS_EXECUTED, 1);
    this.logger.info('Webhook executed', { webhookId, wait: params.wait });

    return response.data;
  }

  /**
   * Edits a webhook message.
   */
  async editWebhookMessage(params: EditWebhookParams): Promise<Message> {
    const webhookUrl = params.url ?? this.config.defaultWebhookUrl;
    if (!webhookUrl) {
      throw new NoWebhookConfiguredError();
    }

    const { webhookId, webhookToken } = parseWebhookUrl(webhookUrl);

    const body: Record<string, unknown> = {};
    if (params.content !== undefined) body.content = params.content;
    if (params.embeds !== undefined) body.embeds = params.embeds;
    if (params.components !== undefined) body.components = params.components;

    const response = await this.transport.execute<Message>({
      method: 'PATCH',
      path: `/webhooks/${webhookId}/${webhookToken}/messages/${params.messageId}`,
      body,
      isWebhook: true,
      operation: 'webhook:edit',
      majorParams: { webhookId },
    });

    this.logger.info('Webhook message edited', { webhookId, messageId: params.messageId });
    return response.data;
  }

  /**
   * Deletes a webhook message.
   */
  async deleteWebhookMessage(params: DeleteWebhookParams): Promise<void> {
    const webhookUrl = params.url ?? this.config.defaultWebhookUrl;
    if (!webhookUrl) {
      throw new NoWebhookConfiguredError();
    }

    const { webhookId, webhookToken } = parseWebhookUrl(webhookUrl);

    await this.transport.execute<void>({
      method: 'DELETE',
      path: `/webhooks/${webhookId}/${webhookToken}/messages/${params.messageId}`,
      isWebhook: true,
      operation: 'webhook:delete',
      majorParams: { webhookId },
    });

    this.logger.info('Webhook message deleted', { webhookId, messageId: params.messageId });
  }

  // ==========================================================================
  // Message Operations
  // ==========================================================================

  /**
   * Sends a message to a channel.
   */
  async sendMessage(params: SendMessageParams): Promise<Message> {
    const channelId = this.resolveChannel(params.channel);
    this.validateMessage(params);

    const body: Record<string, unknown> = {};
    if (params.content !== undefined) body.content = params.content;
    if (params.embeds?.length) body.embeds = params.embeds;
    if (params.components?.length) body.components = params.components;

    if (params.replyTo) {
      body.message_reference = {
        message_id: params.replyTo,
        fail_if_not_exists: false,
      };
      if (params.mentionRepliedUser !== undefined) {
        body.allowed_mentions = {
          replied_user: params.mentionRepliedUser,
        };
      }
    }

    const response = await this.transport.execute<Message>({
      method: 'POST',
      path: `/channels/${channelId}/messages`,
      body,
      operation: 'message:send',
      majorParams: { channelId },
    });

    this.metrics.incrementCounter(MetricNames.MESSAGES_SENT, 1);
    this.logger.info('Message sent', { channelId, messageId: response.data.id });

    return response.data;
  }

  /**
   * Edits an existing message.
   */
  async editMessage(params: EditMessageParams): Promise<Message> {
    const channelId = this.resolveChannel(params.channel);

    const body: Record<string, unknown> = {};
    if (params.content !== undefined) body.content = params.content;
    if (params.embeds !== undefined) body.embeds = params.embeds;
    if (params.components !== undefined) body.components = params.components;

    const response = await this.transport.execute<Message>({
      method: 'PATCH',
      path: `/channels/${channelId}/messages/${params.messageId}`,
      body,
      operation: 'message:edit',
      majorParams: { channelId },
    });

    this.logger.info('Message edited', { channelId, messageId: params.messageId });
    return response.data;
  }

  /**
   * Deletes a message. Succeeds even if message is already deleted.
   */
  async deleteMessage(channel: ChannelTarget, messageId: Snowflake): Promise<void> {
    const channelId = this.resolveChannel(channel);

    try {
      await this.transport.execute<void>({
        method: 'DELETE',
        path: `/channels/${channelId}/messages/${messageId}`,
        operation: 'message:delete',
        majorParams: { channelId },
      });
      this.logger.info('Message deleted', { channelId, messageId });
    } catch (error) {
      // Handle already-deleted gracefully
      if (error instanceof DiscordError && error.statusCode === 404) {
        this.logger.debug('Message already deleted', { channelId, messageId });
        return;
      }
      throw error;
    }
  }

  /**
   * Adds a reaction to a message.
   */
  async addReaction(params: ReactionParams): Promise<void> {
    const channelId = this.resolveChannel(params.channel);
    const emoji = encodeURIComponent(params.emoji);

    await this.transport.execute<void>({
      method: 'PUT',
      path: `/channels/${channelId}/messages/${params.messageId}/reactions/${emoji}/@me`,
      operation: 'message:react',
      majorParams: { channelId },
    });

    this.logger.info('Reaction added', { channelId, messageId: params.messageId, emoji: params.emoji });
  }

  // ==========================================================================
  // Channel Operations
  // ==========================================================================

  /**
   * Creates a thread in a channel.
   */
  async createThread(params: CreateThreadParams): Promise<Channel> {
    const channelId = this.resolveChannel(params.channel);

    const body: Record<string, unknown> = {
      name: params.name,
      auto_archive_duration: params.autoArchiveDuration ?? ThreadAutoArchiveDuration.OneDay,
    };

    if (params.type !== undefined) {
      body.type = params.type;
    }
    if (params.invitable !== undefined) {
      body.invitable = params.invitable;
    }

    const path = params.messageId
      ? `/channels/${channelId}/messages/${params.messageId}/threads`
      : `/channels/${channelId}/threads`;

    const response = await this.transport.execute<Channel>({
      method: 'POST',
      path,
      body,
      operation: 'channel:createThread',
      majorParams: { channelId },
    });

    this.logger.info('Thread created', { channelId, threadId: response.data.id, name: params.name });
    return response.data;
  }

  /**
   * Sends a message to a thread.
   */
  async sendToThread(threadId: Snowflake, params: Omit<SendMessageParams, 'channel'>): Promise<Message> {
    return this.sendMessage({
      ...params,
      channel: { type: 'id', id: threadId },
    });
  }

  // ==========================================================================
  // DM Operations
  // ==========================================================================

  /**
   * Sends a direct message to a user.
   */
  async sendDM(userId: Snowflake, params: Omit<SendMessageParams, 'channel'>): Promise<Message> {
    // First, create or get the DM channel
    const dmChannel = await this.getOrCreateDMChannel(userId);

    // Then send the message
    return this.sendMessage({
      ...params,
      channel: { type: 'id', id: dmChannel.id },
    });
  }

  /**
   * Gets or creates a DM channel with a user.
   */
  private async getOrCreateDMChannel(userId: Snowflake): Promise<Channel> {
    const response = await this.transport.execute<Channel>({
      method: 'POST',
      path: '/users/@me/channels',
      body: { recipient_id: userId },
      operation: 'dm:create',
    });

    this.logger.debug('DM channel created/retrieved', { userId, channelId: response.data.id });
    return response.data;
  }

  // ==========================================================================
  // Utilities
  // ==========================================================================

  /**
   * Resolves a channel target to a Snowflake ID.
   */
  private resolveChannel(target: ChannelTarget): Snowflake {
    if (target.type === 'id') {
      return target.id;
    }

    const channelId = this.config.channelRouting.get(target.name);
    if (!channelId) {
      throw new UnknownChannelRouteError(target.name);
    }
    return channelId;
  }

  /**
   * Validates a message before sending.
   */
  private validateMessage(params: SendMessageParams | WebhookParams): void {
    const errors: string[] = [];

    if (params.content !== undefined && params.content.length > MAX_MESSAGE_CONTENT_LENGTH) {
      errors.push(`Content exceeds ${MAX_MESSAGE_CONTENT_LENGTH} characters`);
    }

    if (params.embeds && params.embeds.length > MAX_EMBEDS_PER_MESSAGE) {
      errors.push(`Too many embeds (max ${MAX_EMBEDS_PER_MESSAGE})`);
    }

    if (params.embeds) {
      const totalChars = params.embeds.reduce((sum, e) => sum + getEmbedCharacterCount(e), 0);
      if (totalChars > MAX_EMBED_TOTAL_CHARACTERS) {
        errors.push(`Embed total characters exceed ${MAX_EMBED_TOTAL_CHARACTERS}`);
      }
    }

    if (errors.length > 0) {
      throw new ValidationError(errors);
    }
  }

  /**
   * Validates a webhook message.
   */
  private validateWebhookMessage(params: WebhookParams): void {
    this.validateMessage(params);
  }

  /**
   * Saves simulation recordings (if in recording mode).
   */
  async saveSimulation(): Promise<void> {
    await this.simulation.save();
  }

  /**
   * Gets rate limiter statistics.
   */
  getRateLimitStats(): ReturnType<RateLimiter['getStats']> {
    return this.rateLimiter.getStats();
  }
}

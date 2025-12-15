/**
 * Microsoft Teams Bot Service
 *
 * Handles Bot Framework operations for proactive messaging and activity processing.
 */

import type {
  Activity,
  ActivityType,
  ConversationReference,
  ResourceResponse,
  ChannelAccount,
  ConversationAccount,
  Attachment,
  AdaptiveCard,
  CreateConversationParams,
} from '../../types/index.js';
import type { TeamsConfig } from '../../config/index.js';
import {
  TeamsError,
  parseBotFrameworkError,
  BotNotConfiguredError,
  ConversationNotFoundError,
  InvalidActivityError,
} from '../../errors.js';
import { validateActivity, validateConversationReference, validateTextLength } from '../../validation.js';
import { ResilientExecutor, withTimeout } from '../../resilience/index.js';
import type { TokenProvider } from '../graph/index.js';

// ============================================================================
// Activity Handler Interface
// ============================================================================

/**
 * Interface for handling incoming activities.
 */
export interface ActivityHandler {
  /**
   * Handles incoming message activities.
   * Return an Activity to reply, or undefined for no reply.
   */
  onMessage?(activity: Activity): Promise<Activity | undefined>;

  /**
   * Handles conversation update activities (e.g., members added/removed).
   */
  onConversationUpdate?(activity: Activity): Promise<void>;

  /**
   * Handles invoke activities (e.g., card action callbacks).
   * Return an invoke response activity.
   */
  onInvoke?(activity: Activity): Promise<Activity>;

  /**
   * Handles message reaction activities.
   */
  onMessageReaction?(activity: Activity): Promise<void>;

  /**
   * Handles installation update activities.
   */
  onInstallationUpdate?(activity: Activity): Promise<void>;

  /**
   * Handles typing activities.
   */
  onTyping?(activity: Activity): Promise<void>;

  /**
   * Handles end of conversation activities.
   */
  onEndOfConversation?(activity: Activity): Promise<void>;

  /**
   * Handles unknown activity types.
   */
  onUnhandled?(activity: Activity): Promise<void>;
}

// ============================================================================
// Bot Service
// ============================================================================

/**
 * Service for Bot Framework operations.
 */
export class BotService {
  private config: TeamsConfig;
  private executor: ResilientExecutor;
  private tokenProvider: TokenProvider;
  private botId?: string;

  constructor(config: TeamsConfig, executor: ResilientExecutor, tokenProvider: TokenProvider) {
    this.config = config;
    this.executor = executor;
    this.tokenProvider = tokenProvider;
    this.botId = config.auth?.botAppId;
  }

  // ==========================================================================
  // Proactive Messaging
  // ==========================================================================

  /**
   * Sends a proactive text message using a conversation reference.
   */
  async sendProactiveMessage(
    conversationRef: ConversationReference,
    text: string
  ): Promise<ResourceResponse> {
    this.ensureBotConfigured();
    validateConversationReference(conversationRef);
    validateTextLength(text);

    const activity: Activity = {
      type: 'message',
      text,
      channelId: conversationRef.channelId,
      serviceUrl: conversationRef.serviceUrl,
      from: conversationRef.bot,
      conversation: conversationRef.conversation,
      recipient: conversationRef.user,
    };

    return this.sendActivity(conversationRef.serviceUrl, conversationRef.conversation.id, activity);
  }

  /**
   * Sends a proactive card using a conversation reference.
   */
  async sendProactiveCard(
    conversationRef: ConversationReference,
    card: AdaptiveCard
  ): Promise<ResourceResponse> {
    this.ensureBotConfigured();
    validateConversationReference(conversationRef);

    const activity: Activity = {
      type: 'message',
      channelId: conversationRef.channelId,
      serviceUrl: conversationRef.serviceUrl,
      from: conversationRef.bot,
      conversation: conversationRef.conversation,
      recipient: conversationRef.user,
      attachments: [
        {
          contentType: 'application/vnd.microsoft.card.adaptive',
          content: card,
        },
      ],
    };

    return this.sendActivity(conversationRef.serviceUrl, conversationRef.conversation.id, activity);
  }

  /**
   * Sends a proactive activity using a conversation reference.
   */
  async sendProactiveActivity(
    conversationRef: ConversationReference,
    activity: Partial<Activity>
  ): Promise<ResourceResponse> {
    this.ensureBotConfigured();
    validateConversationReference(conversationRef);

    const fullActivity: Activity = {
      type: activity.type ?? 'message',
      channelId: conversationRef.channelId,
      serviceUrl: conversationRef.serviceUrl,
      from: conversationRef.bot,
      conversation: conversationRef.conversation,
      recipient: conversationRef.user,
      ...activity,
    };

    return this.sendActivity(conversationRef.serviceUrl, conversationRef.conversation.id, fullActivity);
  }

  // ==========================================================================
  // Activity Processing
  // ==========================================================================

  /**
   * Processes an incoming activity with the provided handler.
   */
  async processActivity(activity: Activity, handler: ActivityHandler): Promise<Activity | undefined> {
    switch (activity.type) {
      case 'message':
        if (handler.onMessage) {
          const response = await handler.onMessage(activity);
          if (response) {
            await this.sendReply(activity, response);
          }
          return response;
        }
        break;

      case 'conversationUpdate':
        if (handler.onConversationUpdate) {
          await handler.onConversationUpdate(activity);
        }
        break;

      case 'invoke':
        if (handler.onInvoke) {
          return handler.onInvoke(activity);
        }
        break;

      case 'messageReaction':
        if (handler.onMessageReaction) {
          await handler.onMessageReaction(activity);
        }
        break;

      case 'installationUpdate':
        if (handler.onInstallationUpdate) {
          await handler.onInstallationUpdate(activity);
        }
        break;

      case 'typing':
        if (handler.onTyping) {
          await handler.onTyping(activity);
        }
        break;

      case 'endOfConversation':
        if (handler.onEndOfConversation) {
          await handler.onEndOfConversation(activity);
        }
        break;

      default:
        if (handler.onUnhandled) {
          await handler.onUnhandled(activity);
        }
    }

    return undefined;
  }

  // ==========================================================================
  // Reply Methods
  // ==========================================================================

  /**
   * Sends a text reply to an activity.
   */
  async replyToActivity(activity: Activity, text: string): Promise<ResourceResponse> {
    this.ensureBotConfigured();
    validateTextLength(text);

    const reply = this.createReplyActivity(activity, text);
    return this.sendActivity(activity.serviceUrl, activity.conversation.id, reply);
  }

  /**
   * Sends a card reply to an activity.
   */
  async replyWithCard(activity: Activity, card: AdaptiveCard): Promise<ResourceResponse> {
    this.ensureBotConfigured();

    const reply = this.createReplyActivity(activity);
    reply.attachments = [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: card,
      },
    ];

    return this.sendActivity(activity.serviceUrl, activity.conversation.id, reply);
  }

  /**
   * Updates an existing activity.
   */
  async updateActivity(activity: Activity): Promise<ResourceResponse> {
    this.ensureBotConfigured();

    if (!activity.id) {
      throw new InvalidActivityError('Activity ID is required for updates');
    }

    const token = await this.tokenProvider.getToken();
    const url = `${activity.serviceUrl}/v3/conversations/${encodeURIComponent(activity.conversation.id)}/activities/${encodeURIComponent(activity.id)}`;

    return this.executor.execute(
      url,
      async () => {
        const response = await withTimeout(
          fetch(url, {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
              'User-Agent': this.config.userAgent,
            },
            body: JSON.stringify(activity),
          }),
          this.config.resilience.requestTimeoutMs,
          'update activity'
        );

        if (!response.ok) {
          let errorBody = null;
          try {
            errorBody = await response.json();
          } catch {
            // Ignore parse errors
          }
          throw parseBotFrameworkError(response.status, errorBody, url);
        }

        return response.json();
      },
      {
        rateLimitName: 'bot',
        rateLimitPerSecond: this.config.resilience.rateLimit.botPerSecond,
      }
    );
  }

  /**
   * Deletes an activity.
   */
  async deleteActivity(
    serviceUrl: string,
    conversationId: string,
    activityId: string
  ): Promise<void> {
    this.ensureBotConfigured();

    const token = await this.tokenProvider.getToken();
    const url = `${serviceUrl}/v3/conversations/${encodeURIComponent(conversationId)}/activities/${encodeURIComponent(activityId)}`;

    await this.executor.execute(
      url,
      async () => {
        const response = await withTimeout(
          fetch(url, {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${token}`,
              'User-Agent': this.config.userAgent,
            },
          }),
          this.config.resilience.requestTimeoutMs,
          'delete activity'
        );

        if (!response.ok) {
          let errorBody = null;
          try {
            errorBody = await response.json();
          } catch {
            // Ignore parse errors
          }
          throw parseBotFrameworkError(response.status, errorBody, url);
        }
      },
      {
        rateLimitName: 'bot',
        rateLimitPerSecond: this.config.resilience.rateLimit.botPerSecond,
      }
    );
  }

  // ==========================================================================
  // Conversation Management
  // ==========================================================================

  /**
   * Creates a new conversation.
   */
  async createConversation(
    serviceUrl: string,
    params: CreateConversationParams
  ): Promise<{ id: string; activityId?: string; serviceUrl: string }> {
    this.ensureBotConfigured();

    const token = await this.tokenProvider.getToken();
    const url = `${serviceUrl}/v3/conversations`;

    const body: Record<string, unknown> = {
      bot: {
        id: this.botId,
        name: params.botName,
      },
      isGroup: params.isGroup ?? false,
      members: params.members,
      channelData: params.channelData,
      activity: params.initialActivity,
      tenantId: params.tenantId,
    };

    return this.executor.execute(
      url,
      async () => {
        const response = await withTimeout(
          fetch(url, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
              'User-Agent': this.config.userAgent,
            },
            body: JSON.stringify(body),
          }),
          this.config.resilience.requestTimeoutMs,
          'create conversation'
        );

        if (!response.ok) {
          let errorBody = null;
          try {
            errorBody = await response.json();
          } catch {
            // Ignore parse errors
          }
          throw parseBotFrameworkError(response.status, errorBody, url);
        }

        return response.json();
      },
      {
        rateLimitName: 'bot',
        rateLimitPerSecond: this.config.resilience.rateLimit.botPerSecond,
      }
    );
  }

  /**
   * Gets conversation members.
   */
  async getConversationMembers(
    serviceUrl: string,
    conversationId: string
  ): Promise<ChannelAccount[]> {
    this.ensureBotConfigured();

    const token = await this.tokenProvider.getToken();
    const url = `${serviceUrl}/v3/conversations/${encodeURIComponent(conversationId)}/members`;

    return this.executor.execute(
      url,
      async () => {
        const response = await withTimeout(
          fetch(url, {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${token}`,
              'User-Agent': this.config.userAgent,
            },
          }),
          this.config.resilience.requestTimeoutMs,
          'get conversation members'
        );

        if (!response.ok) {
          let errorBody = null;
          try {
            errorBody = await response.json();
          } catch {
            // Ignore parse errors
          }
          throw parseBotFrameworkError(response.status, errorBody, url);
        }

        return response.json();
      },
      {
        rateLimitName: 'bot',
        rateLimitPerSecond: this.config.resilience.rateLimit.botPerSecond,
      }
    );
  }

  // ==========================================================================
  // Typing Indicator
  // ==========================================================================

  /**
   * Sends a typing indicator.
   */
  async sendTypingIndicator(
    serviceUrl: string,
    conversationId: string
  ): Promise<ResourceResponse> {
    this.ensureBotConfigured();

    const activity: Activity = {
      type: 'typing',
      channelId: 'msteams',
      serviceUrl,
      from: { id: this.botId!, name: 'Bot' },
      conversation: { id: conversationId },
    };

    return this.sendActivity(serviceUrl, conversationId, activity);
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Creates a conversation reference from an activity.
   */
  createConversationReference(activity: Activity): ConversationReference {
    return {
      activityId: activity.id,
      bot: activity.recipient ?? { id: this.botId!, name: 'Bot' },
      channelId: activity.channelId,
      conversation: activity.conversation,
      serviceUrl: activity.serviceUrl,
      user: activity.from,
    };
  }

  /**
   * Creates a reply activity.
   */
  createReplyActivity(source: Activity, text?: string): Activity {
    return {
      type: 'message',
      text,
      channelId: source.channelId,
      serviceUrl: source.serviceUrl,
      from: source.recipient ?? { id: this.botId!, name: 'Bot' },
      conversation: source.conversation,
      recipient: source.from,
      replyToId: source.id,
    };
  }

  /**
   * Creates an invoke response activity.
   */
  static createInvokeResponse(status: number, body?: unknown): Activity {
    return {
      type: 'invokeResponse',
      value: {
        status,
        body,
      },
      channelId: '',
      serviceUrl: '',
      from: { id: '' },
      conversation: { id: '' },
    };
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private ensureBotConfigured(): void {
    if (!this.botId) {
      throw new BotNotConfiguredError();
    }
  }

  private async sendReply(source: Activity, reply: Activity): Promise<void> {
    const fullReply: Activity = {
      ...this.createReplyActivity(source),
      ...reply,
    };

    await this.sendActivity(source.serviceUrl, source.conversation.id, fullReply);
  }

  private async sendActivity(
    serviceUrl: string,
    conversationId: string,
    activity: Activity
  ): Promise<ResourceResponse> {
    const token = await this.tokenProvider.getToken();
    const url = `${serviceUrl}/v3/conversations/${encodeURIComponent(conversationId)}/activities`;

    return this.executor.execute(
      url,
      async () => {
        const response = await withTimeout(
          fetch(url, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
              'User-Agent': this.config.userAgent,
            },
            body: JSON.stringify(activity),
          }),
          this.config.resilience.requestTimeoutMs,
          'send activity'
        );

        if (!response.ok) {
          let errorBody = null;
          try {
            errorBody = await response.json();
          } catch {
            // Ignore parse errors
          }
          throw parseBotFrameworkError(response.status, errorBody, url);
        }

        return response.json();
      },
      {
        rateLimitName: 'bot',
        rateLimitPerSecond: this.config.resilience.rateLimit.botPerSecond,
      }
    );
  }
}

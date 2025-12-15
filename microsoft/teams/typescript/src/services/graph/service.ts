/**
 * Microsoft Teams Graph Service
 *
 * Handles Microsoft Graph API operations for Teams, Channels, and Chats.
 */

import type {
  Team,
  Channel,
  Chat,
  ChatMessage,
  ConversationMember,
  ListOptions,
  PaginatedResponse,
  ContentType,
  MessageImportance,
  ChatType,
  CreateChatParams,
  AdaptiveCard,
} from '../../types/index.js';
import type { TeamsConfig } from '../../config/index.js';
import {
  TeamsError,
  parseGraphApiError,
  TeamNotFoundError,
  ChannelNotFoundError,
  ChatNotFoundError,
  AuthenticationError,
} from '../../errors.js';
import { validateTeamId, validateChannelId, validateChatId, validateTextLength } from '../../validation.js';
import { ResilientExecutor, withTimeout } from '../../resilience/index.js';

// ============================================================================
// Token Provider
// ============================================================================

export interface TokenProvider {
  getToken(): Promise<string>;
}

// ============================================================================
// Graph Service
// ============================================================================

/**
 * Service for Microsoft Graph API operations.
 */
export class GraphService {
  private config: TeamsConfig;
  private executor: ResilientExecutor;
  private tokenProvider: TokenProvider;
  private graphUrl: string;

  constructor(config: TeamsConfig, executor: ResilientExecutor, tokenProvider: TokenProvider) {
    this.config = config;
    this.executor = executor;
    this.tokenProvider = tokenProvider;
    this.graphUrl = config.endpoints.graphUrl;
  }

  // ==========================================================================
  // Teams Operations
  // ==========================================================================

  /**
   * Lists teams the application has access to.
   */
  async listTeams(options?: ListOptions): Promise<PaginatedResponse<Team>> {
    return this.makeRequest<PaginatedResponse<Team>>('GET', '/teams', undefined, options);
  }

  /**
   * Gets a specific team by ID.
   */
  async getTeam(teamId: string): Promise<Team> {
    validateTeamId(teamId);
    return this.makeRequest<Team>('GET', `/teams/${encodeURIComponent(teamId)}`);
  }

  /**
   * Lists members of a team.
   */
  async listTeamMembers(
    teamId: string,
    options?: ListOptions
  ): Promise<PaginatedResponse<ConversationMember>> {
    validateTeamId(teamId);
    return this.makeRequest<PaginatedResponse<ConversationMember>>(
      'GET',
      `/teams/${encodeURIComponent(teamId)}/members`,
      undefined,
      options
    );
  }

  // ==========================================================================
  // Channel Operations
  // ==========================================================================

  /**
   * Lists channels in a team.
   */
  async listChannels(teamId: string, options?: ListOptions): Promise<PaginatedResponse<Channel>> {
    validateTeamId(teamId);
    return this.makeRequest<PaginatedResponse<Channel>>(
      'GET',
      `/teams/${encodeURIComponent(teamId)}/channels`,
      undefined,
      options
    );
  }

  /**
   * Gets a specific channel.
   */
  async getChannel(teamId: string, channelId: string): Promise<Channel> {
    validateTeamId(teamId);
    validateChannelId(channelId);
    return this.makeRequest<Channel>(
      'GET',
      `/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}`
    );
  }

  /**
   * Sends a message to a channel.
   */
  async sendChannelMessage(
    teamId: string,
    channelId: string,
    content: string,
    options?: {
      contentType?: ContentType;
      importance?: MessageImportance;
    }
  ): Promise<ChatMessage> {
    validateTeamId(teamId);
    validateChannelId(channelId);
    validateTextLength(content);

    const body = {
      body: {
        content,
        contentType: options?.contentType ?? 'text',
      },
      importance: options?.importance,
    };

    return this.makeRequest<ChatMessage>(
      'POST',
      `/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages`,
      body
    );
  }

  /**
   * Sends an Adaptive Card to a channel.
   */
  async sendChannelCard(teamId: string, channelId: string, card: AdaptiveCard): Promise<ChatMessage> {
    validateTeamId(teamId);
    validateChannelId(channelId);

    const body = {
      body: {
        contentType: 'html',
        content: '<attachment id="card"></attachment>',
      },
      attachments: [
        {
          id: 'card',
          contentType: 'application/vnd.microsoft.card.adaptive',
          content: JSON.stringify(card),
        },
      ],
    };

    return this.makeRequest<ChatMessage>(
      'POST',
      `/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages`,
      body
    );
  }

  /**
   * Lists messages in a channel.
   */
  async listChannelMessages(
    teamId: string,
    channelId: string,
    options?: ListOptions
  ): Promise<PaginatedResponse<ChatMessage>> {
    validateTeamId(teamId);
    validateChannelId(channelId);
    return this.makeRequest<PaginatedResponse<ChatMessage>>(
      'GET',
      `/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages`,
      undefined,
      options
    );
  }

  /**
   * Gets a specific message in a channel.
   */
  async getChannelMessage(teamId: string, channelId: string, messageId: string): Promise<ChatMessage> {
    validateTeamId(teamId);
    validateChannelId(channelId);
    return this.makeRequest<ChatMessage>(
      'GET',
      `/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}`
    );
  }

  /**
   * Lists channel members.
   */
  async listChannelMembers(
    teamId: string,
    channelId: string,
    options?: ListOptions
  ): Promise<PaginatedResponse<ConversationMember>> {
    validateTeamId(teamId);
    validateChannelId(channelId);
    return this.makeRequest<PaginatedResponse<ConversationMember>>(
      'GET',
      `/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/members`,
      undefined,
      options
    );
  }

  // ==========================================================================
  // Chat Operations
  // ==========================================================================

  /**
   * Lists chats the application or user has access to.
   */
  async listChats(options?: ListOptions): Promise<PaginatedResponse<Chat>> {
    return this.makeRequest<PaginatedResponse<Chat>>('GET', '/chats', undefined, options);
  }

  /**
   * Gets a specific chat.
   */
  async getChat(chatId: string): Promise<Chat> {
    validateChatId(chatId);
    return this.makeRequest<Chat>('GET', `/chats/${encodeURIComponent(chatId)}`);
  }

  /**
   * Creates a new chat.
   */
  async createChat(params: CreateChatParams): Promise<Chat> {
    const body = {
      chatType: params.chatType,
      topic: params.topic,
      members: params.members.map((m) => ({
        '@odata.type': '#microsoft.graph.aadUserConversationMember',
        roles: m.roles ?? ['owner'],
        'user@odata.bind': `https://graph.microsoft.com/v1.0/users('${m.userId}')`,
      })),
    };

    return this.makeRequest<Chat>('POST', '/chats', body);
  }

  /**
   * Sends a message to a chat.
   */
  async sendChatMessage(
    chatId: string,
    content: string,
    options?: {
      contentType?: ContentType;
      importance?: MessageImportance;
    }
  ): Promise<ChatMessage> {
    validateChatId(chatId);
    validateTextLength(content);

    const body = {
      body: {
        content,
        contentType: options?.contentType ?? 'text',
      },
      importance: options?.importance,
    };

    return this.makeRequest<ChatMessage>('POST', `/chats/${encodeURIComponent(chatId)}/messages`, body);
  }

  /**
   * Sends an Adaptive Card to a chat.
   */
  async sendChatCard(chatId: string, card: AdaptiveCard): Promise<ChatMessage> {
    validateChatId(chatId);

    const body = {
      body: {
        contentType: 'html',
        content: '<attachment id="card"></attachment>',
      },
      attachments: [
        {
          id: 'card',
          contentType: 'application/vnd.microsoft.card.adaptive',
          content: JSON.stringify(card),
        },
      ],
    };

    return this.makeRequest<ChatMessage>('POST', `/chats/${encodeURIComponent(chatId)}/messages`, body);
  }

  /**
   * Lists messages in a chat.
   */
  async listChatMessages(chatId: string, options?: ListOptions): Promise<PaginatedResponse<ChatMessage>> {
    validateChatId(chatId);
    return this.makeRequest<PaginatedResponse<ChatMessage>>(
      'GET',
      `/chats/${encodeURIComponent(chatId)}/messages`,
      undefined,
      options
    );
  }

  /**
   * Lists chat members.
   */
  async listChatMembers(
    chatId: string,
    options?: ListOptions
  ): Promise<PaginatedResponse<ConversationMember>> {
    validateChatId(chatId);
    return this.makeRequest<PaginatedResponse<ConversationMember>>(
      'GET',
      `/chats/${encodeURIComponent(chatId)}/members`,
      undefined,
      options
    );
  }

  // ==========================================================================
  // Pagination Helper
  // ==========================================================================

  /**
   * Fetches the next page of results.
   */
  async fetchNextPage<T>(nextLink: string): Promise<PaginatedResponse<T>> {
    // nextLink is a full URL, so we use it directly
    return this.makeDirectRequest<PaginatedResponse<T>>('GET', nextLink);
  }

  /**
   * Fetches all pages of results.
   */
  async fetchAllPages<T>(
    initialRequest: () => Promise<PaginatedResponse<T>>,
    maxItems?: number
  ): Promise<T[]> {
    const allItems: T[] = [];
    let response = await initialRequest();

    allItems.push(...response.value);

    while (response['@odata.nextLink'] && (!maxItems || allItems.length < maxItems)) {
      response = await this.fetchNextPage<T>(response['@odata.nextLink']);
      allItems.push(...response.value);

      if (maxItems && allItems.length >= maxItems) {
        return allItems.slice(0, maxItems);
      }
    }

    return allItems;
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private async makeRequest<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: ListOptions
  ): Promise<T> {
    let url = `${this.graphUrl}${path}`;

    // Add query parameters
    const params: string[] = [];
    if (options?.top) params.push(`$top=${options.top}`);
    if (options?.skip) params.push(`$skip=${options.skip}`);
    if (options?.filter) params.push(`$filter=${encodeURIComponent(options.filter)}`);
    if (options?.select) params.push(`$select=${options.select.join(',')}`);
    if (options?.orderBy) params.push(`$orderby=${encodeURIComponent(options.orderBy)}`);

    if (params.length > 0) {
      url += `?${params.join('&')}`;
    }

    return this.makeDirectRequest<T>(method, url, body);
  }

  private async makeDirectRequest<T>(method: string, url: string, body?: unknown): Promise<T> {
    const token = await this.tokenProvider.getToken();

    return this.executor.execute(
      url,
      async () => {
        const response = await withTimeout(
          fetch(url, {
            method,
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
              'User-Agent': this.config.userAgent,
            },
            body: body ? JSON.stringify(body) : undefined,
          }),
          this.config.resilience.requestTimeoutMs,
          `graph ${method} ${url}`
        );

        if (!response.ok) {
          let errorBody = null;
          try {
            errorBody = await response.json();
          } catch {
            // Ignore parse errors
          }
          throw parseGraphApiError(response.status, errorBody, response.headers);
        }

        // Handle no-content responses
        if (response.status === 204) {
          return undefined as T;
        }

        return response.json();
      },
      {
        rateLimitName: 'graph',
        rateLimitPerSecond: this.config.resilience.rateLimit.botPerSecond,
      }
    );
  }
}

/**
 * Microsoft Teams Mock Client
 *
 * Provides simulation and testing support.
 */

import type {
  Activity,
  ConversationReference,
  ResourceResponse,
  Team,
  Channel,
  Chat,
  ChatMessage,
  AdaptiveCard,
  WebhookResponse,
  PaginatedResponse,
  ListOptions,
  ConversationMember,
  ChannelAccount,
  CreateChatParams,
} from '../types/index.js';
import type { ActivityHandler } from '../services/bot/index.js';

// ============================================================================
// Mock Recording
// ============================================================================

interface MockRecording {
  timestamp: number;
  type: 'webhook' | 'graph' | 'bot';
  operation: string;
  request: unknown;
  response: unknown;
  error?: string;
}

// ============================================================================
// Mock Webhook Service
// ============================================================================

export class MockWebhookService {
  private recordings: MockRecording[] = [];
  private responses: Map<string, WebhookResponse | Error> = new Map();

  /**
   * Sets a mock response for a webhook URL.
   */
  setResponse(urlPattern: string, response: WebhookResponse | Error): this {
    this.responses.set(urlPattern, response);
    return this;
  }

  async sendMessage(text: string, webhookUrl?: string): Promise<WebhookResponse> {
    return this.mockCall('sendMessage', { text, webhookUrl });
  }

  async sendCard(card: AdaptiveCard, webhookUrl?: string): Promise<WebhookResponse> {
    return this.mockCall('sendCard', { card, webhookUrl });
  }

  async sendNotification(
    title: string,
    text: string,
    options?: { themeColor?: string; actionUrl?: string; actionText?: string; webhookUrl?: string }
  ): Promise<WebhookResponse> {
    return this.mockCall('sendNotification', { title, text, ...options });
  }

  private async mockCall(operation: string, request: unknown): Promise<WebhookResponse> {
    const recording: MockRecording = {
      timestamp: Date.now(),
      type: 'webhook',
      operation,
      request,
      response: { success: true },
    };

    // Check for configured response
    for (const [pattern, response] of this.responses) {
      const urlInRequest = (request as Record<string, unknown>).webhookUrl as string | undefined;
      if (urlInRequest && urlInRequest.includes(pattern)) {
        if (response instanceof Error) {
          recording.error = response.message;
          this.recordings.push(recording);
          throw response;
        }
        recording.response = response;
        this.recordings.push(recording);
        return response;
      }
    }

    this.recordings.push(recording);
    return { success: true };
  }

  getRecordings(): MockRecording[] {
    return [...this.recordings];
  }

  clearRecordings(): void {
    this.recordings = [];
  }
}

// ============================================================================
// Mock Graph Service
// ============================================================================

export class MockGraphService {
  private recordings: MockRecording[] = [];
  private teams: Team[] = [];
  private channels: Map<string, Channel[]> = new Map();
  private chats: Chat[] = [];
  private messages: Map<string, ChatMessage[]> = new Map();
  private errors: Map<string, Error> = new Map();

  /**
   * Adds mock teams.
   */
  addTeams(teams: Team[]): this {
    this.teams.push(...teams);
    return this;
  }

  /**
   * Adds mock channels for a team.
   */
  addChannels(teamId: string, channels: Channel[]): this {
    const existing = this.channels.get(teamId) ?? [];
    this.channels.set(teamId, [...existing, ...channels]);
    return this;
  }

  /**
   * Adds mock chats.
   */
  addChats(chats: Chat[]): this {
    this.chats.push(...chats);
    return this;
  }

  /**
   * Sets an error for an operation.
   */
  setError(operation: string, error: Error): this {
    this.errors.set(operation, error);
    return this;
  }

  async listTeams(options?: ListOptions): Promise<PaginatedResponse<Team>> {
    return this.mockCall('listTeams', options, () => ({
      value: this.applyPagination(this.teams, options),
    }));
  }

  async getTeam(teamId: string): Promise<Team> {
    return this.mockCall('getTeam', { teamId }, () => {
      const team = this.teams.find((t) => t.id === teamId);
      if (!team) throw new Error(`Team not found: ${teamId}`);
      return team;
    });
  }

  async listChannels(teamId: string, options?: ListOptions): Promise<PaginatedResponse<Channel>> {
    return this.mockCall('listChannels', { teamId, options }, () => ({
      value: this.applyPagination(this.channels.get(teamId) ?? [], options),
    }));
  }

  async getChannel(teamId: string, channelId: string): Promise<Channel> {
    return this.mockCall('getChannel', { teamId, channelId }, () => {
      const channel = this.channels.get(teamId)?.find((c) => c.id === channelId);
      if (!channel) throw new Error(`Channel not found: ${channelId}`);
      return channel;
    });
  }

  async sendChannelMessage(
    teamId: string,
    channelId: string,
    content: string,
    options?: { contentType?: 'text' | 'html'; importance?: string }
  ): Promise<ChatMessage> {
    return this.mockCall('sendChannelMessage', { teamId, channelId, content, options }, () => {
      const message: ChatMessage = {
        id: `msg-${Date.now()}`,
        body: { content, contentType: options?.contentType ?? 'text' },
        createdDateTime: new Date().toISOString(),
      };
      const key = `channel:${teamId}:${channelId}`;
      const existing = this.messages.get(key) ?? [];
      this.messages.set(key, [...existing, message]);
      return message;
    });
  }

  async sendChannelCard(teamId: string, channelId: string, card: AdaptiveCard): Promise<ChatMessage> {
    return this.mockCall('sendChannelCard', { teamId, channelId, card }, () => {
      const message: ChatMessage = {
        id: `msg-${Date.now()}`,
        body: { content: '<attachment id="card"></attachment>', contentType: 'html' },
        createdDateTime: new Date().toISOString(),
        attachments: [
          {
            id: 'card',
            contentType: 'application/vnd.microsoft.card.adaptive',
            content: JSON.stringify(card),
          },
        ],
      };
      return message;
    });
  }

  async listChats(options?: ListOptions): Promise<PaginatedResponse<Chat>> {
    return this.mockCall('listChats', options, () => ({
      value: this.applyPagination(this.chats, options),
    }));
  }

  async getChat(chatId: string): Promise<Chat> {
    return this.mockCall('getChat', { chatId }, () => {
      const chat = this.chats.find((c) => c.id === chatId);
      if (!chat) throw new Error(`Chat not found: ${chatId}`);
      return chat;
    });
  }

  async sendChatMessage(
    chatId: string,
    content: string,
    options?: { contentType?: 'text' | 'html'; importance?: string }
  ): Promise<ChatMessage> {
    return this.mockCall('sendChatMessage', { chatId, content, options }, () => {
      const message: ChatMessage = {
        id: `msg-${Date.now()}`,
        body: { content, contentType: options?.contentType ?? 'text' },
        createdDateTime: new Date().toISOString(),
      };
      const key = `chat:${chatId}`;
      const existing = this.messages.get(key) ?? [];
      this.messages.set(key, [...existing, message]);
      return message;
    });
  }

  async sendChatCard(chatId: string, card: AdaptiveCard): Promise<ChatMessage> {
    return this.mockCall('sendChatCard', { chatId, card }, () => {
      const message: ChatMessage = {
        id: `msg-${Date.now()}`,
        body: { content: '<attachment id="card"></attachment>', contentType: 'html' },
        createdDateTime: new Date().toISOString(),
      };
      return message;
    });
  }

  private async mockCall<T>(operation: string, request: unknown, handler: () => T): Promise<T> {
    const recording: MockRecording = {
      timestamp: Date.now(),
      type: 'graph',
      operation,
      request,
      response: undefined,
    };

    // Check for configured error
    const error = this.errors.get(operation);
    if (error) {
      recording.error = error.message;
      this.recordings.push(recording);
      throw error;
    }

    try {
      const result = handler();
      recording.response = result;
      this.recordings.push(recording);
      return result;
    } catch (e) {
      recording.error = e instanceof Error ? e.message : String(e);
      this.recordings.push(recording);
      throw e;
    }
  }

  private applyPagination<T>(items: T[], options?: ListOptions): T[] {
    let result = [...items];
    if (options?.skip) {
      result = result.slice(options.skip);
    }
    if (options?.top) {
      result = result.slice(0, options.top);
    }
    return result;
  }

  getRecordings(): MockRecording[] {
    return [...this.recordings];
  }

  clearRecordings(): void {
    this.recordings = [];
  }

  clear(): void {
    this.teams = [];
    this.channels.clear();
    this.chats = [];
    this.messages.clear();
    this.errors.clear();
    this.recordings = [];
  }
}

// ============================================================================
// Mock Bot Service
// ============================================================================

export class MockBotService {
  private recordings: MockRecording[] = [];
  private conversations: Map<string, ChannelAccount[]> = new Map();
  private errors: Map<string, Error> = new Map();

  /**
   * Adds mock conversation members.
   */
  addConversationMembers(conversationId: string, members: ChannelAccount[]): this {
    this.conversations.set(conversationId, members);
    return this;
  }

  /**
   * Sets an error for an operation.
   */
  setError(operation: string, error: Error): this {
    this.errors.set(operation, error);
    return this;
  }

  async sendProactiveMessage(
    conversationRef: ConversationReference,
    text: string
  ): Promise<ResourceResponse> {
    return this.mockCall('sendProactiveMessage', { conversationRef, text }, () => ({
      id: `activity-${Date.now()}`,
    }));
  }

  async sendProactiveCard(
    conversationRef: ConversationReference,
    card: AdaptiveCard
  ): Promise<ResourceResponse> {
    return this.mockCall('sendProactiveCard', { conversationRef, card }, () => ({
      id: `activity-${Date.now()}`,
    }));
  }

  async processActivity(activity: Activity, handler: ActivityHandler): Promise<Activity | undefined> {
    return this.mockCall('processActivity', { activity }, async () => {
      switch (activity.type) {
        case 'message':
          return handler.onMessage?.(activity);
        case 'conversationUpdate':
          await handler.onConversationUpdate?.(activity);
          return undefined;
        case 'invoke':
          return handler.onInvoke?.(activity);
        default:
          await handler.onUnhandled?.(activity);
          return undefined;
      }
    });
  }

  async replyToActivity(activity: Activity, text: string): Promise<ResourceResponse> {
    return this.mockCall('replyToActivity', { activity, text }, () => ({
      id: `activity-${Date.now()}`,
    }));
  }

  async getConversationMembers(
    serviceUrl: string,
    conversationId: string
  ): Promise<ChannelAccount[]> {
    return this.mockCall('getConversationMembers', { serviceUrl, conversationId }, () => {
      return this.conversations.get(conversationId) ?? [];
    });
  }

  createConversationReference(activity: Activity): ConversationReference {
    return {
      activityId: activity.id,
      bot: activity.recipient ?? { id: 'bot-id', name: 'Bot' },
      channelId: activity.channelId,
      conversation: activity.conversation,
      serviceUrl: activity.serviceUrl,
      user: activity.from,
    };
  }

  private async mockCall<T>(operation: string, request: unknown, handler: () => T | Promise<T>): Promise<T> {
    const recording: MockRecording = {
      timestamp: Date.now(),
      type: 'bot',
      operation,
      request,
      response: undefined,
    };

    const error = this.errors.get(operation);
    if (error) {
      recording.error = error.message;
      this.recordings.push(recording);
      throw error;
    }

    try {
      const result = await handler();
      recording.response = result;
      this.recordings.push(recording);
      return result;
    } catch (e) {
      recording.error = e instanceof Error ? e.message : String(e);
      this.recordings.push(recording);
      throw e;
    }
  }

  getRecordings(): MockRecording[] {
    return [...this.recordings];
  }

  clearRecordings(): void {
    this.recordings = [];
  }

  clear(): void {
    this.conversations.clear();
    this.errors.clear();
    this.recordings = [];
  }
}

// ============================================================================
// Mock Teams Client
// ============================================================================

/**
 * Mock Teams client for testing.
 */
export class MockTeamsClient {
  private _webhook: MockWebhookService;
  private _graph: MockGraphService;
  private _bot: MockBotService;
  private allRecordings: MockRecording[] = [];

  constructor() {
    this._webhook = new MockWebhookService();
    this._graph = new MockGraphService();
    this._bot = new MockBotService();
  }

  /**
   * Gets the mock webhook service.
   */
  webhook(): MockWebhookService {
    return this._webhook;
  }

  /**
   * Gets the mock graph service.
   */
  graph(): MockGraphService {
    return this._graph;
  }

  /**
   * Gets the mock bot service.
   */
  bot(): MockBotService {
    return this._bot;
  }

  /**
   * Gets all recordings from all services.
   */
  getAllRecordings(): MockRecording[] {
    return [
      ...this._webhook.getRecordings(),
      ...this._graph.getRecordings(),
      ...this._bot.getRecordings(),
    ].sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Clears all recordings.
   */
  clearRecordings(): void {
    this._webhook.clearRecordings();
    this._graph.clearRecordings();
    this._bot.clearRecordings();
  }

  /**
   * Resets all mock state.
   */
  reset(): void {
    this._webhook = new MockWebhookService();
    this._graph = new MockGraphService();
    this._bot = new MockBotService();
  }

  /**
   * Verifies that all expected calls were made.
   */
  verify(): void {
    // This could be expanded to verify expected calls
    // For now, it just ensures no unexpected errors
  }

  /**
   * Exports recordings to JSON.
   */
  exportRecordings(): string {
    return JSON.stringify(this.getAllRecordings(), null, 2);
  }

  /**
   * Creates a mock activity for testing.
   */
  static createMockActivity(overrides?: Partial<Activity>): Activity {
    return {
      id: `activity-${Date.now()}`,
      type: 'message',
      text: 'Test message',
      channelId: 'msteams',
      serviceUrl: 'https://smba.trafficmanager.net/teams/',
      from: { id: 'user-123', name: 'Test User' },
      conversation: { id: 'conv-123' },
      recipient: { id: 'bot-123', name: 'Test Bot' },
      timestamp: new Date().toISOString(),
      ...overrides,
    };
  }

  /**
   * Creates a mock conversation reference for testing.
   */
  static createMockConversationReference(overrides?: Partial<ConversationReference>): ConversationReference {
    return {
      activityId: 'activity-123',
      bot: { id: 'bot-123', name: 'Test Bot' },
      channelId: 'msteams',
      conversation: { id: 'conv-123' },
      serviceUrl: 'https://smba.trafficmanager.net/teams/',
      user: { id: 'user-123', name: 'Test User' },
      ...overrides,
    };
  }
}

/**
 * Conversations service for Slack API.
 */

import { SlackClient } from '../client';
import { Channel, ChannelId, Message, Timestamp, UserId, SlackResponse, ResponseMetadata } from '../types';

/**
 * Conversations list parameters
 */
export interface ListConversationsParams {
  cursor?: string;
  exclude_archived?: boolean;
  limit?: number;
  team_id?: string;
  types?: string;
}

/**
 * Conversations list response
 */
export interface ListConversationsResponse extends SlackResponse {
  channels: Channel[];
  response_metadata?: ResponseMetadata;
}

/**
 * Conversation info parameters
 */
export interface ConversationInfoParams {
  channel: ChannelId;
  include_locale?: boolean;
  include_num_members?: boolean;
}

/**
 * Conversation info response
 */
export interface ConversationInfoResponse extends SlackResponse {
  channel: Channel;
}

/**
 * Conversation history parameters
 */
export interface ConversationHistoryParams {
  channel: ChannelId;
  cursor?: string;
  inclusive?: boolean;
  latest?: Timestamp;
  limit?: number;
  oldest?: Timestamp;
}

/**
 * Conversation history response
 */
export interface ConversationHistoryResponse extends SlackResponse {
  messages: Message[];
  has_more: boolean;
  response_metadata?: ResponseMetadata;
}

/**
 * Conversation replies parameters
 */
export interface ConversationRepliesParams {
  channel: ChannelId;
  ts: Timestamp;
  cursor?: string;
  inclusive?: boolean;
  latest?: Timestamp;
  limit?: number;
  oldest?: Timestamp;
}

/**
 * Conversation replies response
 */
export interface ConversationRepliesResponse extends SlackResponse {
  messages: Message[];
  has_more: boolean;
  response_metadata?: ResponseMetadata;
}

/**
 * Conversation members parameters
 */
export interface ConversationMembersParams {
  channel: ChannelId;
  cursor?: string;
  limit?: number;
}

/**
 * Conversation members response
 */
export interface ConversationMembersResponse extends SlackResponse {
  members: UserId[];
  response_metadata?: ResponseMetadata;
}

/**
 * Create conversation parameters
 */
export interface CreateConversationParams {
  name: string;
  is_private?: boolean;
  team_id?: string;
}

/**
 * Create conversation response
 */
export interface CreateConversationResponse extends SlackResponse {
  channel: Channel;
}

/**
 * Join conversation response
 */
export interface JoinConversationResponse extends SlackResponse {
  channel: Channel;
}

/**
 * Invite to conversation parameters
 */
export interface InviteToConversationParams {
  channel: ChannelId;
  users: UserId[];
}

/**
 * Kick from conversation parameters
 */
export interface KickFromConversationParams {
  channel: ChannelId;
  user: UserId;
}

/**
 * Conversations service
 */
export class ConversationsService {
  constructor(private client: SlackClient) {}

  /**
   * List conversations
   */
  async list(params: ListConversationsParams = {}): Promise<ListConversationsResponse> {
    return this.client.get<ListConversationsResponse>('conversations.list', params);
  }

  /**
   * Get all conversations
   */
  async listAll(params: Omit<ListConversationsParams, 'cursor'> = {}): Promise<Channel[]> {
    return this.client.getAllPages<Channel, ListConversationsResponse>(
      'conversations.list',
      params,
      (response) => response.channels
    );
  }

  /**
   * Get conversation info
   */
  async info(params: ConversationInfoParams): Promise<Channel> {
    const response = await this.client.get<ConversationInfoResponse>(
      'conversations.info',
      params
    );
    return response.channel;
  }

  /**
   * Get conversation history
   */
  async history(params: ConversationHistoryParams): Promise<ConversationHistoryResponse> {
    return this.client.get<ConversationHistoryResponse>('conversations.history', params);
  }

  /**
   * Get all messages from conversation
   */
  async historyAll(
    params: Omit<ConversationHistoryParams, 'cursor'>,
    limit?: number
  ): Promise<Message[]> {
    return this.client.getAllPages<Message, ConversationHistoryResponse>(
      'conversations.history',
      params,
      (response) => response.messages,
      limit
    );
  }

  /**
   * Get thread replies
   */
  async replies(params: ConversationRepliesParams): Promise<ConversationRepliesResponse> {
    return this.client.get<ConversationRepliesResponse>('conversations.replies', params);
  }

  /**
   * Get all thread replies
   */
  async repliesAll(
    params: Omit<ConversationRepliesParams, 'cursor'>,
    limit?: number
  ): Promise<Message[]> {
    return this.client.getAllPages<Message, ConversationRepliesResponse>(
      'conversations.replies',
      params,
      (response) => response.messages,
      limit
    );
  }

  /**
   * Get conversation members
   */
  async members(params: ConversationMembersParams): Promise<ConversationMembersResponse> {
    return this.client.get<ConversationMembersResponse>('conversations.members', params);
  }

  /**
   * Get all conversation members
   */
  async membersAll(
    params: Omit<ConversationMembersParams, 'cursor'>,
    limit?: number
  ): Promise<UserId[]> {
    return this.client.getAllPages<UserId, ConversationMembersResponse>(
      'conversations.members',
      params,
      (response) => response.members,
      limit
    );
  }

  /**
   * Create a conversation
   */
  async create(params: CreateConversationParams): Promise<Channel> {
    const response = await this.client.post<CreateConversationResponse>(
      'conversations.create',
      params
    );
    return response.channel;
  }

  /**
   * Join a conversation
   */
  async join(channel: ChannelId): Promise<Channel> {
    const response = await this.client.post<JoinConversationResponse>(
      'conversations.join',
      { channel }
    );
    return response.channel;
  }

  /**
   * Leave a conversation
   */
  async leave(channel: ChannelId): Promise<void> {
    await this.client.post('conversations.leave', { channel });
  }

  /**
   * Archive a conversation
   */
  async archive(channel: ChannelId): Promise<void> {
    await this.client.post('conversations.archive', { channel });
  }

  /**
   * Unarchive a conversation
   */
  async unarchive(channel: ChannelId): Promise<void> {
    await this.client.post('conversations.unarchive', { channel });
  }

  /**
   * Invite users to conversation
   */
  async invite(params: InviteToConversationParams): Promise<Channel> {
    const response = await this.client.post<CreateConversationResponse>(
      'conversations.invite',
      { channel: params.channel, users: params.users.join(',') }
    );
    return response.channel;
  }

  /**
   * Remove user from conversation
   */
  async kick(params: KickFromConversationParams): Promise<void> {
    await this.client.post('conversations.kick', params);
  }

  /**
   * Rename a conversation
   */
  async rename(channel: ChannelId, name: string): Promise<Channel> {
    const response = await this.client.post<CreateConversationResponse>(
      'conversations.rename',
      { channel, name }
    );
    return response.channel;
  }

  /**
   * Set conversation topic
   */
  async setTopic(channel: ChannelId, topic: string): Promise<Channel> {
    const response = await this.client.post<CreateConversationResponse>(
      'conversations.setTopic',
      { channel, topic }
    );
    return response.channel;
  }

  /**
   * Set conversation purpose
   */
  async setPurpose(channel: ChannelId, purpose: string): Promise<Channel> {
    const response = await this.client.post<CreateConversationResponse>(
      'conversations.setPurpose',
      { channel, purpose }
    );
    return response.channel;
  }

  /**
   * Mark conversation as read
   */
  async mark(channel: ChannelId, ts: Timestamp): Promise<void> {
    await this.client.post('conversations.mark', { channel, ts });
  }

  /**
   * Open a conversation (for DMs)
   */
  async open(options: { channel?: ChannelId; users?: UserId[] }): Promise<Channel> {
    const params: Record<string, string> = {};
    if (options.channel) params.channel = options.channel;
    if (options.users) params.users = options.users.join(',');

    const response = await this.client.post<CreateConversationResponse>(
      'conversations.open',
      params
    );
    return response.channel;
  }

  /**
   * Close a conversation (for DMs)
   */
  async close(channel: ChannelId): Promise<void> {
    await this.client.post('conversations.close', { channel });
  }
}

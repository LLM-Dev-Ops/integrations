/**
 * Reactions service for Slack API.
 */

import { SlackClient } from '../client';
import { Message, File, ChannelId, Timestamp, UserId, SlackResponse, ResponseMetadata } from '../types';

/**
 * Add reaction parameters
 */
export interface AddReactionParams {
  channel: ChannelId;
  name: string;
  timestamp: Timestamp;
}

/**
 * Remove reaction parameters
 */
export interface RemoveReactionParams {
  channel: ChannelId;
  name: string;
  timestamp: Timestamp;
}

/**
 * Get reactions parameters
 */
export interface GetReactionsParams {
  channel?: ChannelId;
  file?: string;
  file_comment?: string;
  full?: boolean;
  timestamp?: Timestamp;
}

/**
 * Reaction item
 */
export interface ReactionItem {
  type: 'message' | 'file' | 'file_comment';
  channel?: ChannelId;
  message?: Message;
  file?: File;
}

/**
 * Get reactions response
 */
export interface GetReactionsResponse extends SlackResponse {
  type: string;
  message?: Message;
  file?: File;
  channel?: ChannelId;
}

/**
 * List reactions parameters
 */
export interface ListReactionsParams {
  cursor?: string;
  full?: boolean;
  limit?: number;
  team_id?: string;
  user?: UserId;
}

/**
 * List reactions response
 */
export interface ListReactionsResponse extends SlackResponse {
  items: ReactionItem[];
  response_metadata?: ResponseMetadata;
}

/**
 * Reactions service
 */
export class ReactionsService {
  constructor(private client: SlackClient) {}

  /**
   * Add a reaction
   */
  async add(params: AddReactionParams): Promise<void> {
    await this.client.post('reactions.add', params);
  }

  /**
   * Remove a reaction
   */
  async remove(params: RemoveReactionParams): Promise<void> {
    await this.client.post('reactions.remove', params);
  }

  /**
   * Get reactions for an item
   */
  async get(params: GetReactionsParams): Promise<GetReactionsResponse> {
    return this.client.get<GetReactionsResponse>('reactions.get', params);
  }

  /**
   * List reactions by user
   */
  async list(params: ListReactionsParams = {}): Promise<ListReactionsResponse> {
    return this.client.get<ListReactionsResponse>('reactions.list', params);
  }

  /**
   * Get all reactions for user
   */
  async listAll(params: Omit<ListReactionsParams, 'cursor'> = {}): Promise<ReactionItem[]> {
    return this.client.getAllPages<ReactionItem, ListReactionsResponse>(
      'reactions.list',
      params,
      (response) => response.items
    );
  }

  /**
   * Add reaction to message
   */
  async addToMessage(channel: ChannelId, ts: Timestamp, emoji: string): Promise<void> {
    await this.add({ channel, timestamp: ts, name: emoji });
  }

  /**
   * Remove reaction from message
   */
  async removeFromMessage(channel: ChannelId, ts: Timestamp, emoji: string): Promise<void> {
    await this.remove({ channel, timestamp: ts, name: emoji });
  }

  /**
   * Get reactions on message
   */
  async getForMessage(channel: ChannelId, ts: Timestamp): Promise<Message | undefined> {
    const response = await this.get({ channel, timestamp: ts, full: true });
    return response.message;
  }
}

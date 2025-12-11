/**
 * Pins service for Slack API.
 */

import { SlackClient } from '../client';
import { Message, ChannelId, Timestamp, SlackResponse } from '../types';

/**
 * Pinned item
 */
export interface PinnedItem {
  type: 'message' | 'file' | 'file_comment';
  channel?: ChannelId;
  message?: Message;
  created?: number;
  created_by?: string;
}

/**
 * List pins response
 */
export interface ListPinsResponse extends SlackResponse {
  items: PinnedItem[];
}

/**
 * Pins service
 */
export class PinsService {
  constructor(private client: SlackClient) {}

  /**
   * Add a pin to a message
   */
  async add(channel: ChannelId, timestamp: Timestamp): Promise<void> {
    await this.client.post('pins.add', { channel, timestamp });
  }

  /**
   * Remove a pin from a message
   */
  async remove(channel: ChannelId, timestamp: Timestamp): Promise<void> {
    await this.client.post('pins.remove', { channel, timestamp });
  }

  /**
   * List pinned items in a channel
   */
  async list(channel: ChannelId): Promise<PinnedItem[]> {
    const response = await this.client.get<ListPinsResponse>('pins.list', { channel });
    return response.items;
  }

  /**
   * Check if message is pinned
   */
  async isPinned(channel: ChannelId, timestamp: Timestamp): Promise<boolean> {
    const items = await this.list(channel);
    return items.some(
      (item) =>
        item.type === 'message' &&
        item.message?.ts === timestamp
    );
  }

  /**
   * Get pinned messages in channel
   */
  async getMessages(channel: ChannelId): Promise<Message[]> {
    const items = await this.list(channel);
    return items
      .filter((item) => item.type === 'message' && item.message)
      .map((item) => item.message!);
  }
}

/**
 * Messages service for Slack API.
 */

import { SlackClient } from '../client';
import { Message, ChannelId, Timestamp, Block, Attachment, MessageMetadata, SlackResponse } from '../types';

/**
 * Post message parameters
 */
export interface PostMessageParams {
  channel: ChannelId;
  text?: string;
  blocks?: Block[];
  attachments?: Attachment[];
  thread_ts?: Timestamp;
  reply_broadcast?: boolean;
  unfurl_links?: boolean;
  unfurl_media?: boolean;
  mrkdwn?: boolean;
  metadata?: MessageMetadata;
  parse?: 'none' | 'full';
  link_names?: boolean;
}

/**
 * Post message response
 */
export interface PostMessageResponse extends SlackResponse {
  channel: ChannelId;
  ts: Timestamp;
  message: Message;
}

/**
 * Update message parameters
 */
export interface UpdateMessageParams {
  channel: ChannelId;
  ts: Timestamp;
  text?: string;
  blocks?: Block[];
  attachments?: Attachment[];
  reply_broadcast?: boolean;
  metadata?: MessageMetadata;
  parse?: 'none' | 'full';
  link_names?: boolean;
}

/**
 * Update message response
 */
export interface UpdateMessageResponse extends SlackResponse {
  channel: ChannelId;
  ts: Timestamp;
  text: string;
  message: Message;
}

/**
 * Delete message parameters
 */
export interface DeleteMessageParams {
  channel: ChannelId;
  ts: Timestamp;
}

/**
 * Delete message response
 */
export interface DeleteMessageResponse extends SlackResponse {
  channel: ChannelId;
  ts: Timestamp;
}

/**
 * Get permalink parameters
 */
export interface GetPermalinkParams {
  channel: ChannelId;
  message_ts: Timestamp;
}

/**
 * Get permalink response
 */
export interface GetPermalinkResponse extends SlackResponse {
  channel: ChannelId;
  permalink: string;
}

/**
 * Schedule message parameters
 */
export interface ScheduleMessageParams {
  channel: ChannelId;
  post_at: number;
  text?: string;
  blocks?: Block[];
  attachments?: Attachment[];
  thread_ts?: Timestamp;
  reply_broadcast?: boolean;
  unfurl_links?: boolean;
  unfurl_media?: boolean;
  metadata?: MessageMetadata;
}

/**
 * Schedule message response
 */
export interface ScheduleMessageResponse extends SlackResponse {
  channel: ChannelId;
  scheduled_message_id: string;
  post_at: number;
  message: Message;
}

/**
 * Delete scheduled message parameters
 */
export interface DeleteScheduledMessageParams {
  channel: ChannelId;
  scheduled_message_id: string;
}

/**
 * Scheduled message info
 */
export interface ScheduledMessage {
  id: string;
  channel_id: ChannelId;
  post_at: number;
  date_created: number;
  text?: string;
}

/**
 * List scheduled messages response
 */
export interface ListScheduledMessagesResponse extends SlackResponse {
  scheduled_messages: ScheduledMessage[];
}

/**
 * Search messages parameters
 */
export interface SearchMessagesParams {
  query: string;
  count?: number;
  cursor?: string;
  highlight?: boolean;
  page?: number;
  sort?: 'score' | 'timestamp';
  sort_dir?: 'asc' | 'desc';
}

/**
 * Search result match
 */
export interface SearchMatch {
  iid: string;
  team: string;
  channel: {
    id: ChannelId;
    name: string;
    is_private?: boolean;
    is_mpim?: boolean;
  };
  type: string;
  user?: string;
  username?: string;
  ts: Timestamp;
  text: string;
  permalink: string;
  no_reactions?: boolean;
}

/**
 * Search messages response
 */
export interface SearchMessagesResponse extends SlackResponse {
  query: string;
  messages: {
    total: number;
    pagination: {
      total_count: number;
      page: number;
      per_page: number;
      page_count: number;
      first: number;
      last: number;
    };
    paging: {
      count: number;
      total: number;
      page: number;
      pages: number;
    };
    matches: SearchMatch[];
  };
}

/**
 * Messages service
 */
export class MessagesService {
  constructor(private client: SlackClient) {}

  /**
   * Post a message
   */
  async post(params: PostMessageParams): Promise<PostMessageResponse> {
    return this.client.post<PostMessageResponse>('chat.postMessage', params);
  }

  /**
   * Update a message
   */
  async update(params: UpdateMessageParams): Promise<UpdateMessageResponse> {
    return this.client.post<UpdateMessageResponse>('chat.update', params);
  }

  /**
   * Delete a message
   */
  async delete(params: DeleteMessageParams): Promise<DeleteMessageResponse> {
    return this.client.post<DeleteMessageResponse>('chat.delete', params);
  }

  /**
   * Get message permalink
   */
  async getPermalink(params: GetPermalinkParams): Promise<string> {
    const response = await this.client.get<GetPermalinkResponse>(
      'chat.getPermalink',
      params
    );
    return response.permalink;
  }

  /**
   * Schedule a message
   */
  async schedule(params: ScheduleMessageParams): Promise<ScheduleMessageResponse> {
    return this.client.post<ScheduleMessageResponse>('chat.scheduleMessage', params);
  }

  /**
   * Delete a scheduled message
   */
  async deleteScheduled(params: DeleteScheduledMessageParams): Promise<void> {
    await this.client.post('chat.deleteScheduledMessage', params);
  }

  /**
   * List scheduled messages
   */
  async listScheduled(channel?: ChannelId): Promise<ScheduledMessage[]> {
    const params: Record<string, string> = {};
    if (channel) params.channel = channel;

    const response = await this.client.post<ListScheduledMessagesResponse>(
      'chat.scheduledMessages.list',
      params
    );
    return response.scheduled_messages;
  }

  /**
   * Search messages
   */
  async search(params: SearchMessagesParams): Promise<SearchMessagesResponse> {
    return this.client.get<SearchMessagesResponse>('search.messages', params);
  }

  /**
   * Post ephemeral message (only visible to specified user)
   */
  async postEphemeral(
    channel: ChannelId,
    user: string,
    text: string,
    options?: {
      blocks?: Block[];
      attachments?: Attachment[];
      thread_ts?: Timestamp;
    }
  ): Promise<Timestamp> {
    const response = await this.client.post<PostMessageResponse>(
      'chat.postEphemeral',
      {
        channel,
        user,
        text,
        ...options,
      }
    );
    return response.ts;
  }

  /**
   * Unfurl links in a message
   */
  async unfurl(
    channel: ChannelId,
    ts: Timestamp,
    unfurls: Record<string, unknown>
  ): Promise<void> {
    await this.client.post('chat.unfurl', {
      channel,
      ts,
      unfurls: JSON.stringify(unfurls),
    });
  }

  /**
   * Share me message
   */
  async meMessage(channel: ChannelId, text: string): Promise<Timestamp> {
    const response = await this.client.post<PostMessageResponse>('chat.meMessage', {
      channel,
      text,
    });
    return response.ts;
  }
}

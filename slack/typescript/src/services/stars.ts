/**
 * Stars service for Slack API.
 */

import { SlackClient } from '../client';
import { ChannelId, FileId, Timestamp, Message, SlackResponse, ResponseMetadata } from '../types';

/**
 * Starred item type
 */
export type StarredItemType = 'message' | 'file' | 'file_comment' | 'channel' | 'im' | 'group';

/**
 * Starred item
 */
export interface StarredItem {
  type: StarredItemType;
  channel?: ChannelId;
  message?: Message;
  file?: {
    id: FileId;
    created: number;
    timestamp: number;
    name: string;
    title: string;
    mimetype: string;
    filetype: string;
    pretty_type: string;
    user: string;
    size: number;
    url_private: string;
    url_private_download: string;
    permalink: string;
    permalink_public?: string;
  };
  file_comment?: {
    id: string;
    created: number;
    timestamp: number;
    user: string;
    comment: string;
  };
  date_create: number;
}

/**
 * Add star parameters
 */
export interface AddStarParams {
  channel?: ChannelId;
  file?: FileId;
  file_comment?: string;
  timestamp?: Timestamp;
}

/**
 * List stars parameters
 */
export interface ListStarsParams {
  count?: number;
  cursor?: string;
  limit?: number;
  page?: number;
  [key: string]: string | number | boolean | undefined;
}

/**
 * List stars response
 */
export interface ListStarsResponse extends SlackResponse {
  items: StarredItem[];
  paging?: {
    count: number;
    total: number;
    page: number;
    pages: number;
  };
  response_metadata?: ResponseMetadata;
}

/**
 * Remove star parameters
 */
export interface RemoveStarParams {
  channel?: ChannelId;
  file?: FileId;
  file_comment?: string;
  timestamp?: Timestamp;
}

/**
 * Stars service
 */
export class StarsService {
  constructor(private client: SlackClient) {}

  /**
   * Add a star to an item
   */
  async add(params: AddStarParams): Promise<void> {
    await this.client.post('stars.add', params);
  }

  /**
   * List starred items
   */
  async list(params?: ListStarsParams): Promise<StarredItem[]> {
    const response = await this.client.get<ListStarsResponse>('stars.list', params);
    return response.items;
  }

  /**
   * Get all starred items
   */
  async listAll(params: Omit<ListStarsParams, 'cursor'> = {}): Promise<StarredItem[]> {
    return this.client.getAllPages<StarredItem, ListStarsResponse>(
      'stars.list',
      params,
      (response) => response.items
    );
  }

  /**
   * Remove a star from an item
   */
  async remove(params: RemoveStarParams): Promise<void> {
    await this.client.post('stars.remove', params);
  }
}

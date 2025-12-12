/**
 * Bookmarks service for Slack API.
 */

import { SlackClient } from '../client';
import { ChannelId, SlackResponse } from '../types';

/**
 * Bookmark type
 */
export type BookmarkType = 'link' | 'file';

/**
 * Bookmark object
 */
export interface Bookmark {
  id: string;
  channel_id: ChannelId;
  title: string;
  link: string;
  emoji?: string;
  icon_url?: string;
  type: BookmarkType;
  entity_id?: string;
  date_created: number;
  date_updated: number;
  rank: string;
  last_updated_by_user_id: string;
  last_updated_by_team_id: string;
  shortcut_id?: string;
  app_id?: string;
}

/**
 * Add bookmark parameters
 */
export interface AddBookmarkParams {
  channel: ChannelId;
  title: string;
  type: BookmarkType;
  link?: string;
  emoji?: string;
  entity_id?: string;
  parent_id?: string;
}

/**
 * Add bookmark response
 */
export interface AddBookmarkResponse extends SlackResponse {
  bookmark: Bookmark;
}

/**
 * Edit bookmark parameters
 */
export interface EditBookmarkParams {
  channel: ChannelId;
  bookmark_id: string;
  title?: string;
  link?: string;
  emoji?: string;
}

/**
 * Edit bookmark response
 */
export interface EditBookmarkResponse extends SlackResponse {
  bookmark: Bookmark;
}

/**
 * List bookmarks response
 */
export interface ListBookmarksResponse extends SlackResponse {
  bookmarks: Bookmark[];
}

/**
 * Remove bookmark response
 */
export interface RemoveBookmarkResponse extends SlackResponse {
  // Empty response on success
}

/**
 * Bookmarks service
 */
export class BookmarksService {
  constructor(private client: SlackClient) {}

  /**
   * Add a bookmark to a channel
   */
  async add(params: AddBookmarkParams): Promise<Bookmark> {
    const response = await this.client.post<AddBookmarkResponse>(
      'bookmarks.add',
      params
    );
    return response.bookmark;
  }

  /**
   * Edit a bookmark
   */
  async edit(params: EditBookmarkParams): Promise<Bookmark> {
    const response = await this.client.post<EditBookmarkResponse>(
      'bookmarks.edit',
      params
    );
    return response.bookmark;
  }

  /**
   * List bookmarks in a channel
   */
  async list(channel: ChannelId): Promise<Bookmark[]> {
    const response = await this.client.get<ListBookmarksResponse>(
      'bookmarks.list',
      { channel }
    );
    return response.bookmarks;
  }

  /**
   * Remove a bookmark
   */
  async remove(channel: ChannelId, bookmark_id: string): Promise<void> {
    await this.client.post<RemoveBookmarkResponse>('bookmarks.remove', {
      channel,
      bookmark_id,
    });
  }
}

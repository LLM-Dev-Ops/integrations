/**
 * Search service for Slack API.
 */

import { SlackClient } from '../client';
import { ChannelId, Timestamp, FileId, SlackResponse } from '../types';

/**
 * Search parameters
 */
export interface SearchParams {
  count?: number;
  highlight?: boolean;
  page?: number;
  sort?: 'score' | 'timestamp';
  sort_dir?: 'asc' | 'desc';
  [key: string]: string | number | boolean | undefined;
}

/**
 * Search message match
 */
export interface SearchMessageMatch {
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
 * Search file match
 */
export interface SearchFileMatch {
  id: FileId;
  created: number;
  timestamp: number;
  name: string;
  title: string;
  mimetype: string;
  filetype: string;
  pretty_type: string;
  user: string;
  username?: string;
  size: number;
  url_private: string;
  url_private_download: string;
  permalink: string;
  permalink_public?: string;
  channels?: ChannelId[];
  groups?: ChannelId[];
  ims?: ChannelId[];
  score?: string;
  is_public?: boolean;
  is_starred?: boolean;
}

/**
 * Search pagination
 */
export interface SearchPagination {
  total_count: number;
  page: number;
  per_page: number;
  page_count: number;
  first: number;
  last: number;
}

/**
 * Search paging
 */
export interface SearchPaging {
  count: number;
  total: number;
  page: number;
  pages: number;
}

/**
 * Search messages response (for search.messages API)
 */
export interface SearchMessagesResult extends SlackResponse {
  query: string;
  messages: {
    total: number;
    pagination: SearchPagination;
    paging: SearchPaging;
    matches: SearchMessageMatch[];
  };
}

/**
 * Search files response
 */
export interface SearchFilesResult extends SlackResponse {
  query: string;
  files: {
    total: number;
    pagination: SearchPagination;
    paging: SearchPaging;
    matches: SearchFileMatch[];
  };
}

/**
 * Search all response
 */
export interface SearchAllResult extends SlackResponse {
  query: string;
  messages: {
    total: number;
    pagination: SearchPagination;
    paging: SearchPaging;
    matches: SearchMessageMatch[];
  };
  files: {
    total: number;
    pagination: SearchPagination;
    paging: SearchPaging;
    matches: SearchFileMatch[];
  };
}

/**
 * Search service
 */
export class SearchService {
  constructor(private client: SlackClient) {}

  /**
   * Search for messages
   */
  async messages(query: string, params?: SearchParams): Promise<SearchMessagesResult> {
    return this.client.get<SearchMessagesResult>('search.messages', {
      query,
      ...params,
    });
  }

  /**
   * Search for files
   */
  async files(query: string, params?: SearchParams): Promise<SearchFilesResult> {
    return this.client.get<SearchFilesResult>('search.files', {
      query,
      ...params,
    });
  }

  /**
   * Search for both messages and files
   */
  async all(query: string, params?: SearchParams): Promise<SearchAllResult> {
    return this.client.get<SearchAllResult>('search.all', {
      query,
      ...params,
    });
  }
}

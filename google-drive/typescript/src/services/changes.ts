/**
 * Changes service for Google Drive API.
 *
 * Monitors and tracks changes to files and folders.
 */

import {
  Change,
  ChangeList,
  StartPageToken,
  Channel,
  GetStartPageTokenParams,
  ListChangesParams,
  WatchChangesRequest,
} from '../types';

/**
 * HTTP transport interface.
 */
export interface ChangeTransport {
  request<T>(url: string, options: RequestOptions): Promise<T>;
}

/**
 * Request options.
 */
export interface RequestOptions {
  method?: string;
  body?: any;
  params?: Record<string, any>;
}

/**
 * Changes service interface.
 */
export interface ChangesService {
  /**
   * Get the start page token for change tracking.
   *
   * @param params - Optional parameters
   * @returns The start page token
   */
  getStartPageToken(params?: GetStartPageTokenParams): Promise<StartPageToken>;

  /**
   * List changes since a page token.
   *
   * @param pageToken - Start page token
   * @param params - Optional list parameters
   * @returns Change list with pagination
   */
  list(pageToken: string, params?: ListChangesParams): Promise<ChangeList>;

  /**
   * List all changes with auto-pagination.
   *
   * @param startPageToken - Start page token
   * @param params - Optional list parameters
   * @returns Async iterable of changes
   */
  listAll(startPageToken: string, params?: ListChangesParams): AsyncIterable<Change>;

  /**
   * Watch for changes via push notifications.
   *
   * @param pageToken - Start page token
   * @param request - Watch request
   * @returns The notification channel
   */
  watch(pageToken: string, request: WatchChangesRequest): Promise<Channel>;

  /**
   * Stop watching for changes.
   *
   * @param channel - The channel to stop
   */
  stopWatch(channel: Channel): Promise<void>;
}

/**
 * Implementation of ChangesService.
 */
export class ChangesServiceImpl implements ChangesService {
  private readonly baseUrl = 'https://www.googleapis.com/drive/v3';

  constructor(private transport: ChangeTransport) {}

  async getStartPageToken(params?: GetStartPageTokenParams): Promise<StartPageToken> {
    return this.transport.request<StartPageToken>(
      `${this.baseUrl}/changes/startPageToken`,
      {
        method: 'GET',
        params: params as any,
      }
    );
  }

  async list(pageToken: string, params?: ListChangesParams): Promise<ChangeList> {
    return this.transport.request<ChangeList>(`${this.baseUrl}/changes`, {
      method: 'GET',
      params: {
        pageToken,
        ...params,
      } as any,
    });
  }

  async *listAll(startPageToken: string, params?: ListChangesParams): AsyncIterable<Change> {
    let pageToken: string | undefined = startPageToken;

    while (pageToken) {
      const response = await this.list(pageToken, params);

      for (const change of response.changes) {
        yield change;
      }

      // If newStartPageToken is present, we've reached the end
      if (response.newStartPageToken) {
        break;
      }

      pageToken = response.nextPageToken;
    }
  }

  async watch(pageToken: string, request: WatchChangesRequest): Promise<Channel> {
    return this.transport.request<Channel>(`${this.baseUrl}/changes/watch`, {
      method: 'POST',
      params: { pageToken },
      body: request,
    });
  }

  async stopWatch(channel: Channel): Promise<void> {
    await this.transport.request<void>(`${this.baseUrl}/channels/stop`, {
      method: 'POST',
      body: {
        id: channel.id,
        resourceId: channel.resourceId,
      },
    });
  }
}

/**
 * Mock implementation for testing.
 */
export class MockChangesService implements ChangesService {
  private changes: Change[] = [];
  private pageToken = 'start-token';
  private channels = new Map<string, Channel>();

  async getStartPageToken(params?: GetStartPageTokenParams): Promise<StartPageToken> {
    return {
      kind: 'drive#startPageToken',
      startPageToken: this.pageToken,
    };
  }

  async list(pageToken: string, params?: ListChangesParams): Promise<ChangeList> {
    return {
      kind: 'drive#changeList',
      newStartPageToken: 'new-start-token',
      changes: this.changes,
    };
  }

  async *listAll(startPageToken: string, params?: ListChangesParams): AsyncIterable<Change> {
    const response = await this.list(startPageToken, params);
    for (const change of response.changes) {
      yield change;
    }
  }

  async watch(pageToken: string, request: WatchChangesRequest): Promise<Channel> {
    const channel: Channel = {
      kind: 'api#channel',
      id: request.id,
      resourceId: `resource-${Date.now()}`,
      resourceUri: `https://www.googleapis.com/drive/v3/changes?pageToken=${pageToken}`,
      expiration: request.expiration,
      token: request.token,
      address: request.address,
      type: request.type,
      params: request.params,
    };

    this.channels.set(channel.id, channel);
    return channel;
  }

  async stopWatch(channel: Channel): Promise<void> {
    this.channels.delete(channel.id);
  }

  /**
   * Helper method to add a mock change.
   */
  addChange(change: Change): void {
    this.changes.push(change);
  }

  /**
   * Helper method to clear all changes.
   */
  clearChanges(): void {
    this.changes = [];
  }
}

/**
 * Create a mock changes service.
 */
export function createMockChangesService(): MockChangesService {
  return new MockChangesService();
}

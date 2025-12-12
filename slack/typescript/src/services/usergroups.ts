/**
 * Usergroups service for Slack API.
 */

import { SlackClient } from '../client';
import { UserId, TeamId, ChannelId, SlackResponse } from '../types';

/**
 * Usergroup preferences
 */
export interface UsergroupPrefs {
  channels?: ChannelId[];
  groups?: ChannelId[];
}

/**
 * Usergroup object
 */
export interface Usergroup {
  id: string;
  team_id: TeamId;
  is_usergroup: boolean;
  is_subteam: boolean;
  name: string;
  description: string;
  handle: string;
  is_external: boolean;
  date_create: number;
  date_update: number;
  date_delete: number;
  auto_type?: string;
  auto_provision?: boolean;
  enterprise_subteam_id?: string;
  created_by: UserId;
  updated_by?: UserId;
  deleted_by?: UserId;
  prefs?: UsergroupPrefs;
  users?: UserId[];
  user_count?: number;
  channel_count?: number;
}

/**
 * Create usergroup parameters
 */
export interface CreateUsergroupParams {
  name: string;
  handle?: string;
  description?: string;
  channels?: ChannelId[];
  include_count?: boolean;
}

/**
 * Create usergroup response
 */
export interface CreateUsergroupResponse extends SlackResponse {
  usergroup: Usergroup;
}

/**
 * Disable usergroup response
 */
export interface DisableUsergroupResponse extends SlackResponse {
  usergroup: Usergroup;
}

/**
 * Enable usergroup response
 */
export interface EnableUsergroupResponse extends SlackResponse {
  usergroup: Usergroup;
}

/**
 * List usergroups parameters
 */
export interface ListUsergroupsParams {
  include_count?: boolean;
  include_disabled?: boolean;
  include_users?: boolean;
  [key: string]: string | number | boolean | undefined;
}

/**
 * List usergroups response
 */
export interface ListUsergroupsResponse extends SlackResponse {
  usergroups: Usergroup[];
}

/**
 * Update usergroup parameters
 */
export interface UpdateUsergroupParams {
  usergroup: string;
  name?: string;
  handle?: string;
  description?: string;
  channels?: ChannelId[];
  include_count?: boolean;
}

/**
 * Update usergroup response
 */
export interface UpdateUsergroupResponse extends SlackResponse {
  usergroup: Usergroup;
}

/**
 * Users list response
 */
export interface UsersListResponse extends SlackResponse {
  users: UserId[];
}

/**
 * Users update response
 */
export interface UsersUpdateResponse extends SlackResponse {
  usergroup: Usergroup;
}

/**
 * Usergroups service
 */
export class UsergroupsService {
  constructor(private client: SlackClient) {}

  /**
   * Create a usergroup
   */
  async create(name: string, params?: Omit<CreateUsergroupParams, 'name'>): Promise<Usergroup> {
    const response = await this.client.post<CreateUsergroupResponse>(
      'usergroups.create',
      { name, ...params }
    );
    return response.usergroup;
  }

  /**
   * Disable a usergroup
   */
  async disable(usergroup: string): Promise<Usergroup> {
    const response = await this.client.post<DisableUsergroupResponse>(
      'usergroups.disable',
      { usergroup }
    );
    return response.usergroup;
  }

  /**
   * Enable a usergroup
   */
  async enable(usergroup: string): Promise<Usergroup> {
    const response = await this.client.post<EnableUsergroupResponse>(
      'usergroups.enable',
      { usergroup }
    );
    return response.usergroup;
  }

  /**
   * List usergroups
   */
  async list(params?: ListUsergroupsParams): Promise<Usergroup[]> {
    const response = await this.client.get<ListUsergroupsResponse>(
      'usergroups.list',
      params
    );
    return response.usergroups;
  }

  /**
   * Update a usergroup
   */
  async update(usergroup: string, params: Omit<UpdateUsergroupParams, 'usergroup'>): Promise<Usergroup> {
    const response = await this.client.post<UpdateUsergroupResponse>(
      'usergroups.update',
      { usergroup, ...params }
    );
    return response.usergroup;
  }

  /**
   * List users in a usergroup
   */
  async usersList(usergroup: string): Promise<UserId[]> {
    const response = await this.client.get<UsersListResponse>(
      'usergroups.users.list',
      { usergroup }
    );
    return response.users;
  }

  /**
   * Update users in a usergroup
   */
  async usersUpdate(usergroup: string, users: UserId[]): Promise<Usergroup> {
    const response = await this.client.post<UsersUpdateResponse>(
      'usergroups.users.update',
      { usergroup, users: users.join(',') }
    );
    return response.usergroup;
  }
}

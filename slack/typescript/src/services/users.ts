/**
 * Users service for Slack API.
 */

import { SlackClient } from '../client';
import { User, UserProfile, UserPresence, DndStatus, UserId, SlackResponse, ResponseMetadata } from '../types';

/**
 * List users parameters
 */
export interface ListUsersParams {
  cursor?: string;
  include_locale?: boolean;
  limit?: number;
  team_id?: string;
}

/**
 * List users response
 */
export interface ListUsersResponse extends SlackResponse {
  members: User[];
  cache_ts: number;
  response_metadata?: ResponseMetadata;
}

/**
 * User info parameters
 */
export interface UserInfoParams {
  user: UserId;
  include_locale?: boolean;
}

/**
 * User info response
 */
export interface UserInfoResponse extends SlackResponse {
  user: User;
}

/**
 * Get profile parameters
 */
export interface GetProfileParams {
  user?: UserId;
  include_labels?: boolean;
}

/**
 * Get profile response
 */
export interface GetProfileResponse extends SlackResponse {
  profile: UserProfile;
}

/**
 * Set profile parameters
 */
export interface SetProfileParams {
  name?: string;
  value?: string;
  profile?: Partial<UserProfile>;
}

/**
 * Lookup by email response
 */
export interface LookupByEmailResponse extends SlackResponse {
  user: User;
}

/**
 * Get presence response
 */
export interface GetPresenceResponse extends SlackResponse {
  presence: string;
  online?: boolean;
  auto_away?: boolean;
  manual_away?: boolean;
  connection_count?: number;
  last_activity?: number;
}

/**
 * Identity response (for OAuth)
 */
export interface IdentityResponse extends SlackResponse {
  user: {
    id: UserId;
    name: string;
    email?: string;
    image_24?: string;
    image_32?: string;
    image_48?: string;
    image_72?: string;
    image_192?: string;
    image_512?: string;
  };
  team: {
    id: string;
    name: string;
    domain?: string;
    image_34?: string;
    image_44?: string;
    image_68?: string;
    image_88?: string;
    image_102?: string;
    image_132?: string;
    image_230?: string;
  };
}

/**
 * DND info response
 */
export interface DndInfoResponse extends SlackResponse, DndStatus {}

/**
 * DND team info response
 */
export interface DndTeamInfoResponse extends SlackResponse {
  users: Record<UserId, DndStatus>;
}

/**
 * Users service
 */
export class UsersService {
  constructor(private client: SlackClient) {}

  /**
   * List users
   */
  async list(params: ListUsersParams = {}): Promise<ListUsersResponse> {
    return this.client.get<ListUsersResponse>('users.list', params);
  }

  /**
   * Get all users
   */
  async listAll(params: Omit<ListUsersParams, 'cursor'> = {}): Promise<User[]> {
    return this.client.getAllPages<User, ListUsersResponse>(
      'users.list',
      params,
      (response) => response.members
    );
  }

  /**
   * Get user info
   */
  async info(params: UserInfoParams): Promise<User> {
    const response = await this.client.get<UserInfoResponse>('users.info', params);
    return response.user;
  }

  /**
   * Get user profile
   */
  async getProfile(params: GetProfileParams = {}): Promise<UserProfile> {
    const response = await this.client.get<GetProfileResponse>('users.profile.get', params);
    return response.profile;
  }

  /**
   * Set user profile
   */
  async setProfile(params: SetProfileParams): Promise<UserProfile> {
    const body: Record<string, unknown> = {};
    if (params.name && params.value) {
      body.name = params.name;
      body.value = params.value;
    }
    if (params.profile) {
      body.profile = JSON.stringify(params.profile);
    }

    const response = await this.client.post<GetProfileResponse>('users.profile.set', body);
    return response.profile;
  }

  /**
   * Lookup user by email
   */
  async lookupByEmail(email: string): Promise<User> {
    const response = await this.client.get<LookupByEmailResponse>('users.lookupByEmail', {
      email,
    });
    return response.user;
  }

  /**
   * Get user presence
   */
  async getPresence(user: UserId): Promise<UserPresence> {
    const response = await this.client.get<GetPresenceResponse>('users.getPresence', { user });
    return {
      presence: response.presence as 'active' | 'away',
      online: response.online,
      auto_away: response.auto_away,
      manual_away: response.manual_away,
      connection_count: response.connection_count,
      last_activity: response.last_activity,
    };
  }

  /**
   * Set user presence
   */
  async setPresence(presence: 'auto' | 'away'): Promise<void> {
    await this.client.post('users.setPresence', { presence });
  }

  /**
   * Get identity (OAuth)
   */
  async identity(): Promise<IdentityResponse> {
    return this.client.get<IdentityResponse>('users.identity');
  }

  /**
   * Set user active
   */
  async setActive(): Promise<void> {
    await this.client.post('users.setActive');
  }

  /**
   * Delete photo
   */
  async deletePhoto(): Promise<void> {
    await this.client.post('users.deletePhoto');
  }

  /**
   * Get DND info for user
   */
  async dndInfo(user?: UserId): Promise<DndStatus> {
    const params: Record<string, string> = {};
    if (user) params.user = user;

    const response = await this.client.get<DndInfoResponse>('dnd.info', params);
    return {
      dnd_enabled: response.dnd_enabled,
      next_dnd_start_ts: response.next_dnd_start_ts,
      next_dnd_end_ts: response.next_dnd_end_ts,
      snooze_enabled: response.snooze_enabled,
      snooze_endtime: response.snooze_endtime,
      snooze_remaining: response.snooze_remaining,
    };
  }

  /**
   * Get DND info for team
   */
  async dndTeamInfo(users: UserId[]): Promise<Record<UserId, DndStatus>> {
    const response = await this.client.get<DndTeamInfoResponse>('dnd.teamInfo', {
      users: users.join(','),
    });
    return response.users;
  }

  /**
   * Set DND snooze
   */
  async setSnooze(numMinutes: number): Promise<DndStatus> {
    return this.client.post<DndInfoResponse>('dnd.setSnooze', { num_minutes: numMinutes });
  }

  /**
   * End DND snooze
   */
  async endSnooze(): Promise<DndStatus> {
    return this.client.post<DndInfoResponse>('dnd.endSnooze');
  }

  /**
   * End DND
   */
  async endDnd(): Promise<void> {
    await this.client.post('dnd.endDnd');
  }

  /**
   * Get conversations for user
   */
  async conversations(
    user: UserId,
    options?: {
      cursor?: string;
      exclude_archived?: boolean;
      limit?: number;
      types?: string;
    }
  ): Promise<{ channels: { id: string; name?: string }[]; response_metadata?: ResponseMetadata }> {
    return this.client.get('users.conversations', { user, ...options });
  }
}

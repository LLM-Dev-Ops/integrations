/**
 * User-related types.
 */

import { TeamId, UserId } from './common';

/**
 * User profile
 */
export interface UserProfile {
  avatar_hash?: string;
  status_text?: string;
  status_emoji?: string;
  status_expiration?: number;
  real_name?: string;
  real_name_normalized?: string;
  display_name?: string;
  display_name_normalized?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  title?: string;
  phone?: string;
  skype?: string;
  image_24?: string;
  image_32?: string;
  image_48?: string;
  image_72?: string;
  image_192?: string;
  image_512?: string;
  image_1024?: string;
  image_original?: string;
  team?: TeamId;
  bot_id?: string;
  api_app_id?: string;
  always_active?: boolean;
}

/**
 * Slack user
 */
export interface User {
  /** User ID */
  id: UserId;
  /** Team ID */
  team_id?: TeamId;
  /** Username */
  name?: string;
  /** Real name */
  real_name?: string;
  /** Display name */
  display_name?: string;
  /** Whether deleted */
  deleted?: boolean;
  /** User color */
  color?: string;
  /** Timezone */
  tz?: string;
  /** Timezone label */
  tz_label?: string;
  /** Timezone offset */
  tz_offset?: number;
  /** User profile */
  profile?: UserProfile;
  /** Whether admin */
  is_admin?: boolean;
  /** Whether owner */
  is_owner?: boolean;
  /** Whether primary owner */
  is_primary_owner?: boolean;
  /** Whether restricted */
  is_restricted?: boolean;
  /** Whether ultra restricted */
  is_ultra_restricted?: boolean;
  /** Whether bot */
  is_bot?: boolean;
  /** Whether app user */
  is_app_user?: boolean;
  /** Whether has 2FA */
  has_2fa?: boolean;
  /** Updated timestamp */
  updated?: number;
  /** Email confirmed */
  is_email_confirmed?: boolean;
  /** Locale */
  locale?: string;
}

/**
 * Get best display name for user
 */
export function getDisplayName(user: User): string {
  return (
    user.display_name ||
    user.profile?.display_name ||
    user.real_name ||
    user.name ||
    user.id
  );
}

/**
 * Check if user is a regular user (not bot, not deleted)
 */
export function isRegularUser(user: User): boolean {
  return !user.is_bot && !user.deleted && !user.is_app_user;
}

/**
 * Get user email
 */
export function getEmail(user: User): string | undefined {
  return user.profile?.email;
}

/**
 * Get user avatar URL
 */
export function getAvatarUrl(user: User): string | undefined {
  const profile = user.profile;
  if (!profile) return undefined;

  return (
    profile.image_192 ??
    profile.image_72 ??
    profile.image_48 ??
    profile.image_32 ??
    profile.image_24
  );
}

/**
 * Get user status
 */
export function getStatus(user: User): string | undefined {
  const profile = user.profile;
  if (!profile) return undefined;

  if (profile.status_emoji && profile.status_text) {
    return `${profile.status_emoji} ${profile.status_text}`;
  }
  return profile.status_emoji || profile.status_text;
}

/**
 * Presence status
 */
export type PresenceStatus = 'active' | 'away';

/**
 * User presence
 */
export interface UserPresence {
  presence: PresenceStatus;
  online?: boolean;
  auto_away?: boolean;
  manual_away?: boolean;
  connection_count?: number;
  last_activity?: number;
}

/**
 * Do Not Disturb status
 */
export interface DndStatus {
  dnd_enabled: boolean;
  next_dnd_start_ts?: number;
  next_dnd_end_ts?: number;
  snooze_enabled?: boolean;
  snooze_endtime?: number;
  snooze_remaining?: number;
}

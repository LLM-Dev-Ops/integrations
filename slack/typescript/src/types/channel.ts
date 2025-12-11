/**
 * Channel-related types.
 */

import { ChannelId, TeamId, Timestamp, UserId } from './common';

/**
 * Channel type
 */
export type ChannelType = 'public_channel' | 'private_channel' | 'mpim' | 'im';

/**
 * Channel topic
 */
export interface ChannelTopic {
  value: string;
  creator: UserId;
  last_set: number;
}

/**
 * Channel purpose
 */
export interface ChannelPurpose {
  value: string;
  creator: UserId;
  last_set: number;
}

/**
 * Slack channel/conversation
 */
export interface Channel {
  /** Channel ID */
  id: ChannelId;
  /** Channel name (without #) */
  name?: string;
  /** Normalized name */
  name_normalized?: string;
  /** Whether this is a channel */
  is_channel?: boolean;
  /** Whether this is a group (private channel) */
  is_group?: boolean;
  /** Whether this is an IM (direct message) */
  is_im?: boolean;
  /** Whether this is an MPIM */
  is_mpim?: boolean;
  /** Whether this is private */
  is_private?: boolean;
  /** Whether archived */
  is_archived?: boolean;
  /** Whether general */
  is_general?: boolean;
  /** Whether shared */
  is_shared?: boolean;
  /** Whether externally shared */
  is_ext_shared?: boolean;
  /** Whether org shared */
  is_org_shared?: boolean;
  /** Whether pending external */
  is_pending_ext_shared?: boolean;
  /** Whether member */
  is_member?: boolean;
  /** Creator user ID */
  creator?: UserId;
  /** Creation timestamp (Unix) */
  created?: number;
  /** Unread count */
  unread_count?: number;
  /** Unread count display */
  unread_count_display?: number;
  /** Last read timestamp */
  last_read?: Timestamp;
  /** Channel topic */
  topic?: ChannelTopic;
  /** Channel purpose */
  purpose?: ChannelPurpose;
  /** Previous names */
  previous_names?: string[];
  /** Number of members */
  num_members?: number;
  /** Locale */
  locale?: string;
  /** Priority */
  priority?: number;
  /** User ID (for DMs) */
  user?: UserId;
  /** Context team ID */
  context_team_id?: TeamId;
  /** Internal team IDs */
  internal_team_ids?: TeamId[];
  /** Shared team IDs */
  shared_team_ids?: TeamId[];
  /** Whether open (for DMs) */
  is_open?: boolean;
}

/**
 * Get display name for channel
 */
export function getChannelDisplayName(channel: Channel): string {
  return channel.name || channel.id;
}

/**
 * Check if channel is a direct message
 */
export function isDirectMessage(channel: Channel): boolean {
  return channel.is_im === true;
}

/**
 * Check if channel is a group message
 */
export function isGroupMessage(channel: Channel): boolean {
  return channel.is_mpim === true;
}

/**
 * Check if channel is a standard channel
 */
export function isStandardChannel(channel: Channel): boolean {
  return channel.is_channel === true || channel.is_group === true;
}

/**
 * Minimal channel info
 */
export interface ChannelInfo {
  id: ChannelId;
  name?: string;
}

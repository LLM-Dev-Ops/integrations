/**
 * Discord channel types and related structures.
 */

import { Snowflake } from './snowflake.js';

/**
 * Discord channel types.
 */
export enum ChannelType {
  /** A text channel within a server */
  GuildText = 0,
  /** A direct message between users */
  DM = 1,
  /** A voice channel within a server */
  GuildVoice = 2,
  /** A direct message between multiple users */
  GroupDM = 3,
  /** An organizational category */
  GuildCategory = 4,
  /** A channel for announcements */
  GuildAnnouncement = 5,
  /** A temporary sub-channel within announcement channel */
  AnnouncementThread = 10,
  /** A temporary sub-channel within a text channel */
  PublicThread = 11,
  /** A temporary sub-channel that is only viewable by invited users */
  PrivateThread = 12,
  /** A voice channel for hosting events */
  GuildStageVoice = 13,
  /** A channel in a hub containing listed servers */
  GuildDirectory = 14,
  /** A channel for text with polls */
  GuildForum = 15,
  /** A channel for media only */
  GuildMedia = 16,
}

/**
 * Thread auto-archive duration in minutes.
 */
export enum ThreadAutoArchiveDuration {
  /** 1 hour */
  OneHour = 60,
  /** 24 hours */
  OneDay = 1440,
  /** 3 days */
  ThreeDays = 4320,
  /** 1 week */
  OneWeek = 10080,
}

/**
 * Discord channel object.
 */
export interface Channel {
  /** Channel ID */
  id: Snowflake;
  /** Channel type */
  type: ChannelType;
  /** Guild ID (not present for DMs) */
  guild_id?: Snowflake;
  /** Sorting position */
  position?: number;
  /** Channel name */
  name?: string;
  /** Channel topic */
  topic?: string | null;
  /** Whether the channel is NSFW */
  nsfw?: boolean;
  /** ID of last message sent */
  last_message_id?: Snowflake | null;
  /** Bitrate for voice channels */
  bitrate?: number;
  /** User limit for voice channels */
  user_limit?: number;
  /** Slowmode delay in seconds */
  rate_limit_per_user?: number;
  /** Recipients for DMs */
  recipients?: Array<{
    id: Snowflake;
    username: string;
    discriminator: string;
  }>;
  /** Channel icon hash */
  icon?: string | null;
  /** Owner ID for group DMs */
  owner_id?: Snowflake;
  /** Application ID for group DMs if bot-created */
  application_id?: Snowflake;
  /** Parent category ID */
  parent_id?: Snowflake | null;
  /** Last pin timestamp */
  last_pin_timestamp?: string | null;
  /** Thread-specific metadata */
  thread_metadata?: ThreadMetadata;
  /** Thread member object */
  member?: ThreadMember;
  /** Default auto-archive duration */
  default_auto_archive_duration?: ThreadAutoArchiveDuration;
  /** Default thread slowmode */
  default_thread_rate_limit_per_user?: number;
}

/**
 * Thread-specific metadata.
 */
export interface ThreadMetadata {
  /** Whether the thread is archived */
  archived: boolean;
  /** Auto-archive duration in minutes */
  auto_archive_duration: ThreadAutoArchiveDuration;
  /** Timestamp when the thread was archived */
  archive_timestamp: string;
  /** Whether the thread is locked */
  locked: boolean;
  /** Whether non-moderators can add other users */
  invitable?: boolean;
  /** Timestamp when the thread was created */
  create_timestamp?: string | null;
}

/**
 * Thread member object.
 */
export interface ThreadMember {
  /** Thread ID */
  id?: Snowflake;
  /** User ID */
  user_id?: Snowflake;
  /** Timestamp when the user joined the thread */
  join_timestamp: string;
  /** User-thread settings */
  flags: number;
}

/**
 * Channel target - can be a Snowflake ID or a named route.
 */
export type ChannelTarget =
  | { type: 'id'; id: Snowflake }
  | { type: 'name'; name: string };

/**
 * Creates a channel target from a Snowflake ID.
 */
export function channelById(id: Snowflake): ChannelTarget {
  return { type: 'id', id };
}

/**
 * Creates a channel target from a named route.
 */
export function channelByName(name: string): ChannelTarget {
  return { type: 'name', name };
}

/**
 * Type guard to check if a channel is a text-based channel.
 */
export function isTextChannel(channel: Channel): boolean {
  return [
    ChannelType.GuildText,
    ChannelType.DM,
    ChannelType.GroupDM,
    ChannelType.GuildAnnouncement,
    ChannelType.AnnouncementThread,
    ChannelType.PublicThread,
    ChannelType.PrivateThread,
  ].includes(channel.type);
}

/**
 * Type guard to check if a channel is a thread.
 */
export function isThread(channel: Channel): boolean {
  return [
    ChannelType.AnnouncementThread,
    ChannelType.PublicThread,
    ChannelType.PrivateThread,
  ].includes(channel.type);
}

/**
 * Type guard to check if a channel is a DM.
 */
export function isDMChannel(channel: Channel): boolean {
  return channel.type === ChannelType.DM || channel.type === ChannelType.GroupDM;
}

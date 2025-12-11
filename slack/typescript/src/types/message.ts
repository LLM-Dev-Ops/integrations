/**
 * Message-related types.
 */

import { ChannelId, FileId, Timestamp, UserId } from './common';

/**
 * Message edit info
 */
export interface MessageEdited {
  user: UserId;
  ts: Timestamp;
}

/**
 * Reaction on a message
 */
export interface Reaction {
  name: string;
  users: UserId[];
  count: number;
}

/**
 * Attachment field
 */
export interface AttachmentField {
  title: string;
  value: string;
  short?: boolean;
}

/**
 * Message attachment (legacy)
 */
export interface Attachment {
  id?: number;
  fallback?: string;
  color?: string;
  pretext?: string;
  author_name?: string;
  author_link?: string;
  author_icon?: string;
  title?: string;
  title_link?: string;
  text?: string;
  fields?: AttachmentField[];
  image_url?: string;
  thumb_url?: string;
  footer?: string;
  footer_icon?: string;
  ts?: number;
  mrkdwn_in?: string[];
}

/**
 * Block Kit block
 */
export interface Block {
  type: string;
  block_id?: string;
  [key: string]: unknown;
}

/**
 * Bot profile info
 */
export interface BotProfile {
  id: string;
  app_id?: string;
  name?: string;
  icons?: {
    image_36?: string;
    image_48?: string;
    image_72?: string;
  };
  deleted?: boolean;
  team_id?: string;
}

/**
 * File attached to message
 */
export interface File {
  id: FileId;
  name?: string;
  title?: string;
  mimetype?: string;
  filetype?: string;
  pretty_type?: string;
  user?: UserId;
  mode?: string;
  editable?: boolean;
  is_external?: boolean;
  external_type?: string;
  size?: number;
  url_private?: string;
  url_private_download?: string;
  original_w?: number;
  original_h?: number;
  thumb_64?: string;
  thumb_80?: string;
  thumb_360?: string;
  thumb_480?: string;
  thumb_720?: string;
  thumb_960?: string;
  thumb_1024?: string;
  permalink?: string;
  permalink_public?: string;
  created?: number;
  timestamp?: number;
  channels?: ChannelId[];
  groups?: ChannelId[];
  ims?: ChannelId[];
}

/**
 * Message metadata
 */
export interface MessageMetadata {
  event_type: string;
  event_payload: Record<string, unknown>;
}

/**
 * Slack message
 */
export interface Message {
  /** Message type */
  type: string;
  /** Message subtype */
  subtype?: string;
  /** Message text */
  text?: string;
  /** User who sent */
  user?: UserId;
  /** Bot ID if bot */
  bot_id?: string;
  /** Message timestamp */
  ts: Timestamp;
  /** Thread timestamp */
  thread_ts?: Timestamp;
  /** Parent user ID */
  parent_user_id?: UserId;
  /** Reply count */
  reply_count?: number;
  /** Reply users count */
  reply_users_count?: number;
  /** Latest reply */
  latest_reply?: Timestamp;
  /** Reply users */
  reply_users?: UserId[];
  /** Whether starred */
  is_starred?: boolean;
  /** Reactions */
  reactions?: Reaction[];
  /** Attachments */
  attachments?: Attachment[];
  /** Blocks */
  blocks?: Block[];
  /** Files */
  files?: File[];
  /** Channel ID */
  channel?: ChannelId;
  /** Team */
  team?: string;
  /** Edit info */
  edited?: MessageEdited;
  /** Permalink */
  permalink?: string;
  /** Bot profile */
  bot_profile?: BotProfile;
  /** App ID */
  app_id?: string;
  /** Username */
  username?: string;
  /** Metadata */
  metadata?: MessageMetadata;
}

/**
 * Check if message is a thread parent
 */
export function isThreadParent(message: Message): boolean {
  return (message.reply_count ?? 0) > 0;
}

/**
 * Check if message is a thread reply
 */
export function isThreadReply(message: Message): boolean {
  return !!message.thread_ts && message.thread_ts !== message.ts;
}

/**
 * Check if message is from a bot
 */
export function isBotMessage(message: Message): boolean {
  return !!message.bot_id || message.subtype === 'bot_message';
}

/**
 * Get effective text content
 */
export function getMessageContent(message: Message): string {
  return message.text ?? '';
}

/**
 * Check if file is an image
 */
export function isImageFile(file: File): boolean {
  return file.mimetype?.startsWith('image/') ?? false;
}

/**
 * Get best thumbnail URL
 */
export function getBestThumbnail(file: File): string | undefined {
  return (
    file.thumb_1024 ??
    file.thumb_960 ??
    file.thumb_720 ??
    file.thumb_480 ??
    file.thumb_360 ??
    file.thumb_80 ??
    file.thumb_64
  );
}

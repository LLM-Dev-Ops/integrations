/**
 * Common types used across the Slack API.
 */

/**
 * Slack timestamp (ts) - unique identifier for messages
 */
export type Timestamp = string;

/**
 * Slack channel ID
 */
export type ChannelId = string;

/**
 * Slack user ID
 */
export type UserId = string;

/**
 * Slack team/workspace ID
 */
export type TeamId = string;

/**
 * Slack file ID
 */
export type FileId = string;

/**
 * Cursor for pagination
 */
export type Cursor = string;

/**
 * Check if channel is public (starts with C)
 */
export function isPublicChannel(channelId: ChannelId): boolean {
  return channelId.startsWith('C');
}

/**
 * Check if channel is private (starts with G)
 */
export function isPrivateChannel(channelId: ChannelId): boolean {
  return channelId.startsWith('G');
}

/**
 * Check if channel is a DM (starts with D)
 */
export function isDM(channelId: ChannelId): boolean {
  return channelId.startsWith('D');
}

/**
 * Check if user is a bot (starts with B)
 */
export function isBot(userId: UserId): boolean {
  return userId.startsWith('B');
}

/**
 * Parse timestamp to Date
 */
export function parseTimestamp(ts: Timestamp): Date {
  const secs = parseFloat(ts.split('.')[0]);
  return new Date(secs * 1000);
}

/**
 * Response metadata for pagination
 */
export interface ResponseMetadata {
  /** Next cursor for pagination */
  next_cursor?: string;
}

/**
 * Check if there are more results
 */
export function hasMore(metadata?: ResponseMetadata): boolean {
  return !!metadata?.next_cursor && metadata.next_cursor !== '';
}

/**
 * Base response structure
 */
export interface SlackResponse<T = unknown> {
  /** Whether the request was successful */
  ok: boolean;
  /** Error code if not successful */
  error?: string;
  /** Warning message */
  warning?: string;
  /** Response metadata */
  response_metadata?: ResponseMetadata;
  /** Response data */
  [key: string]: unknown;
}

/**
 * Icon URLs
 */
export interface IconUrls {
  image_36?: string;
  image_48?: string;
  image_72?: string;
  image_192?: string;
  image_512?: string;
  image_original?: string;
}

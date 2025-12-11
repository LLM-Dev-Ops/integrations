/**
 * Slack Events API types and handlers.
 */

import { Message, Channel, User, ChannelId, UserId, Timestamp } from '../types';

/**
 * Event callback wrapper
 */
export interface EventCallback<T = unknown> {
  token?: string;
  team_id: string;
  api_app_id: string;
  event: T;
  type: 'event_callback';
  event_id: string;
  event_time: number;
  authorizations?: Array<{
    enterprise_id?: string;
    team_id: string;
    user_id: string;
    is_bot: boolean;
    is_enterprise_install?: boolean;
  }>;
  is_ext_shared_channel?: boolean;
}

/**
 * URL verification challenge
 */
export interface UrlVerification {
  type: 'url_verification';
  token: string;
  challenge: string;
}

/**
 * App rate limited event
 */
export interface AppRateLimited {
  type: 'app_rate_limited';
  token: string;
  team_id: string;
  minute_rate_limited: number;
  api_app_id: string;
}

/**
 * Base event type
 */
export interface BaseEvent {
  type: string;
  event_ts?: string;
}

/**
 * Message event
 */
export interface MessageEvent extends BaseEvent {
  type: 'message';
  subtype?: string;
  channel: ChannelId;
  user?: UserId;
  text?: string;
  ts: Timestamp;
  thread_ts?: Timestamp;
  channel_type?: 'channel' | 'group' | 'im' | 'mpim';
  bot_id?: string;
  edited?: {
    user: UserId;
    ts: Timestamp;
  };
  files?: unknown[];
  blocks?: unknown[];
  attachments?: unknown[];
}

/**
 * Reaction added event
 */
export interface ReactionAddedEvent extends BaseEvent {
  type: 'reaction_added';
  user: UserId;
  reaction: string;
  item_user?: UserId;
  item: {
    type: 'message' | 'file' | 'file_comment';
    channel?: ChannelId;
    ts?: Timestamp;
    file?: string;
    file_comment?: string;
  };
}

/**
 * Reaction removed event
 */
export interface ReactionRemovedEvent extends BaseEvent {
  type: 'reaction_removed';
  user: UserId;
  reaction: string;
  item_user?: UserId;
  item: {
    type: 'message' | 'file' | 'file_comment';
    channel?: ChannelId;
    ts?: Timestamp;
    file?: string;
    file_comment?: string;
  };
}

/**
 * Channel created event
 */
export interface ChannelCreatedEvent extends BaseEvent {
  type: 'channel_created';
  channel: {
    id: ChannelId;
    name: string;
    created: number;
    creator: UserId;
  };
}

/**
 * Channel renamed event
 */
export interface ChannelRenamedEvent extends BaseEvent {
  type: 'channel_rename';
  channel: {
    id: ChannelId;
    name: string;
    created: number;
  };
}

/**
 * Channel archived event
 */
export interface ChannelArchivedEvent extends BaseEvent {
  type: 'channel_archive';
  channel: ChannelId;
  user: UserId;
}

/**
 * Channel unarchived event
 */
export interface ChannelUnarchivedEvent extends BaseEvent {
  type: 'channel_unarchive';
  channel: ChannelId;
  user: UserId;
}

/**
 * Member joined channel event
 */
export interface MemberJoinedChannelEvent extends BaseEvent {
  type: 'member_joined_channel';
  user: UserId;
  channel: ChannelId;
  channel_type: string;
  team: string;
  inviter?: UserId;
}

/**
 * Member left channel event
 */
export interface MemberLeftChannelEvent extends BaseEvent {
  type: 'member_left_channel';
  user: UserId;
  channel: ChannelId;
  channel_type: string;
  team: string;
}

/**
 * User change event
 */
export interface UserChangeEvent extends BaseEvent {
  type: 'user_change';
  user: User;
}

/**
 * Team join event
 */
export interface TeamJoinEvent extends BaseEvent {
  type: 'team_join';
  user: User;
}

/**
 * App home opened event
 */
export interface AppHomeOpenedEvent extends BaseEvent {
  type: 'app_home_opened';
  user: UserId;
  channel: ChannelId;
  tab: 'home' | 'messages';
  view?: unknown;
}

/**
 * App mention event
 */
export interface AppMentionEvent extends BaseEvent {
  type: 'app_mention';
  user: UserId;
  text: string;
  ts: Timestamp;
  channel: ChannelId;
  thread_ts?: Timestamp;
}

/**
 * File shared event
 */
export interface FileSharedEvent extends BaseEvent {
  type: 'file_shared';
  file_id: string;
  user_id: UserId;
  file: {
    id: string;
  };
  channel_id: ChannelId;
}

/**
 * Pin added event
 */
export interface PinAddedEvent extends BaseEvent {
  type: 'pin_added';
  user: UserId;
  channel_id: ChannelId;
  item: {
    type: string;
    channel?: ChannelId;
    message?: Message;
    created?: number;
    created_by?: UserId;
  };
}

/**
 * Pin removed event
 */
export interface PinRemovedEvent extends BaseEvent {
  type: 'pin_removed';
  user: UserId;
  channel_id: ChannelId;
  item: {
    type: string;
    channel?: ChannelId;
    message?: Message;
    created?: number;
    created_by?: UserId;
  };
  has_pins: boolean;
}

/**
 * All event types
 */
export type SlackEvent =
  | MessageEvent
  | ReactionAddedEvent
  | ReactionRemovedEvent
  | ChannelCreatedEvent
  | ChannelRenamedEvent
  | ChannelArchivedEvent
  | ChannelUnarchivedEvent
  | MemberJoinedChannelEvent
  | MemberLeftChannelEvent
  | UserChangeEvent
  | TeamJoinEvent
  | AppHomeOpenedEvent
  | AppMentionEvent
  | FileSharedEvent
  | PinAddedEvent
  | PinRemovedEvent;

/**
 * Event handler type
 */
export type EventHandler<T extends BaseEvent = SlackEvent> = (
  event: T,
  context: EventCallback<T>
) => void | Promise<void>;

/**
 * Event dispatcher
 */
export class EventDispatcher {
  private handlers: Map<string, EventHandler[]> = new Map();

  /**
   * Register event handler
   */
  on<T extends BaseEvent>(eventType: string, handler: EventHandler<T>): void {
    const handlers = this.handlers.get(eventType) ?? [];
    handlers.push(handler as EventHandler);
    this.handlers.set(eventType, handlers);
  }

  /**
   * Remove event handler
   */
  off(eventType: string, handler?: EventHandler): void {
    if (!handler) {
      this.handlers.delete(eventType);
      return;
    }

    const handlers = this.handlers.get(eventType);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Dispatch event
   */
  async dispatch(callback: EventCallback): Promise<void> {
    const event = callback.event as SlackEvent;
    const handlers = this.handlers.get(event.type) ?? [];
    const wildcardHandlers = this.handlers.get('*') ?? [];

    const allHandlers = [...handlers, ...wildcardHandlers];

    for (const handler of allHandlers) {
      await handler(event, callback as EventCallback<typeof event>);
    }
  }

  /**
   * Handle incoming request
   */
  async handleRequest(
    body: UrlVerification | EventCallback | AppRateLimited
  ): Promise<{ challenge?: string } | void> {
    // URL verification
    if (body.type === 'url_verification') {
      return { challenge: (body as UrlVerification).challenge };
    }

    // App rate limited
    if (body.type === 'app_rate_limited') {
      const rateLimitedHandlers = this.handlers.get('app_rate_limited') ?? [];
      for (const handler of rateLimitedHandlers) {
        await handler(body as unknown as SlackEvent, {} as EventCallback);
      }
      return;
    }

    // Event callback
    if (body.type === 'event_callback') {
      await this.dispatch(body as EventCallback);
    }
  }
}

/**
 * Create event dispatcher
 */
export function createEventDispatcher(): EventDispatcher {
  return new EventDispatcher();
}

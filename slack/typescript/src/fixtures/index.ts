/**
 * Test fixtures for Slack API testing.
 */

import { Channel, Message, User, UserProfile, UserPresence, DndStatus, ChannelId, UserId, Timestamp, File } from '../types';

/**
 * Generate a random ID
 */
function randomId(prefix: string): string {
  return `${prefix}${Math.random().toString(36).substring(2, 11).toUpperCase()}`;
}

/**
 * Generate a timestamp
 */
function generateTimestamp(): Timestamp {
  const secs = Math.floor(Date.now() / 1000);
  const micros = Math.floor(Math.random() * 1000000);
  return `${secs}.${micros.toString().padStart(6, '0')}`;
}

/**
 * Channel fixtures
 */
export const channelFixtures = {
  /**
   * Create a public channel
   */
  publicChannel(overrides?: Partial<Channel>): Channel {
    const id = randomId('C') as ChannelId;
    return {
      id,
      name: 'general',
      name_normalized: 'general',
      is_channel: true,
      is_group: false,
      is_im: false,
      is_mpim: false,
      is_private: false,
      is_archived: false,
      is_general: true,
      is_shared: false,
      is_member: true,
      creator: randomId('U') as UserId,
      created: Math.floor(Date.now() / 1000),
      num_members: 10,
      ...overrides,
    };
  },

  /**
   * Create a private channel
   */
  privateChannel(overrides?: Partial<Channel>): Channel {
    const id = randomId('G') as ChannelId;
    return {
      id,
      name: 'private-channel',
      name_normalized: 'private-channel',
      is_channel: false,
      is_group: true,
      is_im: false,
      is_mpim: false,
      is_private: true,
      is_archived: false,
      is_general: false,
      is_shared: false,
      is_member: true,
      creator: randomId('U') as UserId,
      created: Math.floor(Date.now() / 1000),
      num_members: 5,
      ...overrides,
    };
  },

  /**
   * Create a direct message
   */
  directMessage(userId?: UserId, overrides?: Partial<Channel>): Channel {
    const id = randomId('D') as ChannelId;
    return {
      id,
      is_channel: false,
      is_group: false,
      is_im: true,
      is_mpim: false,
      is_private: true,
      is_open: true,
      user: userId ?? (randomId('U') as UserId),
      ...overrides,
    };
  },

  /**
   * Create a multi-party direct message
   */
  multiPartyDM(overrides?: Partial<Channel>): Channel {
    const id = randomId('G') as ChannelId;
    return {
      id,
      name: 'mpdm-user1--user2--user3-1',
      is_channel: false,
      is_group: true,
      is_im: false,
      is_mpim: true,
      is_private: true,
      is_open: true,
      ...overrides,
    };
  },
};

/**
 * Message fixtures
 */
export const messageFixtures = {
  /**
   * Create a simple message
   */
  simple(text: string, overrides?: Partial<Message>): Message {
    return {
      type: 'message',
      text,
      user: randomId('U') as UserId,
      ts: generateTimestamp(),
      ...overrides,
    };
  },

  /**
   * Create a thread parent message
   */
  threadParent(text: string, replyCount: number, overrides?: Partial<Message>): Message {
    const ts = generateTimestamp();
    return {
      type: 'message',
      text,
      user: randomId('U') as UserId,
      ts,
      thread_ts: ts,
      reply_count: replyCount,
      reply_users_count: Math.min(replyCount, 5),
      latest_reply: generateTimestamp(),
      ...overrides,
    };
  },

  /**
   * Create a thread reply
   */
  threadReply(text: string, threadTs: Timestamp, overrides?: Partial<Message>): Message {
    return {
      type: 'message',
      text,
      user: randomId('U') as UserId,
      ts: generateTimestamp(),
      thread_ts: threadTs,
      ...overrides,
    };
  },

  /**
   * Create a bot message
   */
  botMessage(text: string, overrides?: Partial<Message>): Message {
    return {
      type: 'message',
      subtype: 'bot_message',
      text,
      bot_id: randomId('B'),
      ts: generateTimestamp(),
      username: 'Test Bot',
      ...overrides,
    };
  },

  /**
   * Create a message with reactions
   */
  withReactions(text: string, reactions: Array<{ name: string; count: number }>, overrides?: Partial<Message>): Message {
    return {
      type: 'message',
      text,
      user: randomId('U') as UserId,
      ts: generateTimestamp(),
      reactions: reactions.map((r) => ({
        name: r.name,
        count: r.count,
        users: Array.from({ length: r.count }, () => randomId('U') as UserId),
      })),
      ...overrides,
    };
  },

  /**
   * Create a message with attachments
   */
  withAttachments(text: string, overrides?: Partial<Message>): Message {
    return {
      type: 'message',
      text,
      user: randomId('U') as UserId,
      ts: generateTimestamp(),
      attachments: [
        {
          id: 1,
          fallback: 'Attachment fallback',
          color: '#36a64f',
          title: 'Attachment Title',
          text: 'Attachment text',
        },
      ],
      ...overrides,
    };
  },

  /**
   * Create a message with blocks
   */
  withBlocks(text: string, overrides?: Partial<Message>): Message {
    return {
      type: 'message',
      text,
      user: randomId('U') as UserId,
      ts: generateTimestamp(),
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text },
        },
      ],
      ...overrides,
    };
  },
};

/**
 * User fixtures
 */
export const userFixtures = {
  /**
   * Create a regular user
   */
  regular(overrides?: Partial<User>): User {
    const id = randomId('U') as UserId;
    return {
      id,
      team_id: randomId('T'),
      name: 'testuser',
      real_name: 'Test User',
      display_name: 'Test User',
      deleted: false,
      is_admin: false,
      is_owner: false,
      is_primary_owner: false,
      is_restricted: false,
      is_ultra_restricted: false,
      is_bot: false,
      is_app_user: false,
      has_2fa: false,
      updated: Math.floor(Date.now() / 1000),
      is_email_confirmed: true,
      profile: {
        real_name: 'Test User',
        display_name: 'testuser',
        email: 'test@example.com',
        image_48: 'https://example.com/avatar.png',
      },
      ...overrides,
    };
  },

  /**
   * Create an admin user
   */
  admin(overrides?: Partial<User>): User {
    return userFixtures.regular({
      is_admin: true,
      ...overrides,
    });
  },

  /**
   * Create an owner user
   */
  owner(overrides?: Partial<User>): User {
    return userFixtures.regular({
      is_admin: true,
      is_owner: true,
      ...overrides,
    });
  },

  /**
   * Create a bot user
   */
  bot(overrides?: Partial<User>): User {
    const id = randomId('B') as UserId;
    return {
      id,
      team_id: randomId('T'),
      name: 'testbot',
      real_name: 'Test Bot',
      deleted: false,
      is_admin: false,
      is_owner: false,
      is_bot: true,
      is_app_user: true,
      profile: {
        real_name: 'Test Bot',
        bot_id: randomId('B'),
        api_app_id: randomId('A'),
      },
      ...overrides,
    };
  },

  /**
   * Create a guest user
   */
  guest(overrides?: Partial<User>): User {
    return userFixtures.regular({
      is_restricted: true,
      is_ultra_restricted: true,
      ...overrides,
    });
  },

  /**
   * Create a deleted user
   */
  deleted(overrides?: Partial<User>): User {
    return userFixtures.regular({
      deleted: true,
      ...overrides,
    });
  },
};

/**
 * File fixtures
 */
export const fileFixtures = {
  /**
   * Create an image file
   */
  image(overrides?: Partial<File>): File {
    return {
      id: randomId('F'),
      name: 'image.png',
      title: 'Test Image',
      mimetype: 'image/png',
      filetype: 'png',
      pretty_type: 'PNG',
      user: randomId('U') as UserId,
      size: 12345,
      url_private: 'https://files.slack.com/files/image.png',
      thumb_64: 'https://files.slack.com/files/image_64.png',
      thumb_80: 'https://files.slack.com/files/image_80.png',
      thumb_360: 'https://files.slack.com/files/image_360.png',
      created: Math.floor(Date.now() / 1000),
      ...overrides,
    };
  },

  /**
   * Create a document file
   */
  document(overrides?: Partial<File>): File {
    return {
      id: randomId('F'),
      name: 'document.pdf',
      title: 'Test Document',
      mimetype: 'application/pdf',
      filetype: 'pdf',
      pretty_type: 'PDF',
      user: randomId('U') as UserId,
      size: 54321,
      url_private: 'https://files.slack.com/files/document.pdf',
      created: Math.floor(Date.now() / 1000),
      ...overrides,
    };
  },

  /**
   * Create a snippet file
   */
  snippet(overrides?: Partial<File>): File {
    return {
      id: randomId('F'),
      name: 'snippet.ts',
      title: 'Code Snippet',
      mimetype: 'text/plain',
      filetype: 'typescript',
      pretty_type: 'TypeScript',
      user: randomId('U') as UserId,
      mode: 'snippet',
      editable: true,
      size: 1234,
      url_private: 'https://files.slack.com/files/snippet.ts',
      created: Math.floor(Date.now() / 1000),
      ...overrides,
    };
  },
};

/**
 * Presence fixtures
 */
export const presenceFixtures = {
  /**
   * Create active presence
   */
  active(): UserPresence {
    return {
      presence: 'active',
      online: true,
      auto_away: false,
      manual_away: false,
      connection_count: 1,
      last_activity: Math.floor(Date.now() / 1000),
    };
  },

  /**
   * Create away presence
   */
  away(): UserPresence {
    return {
      presence: 'away',
      online: false,
      auto_away: true,
      manual_away: false,
      connection_count: 0,
      last_activity: Math.floor(Date.now() / 1000) - 3600,
    };
  },
};

/**
 * DND fixtures
 */
export const dndFixtures = {
  /**
   * Create enabled DND status
   */
  enabled(): DndStatus {
    const now = Math.floor(Date.now() / 1000);
    return {
      dnd_enabled: true,
      next_dnd_start_ts: now + 3600,
      next_dnd_end_ts: now + 7200,
      snooze_enabled: false,
    };
  },

  /**
   * Create disabled DND status
   */
  disabled(): DndStatus {
    return {
      dnd_enabled: false,
      snooze_enabled: false,
    };
  },

  /**
   * Create snoozing DND status
   */
  snoozing(minutes = 30): DndStatus {
    const now = Math.floor(Date.now() / 1000);
    return {
      dnd_enabled: true,
      snooze_enabled: true,
      snooze_endtime: now + minutes * 60,
      snooze_remaining: minutes * 60,
    };
  },
};

/**
 * API response fixtures
 */
export const responseFixtures = {
  /**
   * Create success response
   */
  success<T>(data: T): { ok: true } & T {
    return { ok: true, ...data };
  },

  /**
   * Create error response
   */
  error(errorCode: string): { ok: false; error: string } {
    return { ok: false, error: errorCode };
  },

  /**
   * Create rate limit response
   */
  rateLimited(retryAfter = 60): { ok: false; error: string; headers: Record<string, string> } {
    return {
      ok: false,
      error: 'rate_limited',
      headers: { 'retry-after': String(retryAfter) },
    };
  },
};

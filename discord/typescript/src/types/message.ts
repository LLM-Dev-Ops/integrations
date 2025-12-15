/**
 * Discord Message types and related structures.
 */

import { Snowflake } from './snowflake.js';
import { ActionRow } from './component.js';

/**
 * Discord user object.
 */
export interface User {
  /** User's unique ID */
  id: Snowflake;
  /** User's username */
  username: string;
  /** User's discriminator (legacy, may be "0" for new usernames) */
  discriminator: string;
  /** User's global display name */
  global_name?: string | null;
  /** User's avatar hash */
  avatar?: string | null;
  /** Whether the user is a bot */
  bot?: boolean;
  /** Whether the user is a system user */
  system?: boolean;
}

/**
 * Message reference for replies and forwards.
 */
export interface MessageReference {
  /** ID of the referenced message */
  message_id?: Snowflake;
  /** ID of the channel containing the referenced message */
  channel_id?: Snowflake;
  /** ID of the guild containing the referenced message */
  guild_id?: Snowflake;
  /** Whether to fail if the referenced message doesn't exist */
  fail_if_not_exists?: boolean;
}

/**
 * Discord message object.
 */
export interface Message {
  /** Message ID */
  id: Snowflake;
  /** Channel ID the message was sent in */
  channel_id: Snowflake;
  /** Author of the message */
  author?: User;
  /** Message content */
  content: string;
  /** ISO8601 timestamp of when the message was sent */
  timestamp: string;
  /** ISO8601 timestamp of when the message was last edited */
  edited_timestamp?: string | null;
  /** Whether this was a TTS message */
  tts: boolean;
  /** Whether this message mentions everyone */
  mention_everyone: boolean;
  /** Embeds attached to the message */
  embeds: Embed[];
  /** Components attached to the message */
  components?: ActionRow[];
  /** Message reference for replies */
  message_reference?: MessageReference;
  /** Guild ID if the message is in a guild */
  guild_id?: Snowflake;
  /** Thread ID if the message is in a thread */
  thread?: {
    id: Snowflake;
    name: string;
  };
  /** Message flags */
  flags?: number;
  /** Webhook ID if sent by a webhook */
  webhook_id?: Snowflake;
}

/**
 * Embed footer structure.
 */
export interface EmbedFooter {
  /** Footer text */
  text: string;
  /** URL of footer icon */
  icon_url?: string;
  /** Proxied URL of footer icon */
  proxy_icon_url?: string;
}

/**
 * Embed media structure (image, thumbnail, video).
 */
export interface EmbedMedia {
  /** Source URL */
  url: string;
  /** Proxied URL */
  proxy_url?: string;
  /** Width in pixels */
  width?: number;
  /** Height in pixels */
  height?: number;
}

/**
 * Embed author structure.
 */
export interface EmbedAuthor {
  /** Author name */
  name: string;
  /** Author URL */
  url?: string;
  /** Author icon URL */
  icon_url?: string;
  /** Proxied author icon URL */
  proxy_icon_url?: string;
}

/**
 * Embed field structure.
 */
export interface EmbedField {
  /** Field name */
  name: string;
  /** Field value */
  value: string;
  /** Whether field should display inline */
  inline?: boolean;
}

/**
 * Discord embed structure.
 */
export interface Embed {
  /** Embed title */
  title?: string;
  /** Embed type (always "rich" for webhook embeds) */
  type?: 'rich' | 'image' | 'video' | 'gifv' | 'article' | 'link';
  /** Embed description */
  description?: string;
  /** Embed URL */
  url?: string;
  /** ISO8601 timestamp */
  timestamp?: string;
  /** Embed color (decimal RGB) */
  color?: number;
  /** Embed footer */
  footer?: EmbedFooter;
  /** Embed image */
  image?: EmbedMedia;
  /** Embed thumbnail */
  thumbnail?: EmbedMedia;
  /** Embed video */
  video?: EmbedMedia;
  /** Embed author */
  author?: EmbedAuthor;
  /** Embed fields */
  fields?: EmbedField[];
}

/**
 * Builder for creating Discord embeds.
 */
export class EmbedBuilder {
  private embed: Embed = {};

  /** Set the embed title */
  title(title: string): this {
    this.embed.title = title;
    return this;
  }

  /** Set the embed description */
  description(description: string): this {
    this.embed.description = description;
    return this;
  }

  /** Set the embed URL */
  url(url: string): this {
    this.embed.url = url;
    return this;
  }

  /** Set the embed color (accepts hex number like 0xFF0000) */
  color(color: number): this {
    this.embed.color = color;
    return this;
  }

  /** Set the embed timestamp */
  timestamp(timestamp?: Date | string): this {
    if (timestamp instanceof Date) {
      this.embed.timestamp = timestamp.toISOString();
    } else if (timestamp) {
      this.embed.timestamp = timestamp;
    } else {
      this.embed.timestamp = new Date().toISOString();
    }
    return this;
  }

  /** Set the embed footer */
  footer(text: string, iconUrl?: string): this {
    this.embed.footer = { text, icon_url: iconUrl };
    return this;
  }

  /** Set the embed image */
  image(url: string): this {
    this.embed.image = { url };
    return this;
  }

  /** Set the embed thumbnail */
  thumbnail(url: string): this {
    this.embed.thumbnail = { url };
    return this;
  }

  /** Set the embed author */
  author(name: string, url?: string, iconUrl?: string): this {
    this.embed.author = { name, url, icon_url: iconUrl };
    return this;
  }

  /** Add a field to the embed */
  addField(name: string, value: string, inline?: boolean): this {
    if (!this.embed.fields) {
      this.embed.fields = [];
    }
    this.embed.fields.push({ name, value, inline });
    return this;
  }

  /** Build the embed object */
  build(): Embed {
    return { ...this.embed };
  }
}

/**
 * Calculates the total character count of an embed.
 * Discord limits embeds to 6000 total characters.
 */
export function getEmbedCharacterCount(embed: Embed): number {
  let count = 0;
  if (embed.title) count += embed.title.length;
  if (embed.description) count += embed.description.length;
  if (embed.footer?.text) count += embed.footer.text.length;
  if (embed.author?.name) count += embed.author.name.length;
  if (embed.fields) {
    for (const field of embed.fields) {
      count += field.name.length + field.value.length;
    }
  }
  return count;
}

/** Maximum characters allowed in message content */
export const MAX_MESSAGE_CONTENT_LENGTH = 2000;

/** Maximum number of embeds per message */
export const MAX_EMBEDS_PER_MESSAGE = 10;

/** Maximum total characters across all embeds */
export const MAX_EMBED_TOTAL_CHARACTERS = 6000;

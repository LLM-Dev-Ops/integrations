/**
 * Core types for the SMTP client.
 */

import { SmtpError, SmtpErrorKind } from '../errors';

/**
 * Email address with optional display name.
 */
export interface Address {
  /** Display name (e.g., "John Doe"). */
  name?: string;
  /** Email address (e.g., "john@example.com"). */
  email: string;
}

/**
 * Creates an address from email only.
 */
export function createAddress(email: string): Address {
  validateEmail(email);
  return { email };
}

/**
 * Creates an address with display name.
 */
export function createAddressWithName(name: string, email: string): Address {
  validateEmail(email);
  return { name, email };
}

/**
 * Parses an address from a string (e.g., "John Doe <john@example.com>").
 */
export function parseAddress(s: string): Address {
  const trimmed = s.trim();

  // Check for "Name <email>" format
  const match = trimmed.match(/^(.+?)\s*<([^>]+)>$/);
  if (match) {
    const name = match[1]?.trim().replace(/^"|"$/g, '');
    const email = match[2]?.trim();
    if (email) {
      return createAddressWithName(name ?? '', email);
    }
  }

  // Plain email address
  return createAddress(trimmed);
}

/**
 * Validates an email address.
 */
function validateEmail(email: string): void {
  if (!email) {
    throw new SmtpError(SmtpErrorKind.InvalidFromAddress, 'Email address cannot be empty');
  }

  if (email.length > 254) {
    throw new SmtpError(
      SmtpErrorKind.InvalidFromAddress,
      'Email address too long (max 254 characters)'
    );
  }

  const atCount = (email.match(/@/g) || []).length;
  if (atCount !== 1) {
    throw new SmtpError(
      SmtpErrorKind.InvalidFromAddress,
      'Email address must contain exactly one @'
    );
  }

  const parts = email.split('@');
  const local = parts[0];
  const domain = parts[1];

  if (!local || local.length === 0 || local.length > 64) {
    throw new SmtpError(
      SmtpErrorKind.InvalidFromAddress,
      'Local part must be 1-64 characters'
    );
  }

  if (!domain || domain.length === 0) {
    throw new SmtpError(SmtpErrorKind.InvalidFromAddress, 'Domain cannot be empty');
  }
}

/**
 * Formats an address for SMTP MAIL FROM/RCPT TO commands.
 */
export function formatAddressForSmtp(address: Address): string {
  return `<${address.email}>`;
}

/**
 * Formats an address for email headers.
 */
export function formatAddressForHeader(address: Address): string {
  if (address.name) {
    // Quote name if it contains special characters
    if (/[^a-zA-Z0-9\s]/.test(address.name)) {
      return `"${address.name}" <${address.email}>`;
    }
    return `${address.name} <${address.email}>`;
  }
  return address.email;
}

/**
 * Content disposition for attachments.
 */
export enum ContentDisposition {
  /** Regular attachment. */
  Attachment = 'attachment',
  /** Inline content. */
  Inline = 'inline',
}

/**
 * File attachment.
 */
export interface Attachment {
  /** Filename. */
  filename: string;
  /** MIME content type. */
  contentType: string;
  /** Binary content. */
  data: Buffer;
  /** Content disposition. */
  disposition: ContentDisposition;
}

/**
 * Creates an attachment.
 */
export function createAttachment(
  filename: string,
  contentType: string,
  data: Buffer
): Attachment {
  return {
    filename,
    contentType,
    data,
    disposition: ContentDisposition.Attachment,
  };
}

/**
 * Creates an attachment with auto-detected content type.
 */
export function createAttachmentFromFile(filename: string, data: Buffer): Attachment {
  const contentType = guessContentType(filename);
  return createAttachment(filename, contentType, data);
}

/**
 * Guesses content type from filename.
 */
function guessContentType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  const types: Record<string, string> = {
    txt: 'text/plain',
    html: 'text/html',
    htm: 'text/html',
    css: 'text/css',
    js: 'application/javascript',
    json: 'application/json',
    xml: 'application/xml',
    pdf: 'application/pdf',
    zip: 'application/zip',
    tar: 'application/x-tar',
    gz: 'application/gzip',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    mp3: 'audio/mpeg',
    mp4: 'video/mp4',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  };

  return types[ext ?? ''] ?? 'application/octet-stream';
}

/**
 * Inline image for HTML emails.
 */
export interface InlineImage {
  /** Content ID (used in HTML src="cid:..."). */
  contentId: string;
  /** MIME content type. */
  contentType: string;
  /** Binary content. */
  data: Buffer;
}

/**
 * Creates an inline image.
 */
export function createInlineImage(
  contentId: string,
  contentType: string,
  data: Buffer
): InlineImage {
  return { contentId, contentType, data };
}

/**
 * Complete email message.
 */
export interface Email {
  /** Sender address. */
  from: Address;
  /** Primary recipients. */
  to: Address[];
  /** CC recipients. */
  cc: Address[];
  /** BCC recipients. */
  bcc: Address[];
  /** Reply-to address. */
  replyTo?: Address;
  /** Email subject. */
  subject: string;
  /** Plain text body. */
  text?: string;
  /** HTML body. */
  html?: string;
  /** File attachments. */
  attachments: Attachment[];
  /** Inline images. */
  inlineImages: InlineImage[];
  /** Additional headers. */
  headers: Record<string, string>;
  /** Message ID. */
  messageId?: string;
  /** In-Reply-To header. */
  inReplyTo?: string;
  /** References header. */
  references: string[];
}

/**
 * Options for building an email.
 */
export interface EmailOptions {
  from: string | Address;
  to?: string | Address | Array<string | Address>;
  cc?: string | Address | Array<string | Address>;
  bcc?: string | Address | Array<string | Address>;
  replyTo?: string | Address;
  subject?: string;
  text?: string;
  html?: string;
  attachments?: Attachment[];
  inlineImages?: InlineImage[];
  headers?: Record<string, string>;
  messageId?: string;
  inReplyTo?: string;
  references?: string[];
}

/**
 * Normalizes an address input.
 */
function normalizeAddress(input: string | Address): Address {
  if (typeof input === 'string') {
    return parseAddress(input);
  }
  return input;
}

/**
 * Normalizes address array input.
 */
function normalizeAddresses(
  input?: string | Address | Array<string | Address>
): Address[] {
  if (!input) {
    return [];
  }
  if (Array.isArray(input)) {
    return input.map(normalizeAddress);
  }
  return [normalizeAddress(input)];
}

/**
 * Creates an email from options.
 */
export function createEmail(options: EmailOptions): Email {
  const from = normalizeAddress(options.from);
  const to = normalizeAddresses(options.to);
  const cc = normalizeAddresses(options.cc);
  const bcc = normalizeAddresses(options.bcc);

  if (to.length === 0 && cc.length === 0 && bcc.length === 0) {
    throw new SmtpError(
      SmtpErrorKind.InvalidRecipientAddress,
      'At least one recipient is required'
    );
  }

  if (!options.text && !options.html) {
    throw new SmtpError(SmtpErrorKind.EncodingFailed, 'Email body is required (text or HTML)');
  }

  return {
    from,
    to,
    cc,
    bcc,
    replyTo: options.replyTo ? normalizeAddress(options.replyTo) : undefined,
    subject: options.subject ?? '',
    text: options.text,
    html: options.html,
    attachments: options.attachments ?? [],
    inlineImages: options.inlineImages ?? [],
    headers: options.headers ?? {},
    messageId: options.messageId,
    inReplyTo: options.inReplyTo,
    references: options.references ?? [],
  };
}

/**
 * Builder for Email messages.
 */
export class EmailBuilder {
  private options: Partial<EmailOptions> = {};

  /** Sets the sender address. */
  from(address: string | Address): this {
    this.options.from = address;
    return this;
  }

  /** Adds a primary recipient. */
  to(address: string | Address): this {
    const current = this.options.to;
    if (Array.isArray(current)) {
      current.push(address);
    } else if (current) {
      this.options.to = [current, address];
    } else {
      this.options.to = [address];
    }
    return this;
  }

  /** Adds a CC recipient. */
  cc(address: string | Address): this {
    const current = this.options.cc;
    if (Array.isArray(current)) {
      current.push(address);
    } else if (current) {
      this.options.cc = [current, address];
    } else {
      this.options.cc = [address];
    }
    return this;
  }

  /** Adds a BCC recipient. */
  bcc(address: string | Address): this {
    const current = this.options.bcc;
    if (Array.isArray(current)) {
      current.push(address);
    } else if (current) {
      this.options.bcc = [current, address];
    } else {
      this.options.bcc = [address];
    }
    return this;
  }

  /** Sets the reply-to address. */
  replyTo(address: string | Address): this {
    this.options.replyTo = address;
    return this;
  }

  /** Sets the subject. */
  subject(subject: string): this {
    this.options.subject = subject;
    return this;
  }

  /** Sets the plain text body. */
  text(text: string): this {
    this.options.text = text;
    return this;
  }

  /** Sets the HTML body. */
  html(html: string): this {
    this.options.html = html;
    return this;
  }

  /** Adds an attachment. */
  attachment(attachment: Attachment): this {
    this.options.attachments = this.options.attachments ?? [];
    this.options.attachments.push(attachment);
    return this;
  }

  /** Adds an inline image. */
  inlineImage(image: InlineImage): this {
    this.options.inlineImages = this.options.inlineImages ?? [];
    this.options.inlineImages.push(image);
    return this;
  }

  /** Adds a custom header. */
  header(name: string, value: string): this {
    this.options.headers = this.options.headers ?? {};
    this.options.headers[name] = value;
    return this;
  }

  /** Sets the message ID. */
  messageId(id: string): this {
    this.options.messageId = id;
    return this;
  }

  /** Sets the In-Reply-To header. */
  inReplyTo(id: string): this {
    this.options.inReplyTo = id;
    return this;
  }

  /** Adds a reference. */
  reference(id: string): this {
    this.options.references = this.options.references ?? [];
    this.options.references.push(id);
    return this;
  }

  /** Builds the email. */
  build(): Email {
    if (!this.options.from) {
      throw new SmtpError(SmtpErrorKind.InvalidFromAddress, 'From address is required');
    }
    return createEmail(this.options as EmailOptions);
  }
}

/**
 * Result of sending a single email.
 */
export interface SendResult {
  /** Client-generated message ID. */
  messageId: string;
  /** Server-assigned ID (if provided). */
  serverId?: string;
  /** Successfully accepted recipients. */
  accepted: Address[];
  /** Rejected recipients. */
  rejected: RejectedRecipient[];
  /** Server response message. */
  response: string;
  /** Send duration in milliseconds. */
  durationMs: number;
}

/**
 * Result of sending multiple emails.
 */
export interface BatchSendResult {
  /** Individual results. */
  results: Array<{ success: true; result: SendResult } | { success: false; error: Error }>;
  /** Total emails attempted. */
  total: number;
  /** Successfully sent count. */
  succeeded: number;
  /** Failed count. */
  failed: number;
  /** Total duration in milliseconds. */
  durationMs: number;
}

/**
 * A recipient that was rejected by the server.
 */
export interface RejectedRecipient {
  /** The rejected address. */
  address: Address;
  /** SMTP status code. */
  code: number;
  /** Error message from server. */
  message: string;
}

/**
 * Connection pool status.
 */
export interface PoolStatus {
  /** Total connections in pool. */
  total: number;
  /** Idle connections. */
  idle: number;
  /** In-use connections. */
  inUse: number;
  /** Pending connection requests. */
  pending: number;
  /** Maximum pool size. */
  maxSize: number;
}

/**
 * Information about an SMTP connection.
 */
export interface ConnectionInfo {
  /** Server hostname. */
  host: string;
  /** Server port. */
  port: number;
  /** TLS status. */
  tlsEnabled: boolean;
  /** TLS version if enabled. */
  tlsVersion?: string;
  /** Server capabilities. */
  capabilities: string[];
  /** Server banner message. */
  banner: string;
  /** Authenticated user. */
  authenticatedUser?: string;
}

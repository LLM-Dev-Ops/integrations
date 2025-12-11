/**
 * MIME encoding for email messages.
 */

import { randomBytes } from 'crypto';
import { Email, Address, Attachment, InlineImage, formatAddressForHeader } from '../types';

/**
 * Content transfer encoding types.
 */
export enum TransferEncoding {
  /** 7-bit ASCII (default). */
  SevenBit = '7bit',
  /** 8-bit data. */
  EightBit = '8bit',
  /** Base64 encoding. */
  Base64 = 'base64',
  /** Quoted-printable encoding. */
  QuotedPrintable = 'quoted-printable',
}

/**
 * Content type with parameters.
 */
export interface ContentType {
  /** Main type (e.g., "text"). */
  type: string;
  /** Subtype (e.g., "plain"). */
  subtype: string;
  /** Parameters (e.g., charset). */
  params: Record<string, string>;
}

/**
 * Creates a content type.
 */
export function createContentType(
  type: string,
  subtype: string,
  params: Record<string, string> = {}
): ContentType {
  return { type, subtype, params };
}

/**
 * Formats a content type for headers.
 */
export function formatContentType(ct: ContentType): string {
  let result = `${ct.type}/${ct.subtype}`;
  for (const [key, value] of Object.entries(ct.params)) {
    result += `; ${key}="${value}"`;
  }
  return result;
}

/**
 * Common content types.
 */
export const ContentTypes = {
  TEXT_PLAIN: createContentType('text', 'plain', { charset: 'utf-8' }),
  TEXT_HTML: createContentType('text', 'html', { charset: 'utf-8' }),
  MULTIPART_MIXED: createContentType('multipart', 'mixed'),
  MULTIPART_ALTERNATIVE: createContentType('multipart', 'alternative'),
  MULTIPART_RELATED: createContentType('multipart', 'related'),
  APPLICATION_OCTET_STREAM: createContentType('application', 'octet-stream'),
};

/**
 * Generates a unique boundary string for multipart messages.
 */
export function generateBoundary(): string {
  return `----=_Part_${randomBytes(16).toString('hex')}`;
}

/**
 * Generates a unique message ID.
 */
export function generateMessageId(domain?: string): string {
  const timestamp = Date.now().toString(36);
  const random = randomBytes(8).toString('hex');
  const host = domain ?? 'localhost';
  return `<${timestamp}.${random}@${host}>`;
}

/**
 * Encodes a string using quoted-printable.
 */
export function encodeQuotedPrintable(input: string): string {
  const bytes = Buffer.from(input, 'utf-8');
  const lines: string[] = [];
  let currentLine = '';

  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i]!;
    let encoded: string;

    // Check if byte needs encoding
    if (
      byte === 9 || // Tab
      byte === 32 || // Space (unless at end of line)
      (byte >= 33 && byte <= 60) || // Printable ASCII except =
      (byte >= 62 && byte <= 126) // Printable ASCII except =
    ) {
      encoded = String.fromCharCode(byte);
    } else {
      encoded = '=' + byte.toString(16).toUpperCase().padStart(2, '0');
    }

    // Check line length (76 chars max, accounting for soft line break)
    if (currentLine.length + encoded.length > 75) {
      lines.push(currentLine + '=');
      currentLine = encoded;
    } else {
      currentLine += encoded;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.join('\r\n');
}

/**
 * Encodes a string to base64 with line wrapping.
 */
export function encodeBase64(input: Buffer | string): string {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf-8');
  const base64 = buffer.toString('base64');

  // Wrap at 76 characters
  const lines: string[] = [];
  for (let i = 0; i < base64.length; i += 76) {
    lines.push(base64.substring(i, i + 76));
  }

  return lines.join('\r\n');
}

/**
 * Encodes a header value using RFC 2047.
 */
export function encodeHeaderValue(value: string): string {
  // Check if encoding is needed
  if (/^[\x20-\x7E]+$/.test(value)) {
    return value;
  }

  // Use base64 encoding for non-ASCII
  const encoded = Buffer.from(value, 'utf-8').toString('base64');
  return `=?utf-8?B?${encoded}?=`;
}

/**
 * Folds a header line at appropriate positions.
 */
export function foldHeader(name: string, value: string): string {
  const line = `${name}: ${value}`;
  if (line.length <= 78) {
    return line;
  }

  const parts: string[] = [];
  let current = `${name}: `;
  const words = value.split(/\s+/);

  for (const word of words) {
    if (current.length + word.length + 1 > 78) {
      parts.push(current);
      current = ' ' + word;
    } else {
      current += (current.endsWith(': ') ? '' : ' ') + word;
    }
  }

  if (current.trim()) {
    parts.push(current);
  }

  return parts.join('\r\n');
}

/**
 * MIME encoder for email messages.
 */
export class MimeEncoder {
  private readonly domain?: string;

  constructor(domain?: string) {
    this.domain = domain;
  }

  /**
   * Encodes an email to MIME format.
   */
  encode(email: Email): string {
    const parts: string[] = [];

    // Generate message ID if not set
    const messageId = email.messageId ?? generateMessageId(this.domain);

    // Add headers
    parts.push(this.encodeHeaders(email, messageId));

    // Add body
    parts.push('');
    parts.push(this.encodeBody(email));

    return parts.join('\r\n');
  }

  private encodeHeaders(email: Email, messageId: string): string {
    const headers: string[] = [];

    // Required headers
    headers.push(`Message-ID: ${messageId}`);
    headers.push(`Date: ${this.formatDate(new Date())}`);
    headers.push(`From: ${formatAddressForHeader(email.from)}`);

    // Recipients
    if (email.to.length > 0) {
      headers.push(`To: ${this.formatAddressList(email.to)}`);
    }
    if (email.cc.length > 0) {
      headers.push(`Cc: ${this.formatAddressList(email.cc)}`);
    }
    // BCC is not included in headers

    // Reply-To
    if (email.replyTo) {
      headers.push(`Reply-To: ${formatAddressForHeader(email.replyTo)}`);
    }

    // Subject
    headers.push(`Subject: ${encodeHeaderValue(email.subject)}`);

    // Threading headers
    if (email.inReplyTo) {
      headers.push(`In-Reply-To: ${email.inReplyTo}`);
    }
    if (email.references.length > 0) {
      headers.push(`References: ${email.references.join(' ')}`);
    }

    // MIME headers
    headers.push('MIME-Version: 1.0');

    // Custom headers
    for (const [name, value] of Object.entries(email.headers)) {
      headers.push(`${name}: ${encodeHeaderValue(value)}`);
    }

    return headers.join('\r\n');
  }

  private encodeBody(email: Email): string {
    const hasText = !!email.text;
    const hasHtml = !!email.html;
    const hasAttachments = email.attachments.length > 0;
    const hasInlineImages = email.inlineImages.length > 0;

    // Simple text-only email
    if (hasText && !hasHtml && !hasAttachments && !hasInlineImages) {
      return this.encodeTextPart(email.text!);
    }

    // Simple HTML-only email
    if (hasHtml && !hasText && !hasAttachments && !hasInlineImages) {
      return this.encodeHtmlPart(email.html!);
    }

    // Text and HTML without attachments
    if (hasText && hasHtml && !hasAttachments && !hasInlineImages) {
      return this.encodeAlternativePart(email.text!, email.html!);
    }

    // Complex multipart message
    return this.encodeMultipartMessage(email);
  }

  private encodeTextPart(text: string): string {
    const ct = ContentTypes.TEXT_PLAIN;
    const headers = [
      `Content-Type: ${formatContentType(ct)}`,
      `Content-Transfer-Encoding: ${TransferEncoding.QuotedPrintable}`,
    ];
    return headers.join('\r\n') + '\r\n\r\n' + encodeQuotedPrintable(text);
  }

  private encodeHtmlPart(html: string): string {
    const ct = ContentTypes.TEXT_HTML;
    const headers = [
      `Content-Type: ${formatContentType(ct)}`,
      `Content-Transfer-Encoding: ${TransferEncoding.QuotedPrintable}`,
    ];
    return headers.join('\r\n') + '\r\n\r\n' + encodeQuotedPrintable(html);
  }

  private encodeAlternativePart(text: string, html: string): string {
    const boundary = generateBoundary();
    const parts: string[] = [];

    parts.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    parts.push('');
    parts.push(`--${boundary}`);
    parts.push(this.encodeTextPart(text));
    parts.push(`--${boundary}`);
    parts.push(this.encodeHtmlPart(html));
    parts.push(`--${boundary}--`);

    return parts.join('\r\n');
  }

  private encodeMultipartMessage(email: Email): string {
    const boundary = generateBoundary();
    const parts: string[] = [];

    parts.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
    parts.push('');

    // Add text/html content
    parts.push(`--${boundary}`);
    if (email.text && email.html) {
      if (email.inlineImages.length > 0) {
        parts.push(this.encodeRelatedPart(email.html, email.inlineImages, email.text));
      } else {
        parts.push(this.encodeAlternativePart(email.text, email.html));
      }
    } else if (email.text) {
      parts.push(this.encodeTextPart(email.text));
    } else if (email.html) {
      if (email.inlineImages.length > 0) {
        parts.push(this.encodeRelatedPart(email.html, email.inlineImages));
      } else {
        parts.push(this.encodeHtmlPart(email.html));
      }
    }

    // Add attachments
    for (const attachment of email.attachments) {
      parts.push(`--${boundary}`);
      parts.push(this.encodeAttachment(attachment));
    }

    parts.push(`--${boundary}--`);
    return parts.join('\r\n');
  }

  private encodeRelatedPart(html: string, images: InlineImage[], text?: string): string {
    const boundary = generateBoundary();
    const parts: string[] = [];

    parts.push(`Content-Type: multipart/related; boundary="${boundary}"`);
    parts.push('');

    // Add HTML (or alternative)
    parts.push(`--${boundary}`);
    if (text) {
      parts.push(this.encodeAlternativePart(text, html));
    } else {
      parts.push(this.encodeHtmlPart(html));
    }

    // Add inline images
    for (const image of images) {
      parts.push(`--${boundary}`);
      parts.push(this.encodeInlineImage(image));
    }

    parts.push(`--${boundary}--`);
    return parts.join('\r\n');
  }

  private encodeAttachment(attachment: Attachment): string {
    const encodedFilename = encodeHeaderValue(attachment.filename);
    const headers = [
      `Content-Type: ${attachment.contentType}; name="${encodedFilename}"`,
      `Content-Transfer-Encoding: ${TransferEncoding.Base64}`,
      `Content-Disposition: ${attachment.disposition}; filename="${encodedFilename}"`,
    ];
    return headers.join('\r\n') + '\r\n\r\n' + encodeBase64(attachment.data);
  }

  private encodeInlineImage(image: InlineImage): string {
    const headers = [
      `Content-Type: ${image.contentType}`,
      `Content-Transfer-Encoding: ${TransferEncoding.Base64}`,
      `Content-ID: <${image.contentId}>`,
      'Content-Disposition: inline',
    ];
    return headers.join('\r\n') + '\r\n\r\n' + encodeBase64(image.data);
  }

  private formatAddressList(addresses: Address[]): string {
    return addresses.map(formatAddressForHeader).join(', ');
  }

  private formatDate(date: Date): string {
    // RFC 5322 date format
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];

    const day = days[date.getUTCDay()];
    const dateNum = date.getUTCDate().toString().padStart(2, '0');
    const month = months[date.getUTCMonth()];
    const year = date.getUTCFullYear();
    const hours = date.getUTCHours().toString().padStart(2, '0');
    const minutes = date.getUTCMinutes().toString().padStart(2, '0');
    const seconds = date.getUTCSeconds().toString().padStart(2, '0');

    return `${day}, ${dateNum} ${month} ${year} ${hours}:${minutes}:${seconds} +0000`;
  }
}

/**
 * Creates a MIME encoder.
 */
export function createMimeEncoder(domain?: string): MimeEncoder {
  return new MimeEncoder(domain);
}

/**
 * Dot-stuffs message content for DATA command.
 * Lines starting with a dot are escaped with an extra dot.
 */
export function dotStuff(content: string): string {
  return content.replace(/^\.+/gm, '.$&');
}

/**
 * Prepares message data for SMTP transmission.
 * Applies dot-stuffing and ensures proper line endings.
 */
export function prepareMessageData(content: string): string {
  // Ensure CRLF line endings
  let prepared = content.replace(/\r?\n/g, '\r\n');

  // Apply dot-stuffing
  prepared = dotStuff(prepared);

  // Ensure message ends with CRLF
  if (!prepared.endsWith('\r\n')) {
    prepared += '\r\n';
  }

  // Add terminating sequence
  prepared += '.\r\n';

  return prepared;
}

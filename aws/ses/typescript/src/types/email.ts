/**
 * AWS SES Email Types
 *
 * This module contains type definitions for email-related operations in AWS SES v2.
 */

/**
 * Represents an email address with optional display name.
 */
export interface EmailAddress {
  /** The email address */
  email: string;
  /** Optional display name for the email address */
  displayName?: string;
}

/**
 * Represents the destination for an email message.
 */
export interface Destination {
  /** List of recipients to place on the To: line of the message */
  toAddresses?: EmailAddress[];
  /** List of recipients to place on the CC: line of the message */
  ccAddresses?: EmailAddress[];
  /** List of recipients to place on the BCC: line of the message */
  bccAddresses?: EmailAddress[];
}

/**
 * Represents the content of an email message.
 */
export interface EmailContent {
  /** The subject line of the email */
  subject: Content;
  /** The plain text body of the email */
  text?: Content;
  /** The HTML body of the email */
  html?: Content;
  /** Template to use for the email */
  template?: Template;
}

/**
 * Represents content with data and optional character set.
 */
export interface Content {
  /** The content data */
  data: string;
  /** The character set of the content (default: UTF-8) */
  charset?: string;
}

/**
 * Represents an email template.
 */
export interface Template {
  /** The name of the template */
  templateName: string;
  /** JSON string of template data for variable substitution */
  templateData?: string;
  /** The ARN of the template */
  templateArn?: string;
}

/**
 * Represents a raw email message.
 */
export interface RawMessage {
  /** The raw email message data including headers */
  data: Uint8Array;
}

/**
 * Represents a single entry in a bulk email operation.
 */
export interface BulkEmailEntry {
  /** The destination for this email */
  destination: Destination;
  /** JSON string of replacement template data for this recipient */
  replacementTemplateData?: string;
  /** Replacement tags for this recipient */
  replacementTags?: MessageTag[];
  /** Replacement email content for this recipient */
  replacementEmailContent?: ReplacementEmailContent;
}

/**
 * Represents replacement email content for a bulk email entry.
 */
export interface ReplacementEmailContent {
  /** Replacement template for this recipient */
  replacementTemplate?: ReplacementTemplate;
}

/**
 * Represents a replacement template.
 */
export interface ReplacementTemplate {
  /** JSON string of replacement template data */
  replacementTemplateData?: string;
}

/**
 * Represents a message tag for categorization and filtering.
 */
export interface MessageTag {
  /** The name of the tag */
  name: string;
  /** The value of the tag */
  value: string;
}

/**
 * Represents an email attachment.
 */
export interface Attachment {
  /** The filename of the attachment */
  filename: string;
  /** The MIME content type of the attachment */
  contentType: string;
  /** The binary data of the attachment */
  data: Uint8Array;
  /** Optional Content-ID for referencing in HTML (for inline images) */
  contentId?: string;
  /** How the attachment should be displayed */
  disposition?: 'attachment' | 'inline';
}

/**
 * Represents the body of an email message.
 */
export interface Body {
  /** The plain text version of the message body */
  text?: Content;
  /** The HTML version of the message body */
  html?: Content;
}

/**
 * Represents a complete email message.
 */
export interface Message {
  /** The subject line of the email */
  subject: Content;
  /** The body of the email */
  body: Body;
}

/**
 * Represents bulk email status.
 */
export type BulkEmailStatus = 'SUCCESS' | 'MESSAGE_REJECTED' | 'MAIL_FROM_DOMAIN_NOT_VERIFIED' |
  'CONFIGURATION_SET_NOT_FOUND' | 'TEMPLATE_NOT_FOUND' | 'ACCOUNT_SUSPENDED' |
  'ACCOUNT_THROTTLED' | 'ACCOUNT_DAILY_QUOTA_EXCEEDED' | 'INVALID_SENDING_POOL_NAME' |
  'ACCOUNT_SENDING_PAUSED' | 'CONFIGURATION_SET_SENDING_PAUSED' | 'INVALID_PARAMETER' |
  'TRANSIENT_FAILURE' | 'FAILED';

/**
 * Represents the result of a bulk email send operation for a single recipient.
 */
export interface BulkEmailEntryResult {
  /** The status of the email send */
  status?: BulkEmailStatus;
  /** Error message if the send failed */
  error?: string;
  /** The unique message identifier */
  messageId?: string;
}

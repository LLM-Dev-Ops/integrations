/**
 * AWS SES Request Builders
 *
 * Fluent builder APIs for constructing SES requests.
 * Provides type-safe, ergonomic interfaces for building email requests.
 *
 * @module builders
 */

import { validationError } from "../error";
import { validateEmailAddress } from "../config";

/**
 * Email address with optional display name.
 *
 * @example
 * ```typescript
 * const addr: EmailAddress = {
 *   email: 'sender@example.com',
 *   name: 'John Doe'
 * };
 * ```
 */
export interface EmailAddress {
  /**
   * Email address.
   */
  email: string;

  /**
   * Display name (optional).
   */
  name?: string;
}

/**
 * Email attachment.
 */
export interface Attachment {
  /**
   * Filename for the attachment.
   */
  filename: string;

  /**
   * MIME content type.
   */
  contentType: string;

  /**
   * Attachment data.
   */
  data: Uint8Array;

  /**
   * Content disposition (default: 'attachment').
   */
  disposition?: "attachment" | "inline";

  /**
   * Content ID for inline attachments.
   */
  contentId?: string;
}

/**
 * Message tag for categorizing and filtering emails.
 */
export interface MessageTag {
  /**
   * Tag name.
   */
  name: string;

  /**
   * Tag value.
   */
  value: string;
}

/**
 * Send email request structure.
 */
export interface SendEmailRequest {
  /**
   * Sender email address.
   */
  from: EmailAddress;

  /**
   * Recipient email addresses.
   */
  to: EmailAddress[];

  /**
   * CC recipients (optional).
   */
  cc?: EmailAddress[];

  /**
   * BCC recipients (optional).
   */
  bcc?: EmailAddress[];

  /**
   * Reply-to addresses (optional).
   */
  replyTo?: EmailAddress[];

  /**
   * Email subject.
   */
  subject?: string;

  /**
   * Plain text body.
   */
  text?: string;

  /**
   * HTML body.
   */
  html?: string;

  /**
   * Template name (mutually exclusive with text/html).
   */
  templateName?: string;

  /**
   * Template data (used with templateName).
   */
  templateData?: Record<string, unknown>;

  /**
   * Email attachments.
   */
  attachments?: Attachment[];

  /**
   * Message tags.
   */
  tags?: MessageTag[];

  /**
   * Configuration set name.
   */
  configurationSet?: string;

  /**
   * Feedback forwarding email address.
   */
  feedbackForwardingEmail?: string;

  /**
   * Return path email address.
   */
  returnPath?: string;
}

/**
 * Send bulk email request structure.
 */
export interface SendBulkEmailRequest {
  /**
   * Default email content (used if not overridden per destination).
   */
  defaultContent: {
    subject?: string;
    text?: string;
    html?: string;
    templateName?: string;
  };

  /**
   * Bulk email destinations.
   */
  destinations: BulkEmailDestination[];

  /**
   * Sender email address.
   */
  from: EmailAddress;

  /**
   * Reply-to addresses (optional).
   */
  replyTo?: EmailAddress[];

  /**
   * Configuration set name.
   */
  configurationSet?: string;

  /**
   * Default tags (can be overridden per destination).
   */
  defaultTags?: MessageTag[];
}

/**
 * Bulk email destination.
 */
export interface BulkEmailDestination {
  /**
   * Recipient email addresses.
   */
  to: EmailAddress[];

  /**
   * Template data for this destination.
   */
  templateData?: Record<string, unknown>;

  /**
   * Tags for this destination.
   */
  tags?: MessageTag[];

  /**
   * Replacement subject (optional).
   */
  replacementSubject?: string;
}

/**
 * Email template structure.
 */
export interface EmailTemplate {
  /**
   * Template name.
   */
  name: string;

  /**
   * Subject part (can include template variables).
   */
  subject: string;

  /**
   * Text part (can include template variables).
   */
  text?: string;

  /**
   * HTML part (can include template variables).
   */
  html?: string;
}

/**
 * Format an email address with optional display name.
 *
 * @param address - Email address or string
 * @returns Formatted email address
 */
export function formatEmailAddress(address: string | EmailAddress): string {
  if (typeof address === "string") {
    validateEmailAddress(address);
    return address;
  }

  validateEmailAddress(address.email);

  if (address.name) {
    // Escape quotes in name
    const escapedName = address.name.replace(/"/g, '\\"');
    return `"${escapedName}" <${address.email}>`;
  }

  return address.email;
}

/**
 * Email builder for constructing send email requests.
 *
 * Provides a fluent API for building email requests with validation.
 *
 * @example
 * ```typescript
 * const request = new EmailBuilder()
 *   .from('sender@example.com')
 *   .to('recipient@example.com')
 *   .subject('Hello!')
 *   .text('This is a test email')
 *   .html('<p>This is a test email</p>')
 *   .tag('campaign', 'newsletter')
 *   .build();
 * ```
 */
export class EmailBuilder {
  private request: Partial<SendEmailRequest> = {};

  /**
   * Set the sender email address.
   *
   * @param email - Sender email or EmailAddress object
   * @returns This builder for chaining
   */
  from(email: string | EmailAddress): this {
    this.request.from =
      typeof email === "string" ? { email } : email;
    return this;
  }

  /**
   * Add a recipient email address.
   *
   * Can be called multiple times to add multiple recipients.
   *
   * @param email - Recipient email or EmailAddress object
   * @returns This builder for chaining
   */
  to(email: string | EmailAddress): this {
    const addr = typeof email === "string" ? { email } : email;
    this.request.to = [...(this.request.to || []), addr];
    return this;
  }

  /**
   * Add a CC recipient.
   *
   * @param email - CC email or EmailAddress object
   * @returns This builder for chaining
   */
  cc(email: string | EmailAddress): this {
    const addr = typeof email === "string" ? { email } : email;
    this.request.cc = [...(this.request.cc || []), addr];
    return this;
  }

  /**
   * Add a BCC recipient.
   *
   * @param email - BCC email or EmailAddress object
   * @returns This builder for chaining
   */
  bcc(email: string | EmailAddress): this {
    const addr = typeof email === "string" ? { email } : email;
    this.request.bcc = [...(this.request.bcc || []), addr];
    return this;
  }

  /**
   * Add a reply-to address.
   *
   * @param email - Reply-to email or EmailAddress object
   * @returns This builder for chaining
   */
  replyTo(email: string | EmailAddress): this {
    const addr = typeof email === "string" ? { email } : email;
    this.request.replyTo = [...(this.request.replyTo || []), addr];
    return this;
  }

  /**
   * Set the email subject.
   *
   * @param subject - Email subject
   * @returns This builder for chaining
   */
  subject(subject: string): this {
    this.request.subject = subject;
    return this;
  }

  /**
   * Set the plain text body.
   *
   * @param body - Plain text content
   * @returns This builder for chaining
   */
  text(body: string): this {
    this.request.text = body;
    return this;
  }

  /**
   * Set the HTML body.
   *
   * @param body - HTML content
   * @returns This builder for chaining
   */
  html(body: string): this {
    this.request.html = body;
    return this;
  }

  /**
   * Use a template instead of text/html body.
   *
   * @param name - Template name
   * @param data - Template data (optional)
   * @returns This builder for chaining
   */
  template(name: string, data?: Record<string, unknown>): this {
    this.request.templateName = name;
    this.request.templateData = data;
    return this;
  }

  /**
   * Add an attachment.
   *
   * @param filename - Attachment filename
   * @param contentType - MIME content type
   * @param data - Attachment data
   * @returns This builder for chaining
   */
  attachment(filename: string, contentType: string, data: Uint8Array): this {
    const attach: Attachment = { filename, contentType, data };
    this.request.attachments = [...(this.request.attachments || []), attach];
    return this;
  }

  /**
   * Add a message tag.
   *
   * @param name - Tag name
   * @param value - Tag value
   * @returns This builder for chaining
   */
  tag(name: string, value: string): this {
    const tag: MessageTag = { name, value };
    this.request.tags = [...(this.request.tags || []), tag];
    return this;
  }

  /**
   * Set the configuration set.
   *
   * @param name - Configuration set name
   * @returns This builder for chaining
   */
  configurationSet(name: string): this {
    this.request.configurationSet = name;
    return this;
  }

  /**
   * Set the return path email address.
   *
   * @param email - Return path email
   * @returns This builder for chaining
   */
  returnPath(email: string): this {
    this.request.returnPath = email;
    return this;
  }

  /**
   * Build the send email request.
   *
   * Validates the request and returns the complete structure.
   *
   * @returns Complete send email request
   * @throws {SesError} If validation fails
   */
  build(): SendEmailRequest {
    // Validate required fields
    if (!this.request.from) {
      throw validationError("Sender (from) is required");
    }

    if (!this.request.to || this.request.to.length === 0) {
      throw validationError("At least one recipient (to) is required");
    }

    // Validate content
    const hasTemplate = !!this.request.templateName;
    const hasContent = !!(this.request.text || this.request.html);

    if (!hasTemplate && !hasContent) {
      throw validationError("Email must have either template or text/html content");
    }

    if (hasTemplate && hasContent) {
      throw validationError("Email cannot have both template and text/html content");
    }

    if (!hasTemplate && !this.request.subject) {
      throw validationError("Subject is required when not using a template");
    }

    return this.request as SendEmailRequest;
  }
}

/**
 * Template builder for creating email templates.
 *
 * @example
 * ```typescript
 * const template = new TemplateBuilder()
 *   .name('welcome-email')
 *   .subject('Welcome {{name}}!')
 *   .text('Hello {{name}}, welcome to our service.')
 *   .html('<p>Hello {{name}}, welcome to our service.</p>')
 *   .build();
 * ```
 */
export class TemplateBuilder {
  private template: Partial<EmailTemplate> = {};

  /**
   * Set the template name.
   *
   * @param name - Template name (must be unique)
   * @returns This builder for chaining
   */
  name(name: string): this {
    this.template.name = name;
    return this;
  }

  /**
   * Set the subject template.
   *
   * @param subject - Subject with template variables
   * @returns This builder for chaining
   */
  subject(subject: string): this {
    this.template.subject = subject;
    return this;
  }

  /**
   * Set the text template.
   *
   * @param text - Text content with template variables
   * @returns This builder for chaining
   */
  text(text: string): this {
    this.template.text = text;
    return this;
  }

  /**
   * Set the HTML template.
   *
   * @param html - HTML content with template variables
   * @returns This builder for chaining
   */
  html(html: string): this {
    this.template.html = html;
    return this;
  }

  /**
   * Build the email template.
   *
   * @returns Complete email template
   * @throws {SesError} If validation fails
   */
  build(): EmailTemplate {
    if (!this.template.name) {
      throw validationError("Template name is required");
    }

    if (!this.template.subject) {
      throw validationError("Template subject is required");
    }

    if (!this.template.text && !this.template.html) {
      throw validationError("Template must have text or HTML content");
    }

    return this.template as EmailTemplate;
  }
}

/**
 * Bulk email builder for constructing bulk email requests.
 *
 * @example
 * ```typescript
 * const request = new BulkEmailBuilder()
 *   .from('sender@example.com')
 *   .template('newsletter')
 *   .destination(['user1@example.com'], { name: 'User 1' })
 *   .destination(['user2@example.com'], { name: 'User 2' })
 *   .build();
 * ```
 */
export class BulkEmailBuilder {
  private request: Partial<SendBulkEmailRequest> = {
    defaultContent: {},
    destinations: [],
  };

  /**
   * Set the sender email address.
   *
   * @param email - Sender email or EmailAddress object
   * @returns This builder for chaining
   */
  from(email: string | EmailAddress): this {
    this.request.from =
      typeof email === "string" ? { email } : email;
    return this;
  }

  /**
   * Set the default template name.
   *
   * @param name - Template name
   * @returns This builder for chaining
   */
  template(name: string): this {
    this.request.defaultContent!.templateName = name;
    return this;
  }

  /**
   * Set the default subject.
   *
   * @param subject - Default subject
   * @returns This builder for chaining
   */
  subject(subject: string): this {
    this.request.defaultContent!.subject = subject;
    return this;
  }

  /**
   * Set the default text content.
   *
   * @param text - Default text
   * @returns This builder for chaining
   */
  text(text: string): this {
    this.request.defaultContent!.text = text;
    return this;
  }

  /**
   * Set the default HTML content.
   *
   * @param html - Default HTML
   * @returns This builder for chaining
   */
  html(html: string): this {
    this.request.defaultContent!.html = html;
    return this;
  }

  /**
   * Add a bulk email destination.
   *
   * @param to - Recipient email addresses
   * @param templateData - Template data for this destination
   * @param tags - Tags for this destination
   * @returns This builder for chaining
   */
  destination(
    to: (string | EmailAddress)[],
    templateData?: Record<string, unknown>,
    tags?: MessageTag[]
  ): this {
    const dest: BulkEmailDestination = {
      to: to.map((email) => (typeof email === "string" ? { email } : email)),
      templateData,
      tags,
    };
    this.request.destinations!.push(dest);
    return this;
  }

  /**
   * Set the configuration set.
   *
   * @param name - Configuration set name
   * @returns This builder for chaining
   */
  configurationSet(name: string): this {
    this.request.configurationSet = name;
    return this;
  }

  /**
   * Add a default tag.
   *
   * @param name - Tag name
   * @param value - Tag value
   * @returns This builder for chaining
   */
  tag(name: string, value: string): this {
    const tag: MessageTag = { name, value };
    this.request.defaultTags = [...(this.request.defaultTags || []), tag];
    return this;
  }

  /**
   * Build the bulk email request.
   *
   * @returns Complete bulk email request
   * @throws {SesError} If validation fails
   */
  build(): SendBulkEmailRequest {
    if (!this.request.from) {
      throw validationError("Sender (from) is required");
    }

    if (!this.request.destinations || this.request.destinations.length === 0) {
      throw validationError("At least one destination is required");
    }

    return this.request as SendBulkEmailRequest;
  }
}

/**
 * Create an email builder.
 *
 * @returns New email builder instance
 */
export function emailBuilder(): EmailBuilder {
  return new EmailBuilder();
}

/**
 * Create a template builder.
 *
 * @returns New template builder instance
 */
export function templateBuilder(): TemplateBuilder {
  return new TemplateBuilder();
}

/**
 * Create a bulk email builder.
 *
 * @returns New bulk email builder instance
 */
export function bulkEmailBuilder(): BulkEmailBuilder {
  return new BulkEmailBuilder();
}

/**
 * Email Service
 *
 * Service for sending emails and bulk emails using AWS SES v2 API.
 *
 * @module services/emails
 */

import { BaseService } from './base.js';
import type {
  SendEmailRequest,
  SendBulkEmailRequest,
  SendRawEmailRequest,
} from '../types/requests.js';
import type {
  SendEmailResponse,
  SendBulkEmailResponse,
  SendRawEmailResponse,
} from '../types/responses.js';

/**
 * Email service for sending emails.
 *
 * Provides methods for:
 * - Sending individual emails
 * - Sending bulk emails
 * - Sending raw email messages
 *
 * @example
 * ```typescript
 * const emailService = new EmailService(client);
 *
 * // Send a simple email
 * const result = await emailService.sendEmail({
 *   fromEmailAddress: 'sender@example.com',
 *   destination: {
 *     toAddresses: ['recipient@example.com']
 *   },
 *   content: {
 *     simple: {
 *       subject: { data: 'Hello' },
 *       body: { text: { data: 'World' } }
 *     }
 *   }
 * });
 *
 * console.log('Message ID:', result.messageId);
 * ```
 */
export class EmailService extends BaseService {
  /**
   * Send an email.
   *
   * Sends an email message using the SES v2 API. The email can include
   * simple content (subject/body) or use a template.
   *
   * @param request - Email send request
   * @returns Promise resolving to send response with message ID
   *
   * @throws {EmailError} If email is rejected or sender is not verified
   * @throws {ValidationError} If request parameters are invalid
   * @throws {ThrottlingError} If send rate limit is exceeded
   *
   * @example
   * ```typescript
   * const response = await emailService.sendEmail({
   *   fromEmailAddress: 'sender@example.com',
   *   destination: {
   *     toAddresses: ['user1@example.com', 'user2@example.com'],
   *     ccAddresses: ['manager@example.com']
   *   },
   *   content: {
   *     simple: {
   *       subject: {
   *         data: 'Important Update',
   *         charset: 'UTF-8'
   *       },
   *       body: {
   *         html: {
   *           data: '<h1>Hello</h1><p>This is an HTML email.</p>',
   *           charset: 'UTF-8'
   *         }
   *       }
   *     }
   *   },
   *   configurationSetName: 'my-config-set',
   *   emailTags: [
   *     { name: 'campaign', value: 'newsletter' }
   *   ]
   * });
   *
   * console.log('Sent! Message ID:', response.messageId);
   * ```
   */
  async sendEmail(request: SendEmailRequest): Promise<SendEmailResponse> {
    return this.post<SendEmailResponse>('/v2/email/outbound-emails', request);
  }

  /**
   * Send a raw email message.
   *
   * Sends a raw email message including headers and MIME structure.
   * Useful for advanced scenarios requiring full control over the email format.
   *
   * @param request - Raw email send request
   * @returns Promise resolving to send response with message ID
   *
   * @throws {EmailError} If email is rejected or sender is not verified
   * @throws {ValidationError} If request parameters are invalid
   *
   * @example
   * ```typescript
   * const rawMessage = `From: sender@example.com
   * To: recipient@example.com
   * Subject: Test Email
   * MIME-Version: 1.0
   * Content-Type: text/plain; charset=UTF-8
   *
   * This is the email body.`;
   *
   * const response = await emailService.sendRawEmail({
   *   fromEmailAddress: 'sender@example.com',
   *   destinations: ['recipient@example.com'],
   *   rawMessage: {
   *     data: Buffer.from(rawMessage).toString('base64')
   *   }
   * });
   * ```
   */
  async sendRawEmail(request: SendRawEmailRequest): Promise<SendRawEmailResponse> {
    return this.post<SendRawEmailResponse>('/v2/email/outbound-emails', request);
  }

  /**
   * Send bulk emails.
   *
   * Sends multiple emails in a single API call. Each recipient can receive
   * personalized content using template variables.
   *
   * This is more efficient than calling sendEmail multiple times when sending
   * to many recipients.
   *
   * @param request - Bulk email send request
   * @returns Promise resolving to bulk send response with results for each recipient
   *
   * @throws {EmailError} If sender is not verified
   * @throws {ValidationError} If request parameters are invalid
   * @throws {ThrottlingError} If send rate limit is exceeded
   *
   * @example
   * ```typescript
   * const response = await emailService.sendBulkEmail({
   *   fromEmailAddress: 'sender@example.com',
   *   defaultContent: {
   *     template: {
   *       templateName: 'welcome-email',
   *       templateData: JSON.stringify({ companyName: 'Acme Corp' })
   *     }
   *   },
   *   bulkEmailEntries: [
   *     {
   *       destination: { toAddresses: ['user1@example.com'] },
   *       replacementEmailContent: {
   *         replacementTemplate: {
   *           replacementTemplateData: JSON.stringify({
   *             name: 'Alice',
   *             companyName: 'Acme Corp'
   *           })
   *         }
   *       }
   *     },
   *     {
   *       destination: { toAddresses: ['user2@example.com'] },
   *       replacementEmailContent: {
   *         replacementTemplate: {
   *           replacementTemplateData: JSON.stringify({
   *             name: 'Bob',
   *             companyName: 'Acme Corp'
   *           })
   *         }
   *       }
   *     }
   *   ]
   * });
   *
   * // Check results
   * response.bulkEmailEntryResults.forEach((result, index) => {
   *   if (result.status === 'SUCCESS') {
   *     console.log(`Email ${index + 1} sent:`, result.messageId);
   *   } else {
   *     console.error(`Email ${index + 1} failed:`, result.error);
   *   }
   * });
   * ```
   */
  async sendBulkEmail(request: SendBulkEmailRequest): Promise<SendBulkEmailResponse> {
    return this.post<SendBulkEmailResponse>('/v2/email/outbound-bulk-emails', request);
  }
}

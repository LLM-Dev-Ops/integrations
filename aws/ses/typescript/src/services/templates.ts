/**
 * Template Service
 *
 * Service for managing email templates in AWS SES v2.
 *
 * @module services/templates
 */

import { BaseService } from './base.js';
import type {
  CreateEmailTemplateRequest,
  UpdateEmailTemplateRequest,
  DeleteEmailTemplateRequest,
  GetEmailTemplateRequest,
  ListEmailTemplatesRequest,
  TestRenderEmailTemplateRequest,
} from '../types/requests.js';
import type {
  CreateEmailTemplateResponse,
  UpdateEmailTemplateResponse,
  DeleteEmailTemplateResponse,
  GetEmailTemplateResponse,
  ListEmailTemplatesResponse,
  TestRenderEmailTemplateResponse,
} from '../types/responses.js';

/**
 * Template service for managing email templates.
 *
 * Provides methods for:
 * - Creating email templates
 * - Updating email templates
 * - Deleting email templates
 * - Retrieving template details
 * - Listing all templates
 * - Testing template rendering
 *
 * @example
 * ```typescript
 * const templateService = new TemplateService(client);
 *
 * // Create a template
 * await templateService.createEmailTemplate({
 *   templateName: 'welcome-email',
 *   templateContent: {
 *     subject: 'Welcome {{name}}!',
 *     html: '<h1>Hello {{name}}</h1>',
 *     text: 'Hello {{name}}'
 *   }
 * });
 *
 * // Test rendering
 * const result = await templateService.testRenderEmailTemplate(
 *   'welcome-email',
 *   JSON.stringify({ name: 'Alice' })
 * );
 * console.log(result.renderedEmailTemplate);
 * ```
 */
export class TemplateService extends BaseService {
  /**
   * Create an email template.
   *
   * Creates a new email template that can be used for sending personalized emails.
   * Templates support variable substitution using {{variableName}} syntax.
   *
   * @param request - Template creation request
   * @returns Promise resolving when template is created
   *
   * @throws {TemplateError} If template already exists
   * @throws {ValidationError} If template content is invalid
   *
   * @example
   * ```typescript
   * await templateService.createEmailTemplate({
   *   templateName: 'newsletter',
   *   templateContent: {
   *     subject: '{{monthName}} Newsletter',
   *     html: `
   *       <html>
   *         <body>
   *           <h1>Hello {{firstName}}!</h1>
   *           <p>Here's your {{monthName}} newsletter.</p>
   *           <a href="{{unsubscribeUrl}}">Unsubscribe</a>
   *         </body>
   *       </html>
   *     `,
   *     text: 'Hello {{firstName}}! Newsletter for {{monthName}}.'
   *   }
   * });
   * ```
   */
  async createEmailTemplate(request: CreateEmailTemplateRequest): Promise<CreateEmailTemplateResponse> {
    return this.post<CreateEmailTemplateResponse>('/v2/email/templates', request);
  }

  /**
   * Delete an email template.
   *
   * Permanently deletes an email template. This operation cannot be undone.
   *
   * @param templateName - Name of the template to delete
   * @returns Promise resolving when template is deleted
   *
   * @throws {TemplateError} If template does not exist
   *
   * @example
   * ```typescript
   * await templateService.deleteEmailTemplate('old-template');
   * ```
   */
  async deleteEmailTemplate(templateName: string): Promise<void> {
    return this.delete(`/v2/email/templates/${encodeURIComponent(templateName)}`);
  }

  /**
   * Get email template details.
   *
   * Retrieves the content and metadata for an email template.
   *
   * @param templateName - Name of the template to retrieve
   * @returns Promise resolving to template details
   *
   * @throws {TemplateError} If template does not exist
   *
   * @example
   * ```typescript
   * const template = await templateService.getEmailTemplate('welcome-email');
   * console.log('Subject:', template.templateContent?.subject);
   * console.log('HTML:', template.templateContent?.html);
   * console.log('Text:', template.templateContent?.text);
   * ```
   */
  async getEmailTemplate(templateName: string): Promise<GetEmailTemplateResponse> {
    return this.get<GetEmailTemplateResponse>(
      `/v2/email/templates/${encodeURIComponent(templateName)}`
    );
  }

  /**
   * List email templates.
   *
   * Returns a list of all email templates in your account.
   * Results are paginated if there are many templates.
   *
   * @param nextToken - Token for pagination (from previous response)
   * @param pageSize - Maximum number of templates to return (1-100)
   * @returns Promise resolving to list of templates
   *
   * @example
   * ```typescript
   * // Get first page
   * let response = await templateService.listEmailTemplates();
   * console.log('Templates:', response.templatesMetadata);
   *
   * // Get next page if available
   * if (response.nextToken) {
   *   response = await templateService.listEmailTemplates(response.nextToken);
   * }
   * ```
   *
   * @example Iterate through all templates
   * ```typescript
   * let nextToken: string | undefined;
   * const allTemplates = [];
   *
   * do {
   *   const response = await templateService.listEmailTemplates(nextToken, 50);
   *   if (response.templatesMetadata) {
   *     allTemplates.push(...response.templatesMetadata);
   *   }
   *   nextToken = response.nextToken;
   * } while (nextToken);
   *
   * console.log(`Total templates: ${allTemplates.length}`);
   * ```
   */
  async listEmailTemplates(
    nextToken?: string,
    pageSize?: number
  ): Promise<ListEmailTemplatesResponse> {
    const query = this.buildQuery({
      NextToken: nextToken,
      PageSize: pageSize,
    });

    return this.get<ListEmailTemplatesResponse>('/v2/email/templates', query);
  }

  /**
   * Update an email template.
   *
   * Updates the content of an existing email template.
   * All template content fields are optional - only provided fields will be updated.
   *
   * @param request - Template update request
   * @returns Promise resolving when template is updated
   *
   * @throws {TemplateError} If template does not exist
   * @throws {ValidationError} If template content is invalid
   *
   * @example
   * ```typescript
   * // Update only the subject line
   * await templateService.updateEmailTemplate({
   *   templateName: 'welcome-email',
   *   templateContent: {
   *     subject: 'Welcome to {{companyName}}!'
   *   }
   * });
   *
   * // Update all content
   * await templateService.updateEmailTemplate({
   *   templateName: 'newsletter',
   *   templateContent: {
   *     subject: '{{monthName}} Update',
   *     html: '<h1>{{monthName}} Newsletter</h1><p>{{content}}</p>',
   *     text: '{{monthName}} Newsletter: {{content}}'
   *   }
   * });
   * ```
   */
  async updateEmailTemplate(request: UpdateEmailTemplateRequest): Promise<UpdateEmailTemplateResponse> {
    return this.put<UpdateEmailTemplateResponse>(
      `/v2/email/templates/${encodeURIComponent(request.templateName)}`,
      { templateContent: request.templateContent }
    );
  }

  /**
   * Test render an email template.
   *
   * Renders an email template with the provided data to preview how it will look.
   * This is useful for testing templates before sending them to recipients.
   *
   * @param templateName - Name of the template to render
   * @param templateData - JSON string containing template variable values
   * @returns Promise resolving to rendered email content
   *
   * @throws {TemplateError} If template does not exist or is invalid
   * @throws {ValidationError} If template data is invalid JSON
   *
   * @example
   * ```typescript
   * const result = await templateService.testRenderEmailTemplate(
   *   'welcome-email',
   *   JSON.stringify({
   *     name: 'Alice',
   *     companyName: 'Acme Corp',
   *     loginUrl: 'https://app.example.com/login'
   *   })
   * );
   *
   * console.log('Subject:', result.subject);
   * console.log('HTML:', result.htmlPart);
   * console.log('Text:', result.textPart);
   * ```
   *
   * @example Testing with different data sets
   * ```typescript
   * const testCases = [
   *   { name: 'Short Name', companyName: 'A' },
   *   { name: 'Long Name With Many Words', companyName: 'Very Long Company Name Inc.' },
   *   { name: 'Special &lt;chars&gt;', companyName: 'Test & Co.' }
   * ];
   *
   * for (const data of testCases) {
   *   const result = await templateService.testRenderEmailTemplate(
   *     'welcome-email',
   *     JSON.stringify(data)
   *   );
   *   console.log('Test case:', data.name);
   *   console.log('Rendered subject:', result.subject);
   * }
   * ```
   */
  async testRenderEmailTemplate(
    templateName: string,
    templateData: string
  ): Promise<TestRenderEmailTemplateResponse> {
    return this.post<TestRenderEmailTemplateResponse>(
      `/v2/email/templates/${encodeURIComponent(templateName)}/render`,
      { templateData }
    );
  }
}

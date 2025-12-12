/**
 * AWS SES Integration Module
 *
 * Production-ready, type-safe interface for interacting with Amazon Simple Email Service (SES).
 *
 * ## Features
 *
 * - **Full SES API Coverage**: Email sending, templates, identities, configuration sets
 * - **AWS Signature V4**: Complete signing implementation for authenticated requests
 * - **Type-Safe Builders**: Fluent APIs for constructing email requests
 * - **Credential Management**: Multiple credential providers with automatic chaining
 * - **Error Handling**: Comprehensive error types with retryability information
 * - **Rate Limiting**: Built-in support for staying within AWS limits
 * - **Template Support**: Full support for email templates with variable substitution
 * - **Bulk Sending**: Efficient bulk email operations
 *
 * ## Quick Start
 *
 * ### Send a Simple Email
 *
 * ```typescript
 * import { SesClient } from '@integrations/aws-ses';
 *
 * const client = await SesClient.fromEnv();
 *
 * const response = await client.sendEmail({
 *   from: { email: 'sender@example.com', name: 'Sender Name' },
 *   to: [{ email: 'recipient@example.com' }],
 *   subject: 'Hello from SES!',
 *   text: 'This is a plain text email',
 *   html: '<p>This is an <strong>HTML</strong> email</p>'
 * });
 *
 * console.log('Message ID:', response.messageId);
 * ```
 *
 * ### Using the Builder Pattern
 *
 * ```typescript
 * import { EmailBuilder, SesClient } from '@integrations/aws-ses';
 *
 * const client = await SesClient.builder()
 *   .region('us-east-1')
 *   .credentials('AKIAIOSFODNN7EXAMPLE', 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY')
 *   .timeout(60000)
 *   .build();
 *
 * const email = new EmailBuilder()
 *   .from('sender@example.com')
 *   .to('recipient@example.com')
 *   .subject('Hello!')
 *   .html('<p>Hello, World!</p>')
 *   .tag('campaign', 'welcome')
 *   .build();
 *
 * await client.sendEmail(email);
 * ```
 *
 * ### Working with Templates
 *
 * ```typescript
 * import { TemplateBuilder, SesClient } from '@integrations/aws-ses';
 *
 * const client = await SesClient.fromEnv();
 *
 * // Create a template
 * const template = new TemplateBuilder()
 *   .name('welcome-email')
 *   .subject('Welcome {{name}}!')
 *   .html('<p>Hello {{name}}, welcome to our service!</p>')
 *   .build();
 *
 * await client.templates.create(template);
 *
 * // Send using the template
 * await client.sendEmail({
 *   from: { email: 'sender@example.com' },
 *   to: [{ email: 'user@example.com' }],
 *   templateName: 'welcome-email',
 *   templateData: { name: 'John Doe' }
 * });
 * ```
 *
 * ### Bulk Email Sending
 *
 * ```typescript
 * import { BulkEmailBuilder, SesClient } from '@integrations/aws-ses';
 *
 * const client = await SesClient.fromEnv();
 *
 * const bulk = new BulkEmailBuilder()
 *   .from('sender@example.com')
 *   .template('newsletter')
 *   .destination(['user1@example.com'], { name: 'User 1', item: 'Widget' })
 *   .destination(['user2@example.com'], { name: 'User 2', item: 'Gadget' })
 *   .build();
 *
 * const response = await client.sendBulkEmail(bulk);
 * console.log('Sent:', response.results.length);
 * ```
 *
 * ## Architecture
 *
 * This module follows the SPARC hexagonal architecture:
 *
 * - **Specification**: Clear interfaces and types
 * - **Pseudocode**: Well-documented implementation intent
 * - **Architecture**: Ports and adapters pattern
 * - **Refinement**: Iterative improvement
 * - **Completion**: Production-ready code
 *
 * @module @integrations/aws-ses
 */

// ============================================================================
// Client
// ============================================================================

export {
  SesClient,
  SesClientBuilder,
  SendEmailResponse,
  SendBulkEmailResponse,
  BulkEmailResult,
  clientBuilder,
  createClient,
  createClientFromEnv,
} from "./client";

// ============================================================================
// Configuration
// ============================================================================

export {
  SesConfig,
  SesConfigBuilder,
  RetryConfig,
  RateLimitConfig,
  configBuilder,
  resolveEndpoint,
  buildUserAgent,
  validateEmailAddress,
  validateDomain,
} from "./config";

// ============================================================================
// Credentials
// ============================================================================

export type { AwsCredentials, CredentialProvider } from "./credentials/types";

export { StaticCredentialProvider } from "./credentials/static";
export { EnvironmentCredentialProvider } from "./credentials/environment";
export { ProfileCredentialProvider } from "./credentials/profile";
export { IMDSCredentialProvider } from "./credentials/imds";
export { ChainCredentialProvider, defaultProvider } from "./credentials/chain";
export { CachedCredentialProvider } from "./credentials/cache";

// ============================================================================
// Errors
// ============================================================================

export {
  SesError,
  SesErrorCode,
  mapAwsError,
  mapHttpError,
  configurationError,
  credentialError,
  signingError,
  validationError,
  transportError,
  timeoutError,
  wrapError,
} from "./error";

// ============================================================================
// Builders
// ============================================================================

export {
  // Types
  EmailAddress,
  Attachment,
  MessageTag,
  SendEmailRequest,
  SendBulkEmailRequest,
  BulkEmailDestination,
  EmailTemplate,

  // Builders
  EmailBuilder,
  TemplateBuilder,
  BulkEmailBuilder,

  // Functions
  emailBuilder,
  templateBuilder,
  bulkEmailBuilder,
  formatEmailAddress,
} from "./builders";

// ============================================================================
// HTTP Types
// ============================================================================

export type {
  HttpRequest,
  HttpResponse,
  HttpMethod,
  HttpClientConfig,
  AwsErrorResponse,
  PaginatedResponse,
} from "./http/types";

// ============================================================================
// Signing (Advanced Usage)
// ============================================================================

export type {
  SigningParams,
  SignedRequest,
  CanonicalRequest,
} from "./signing/types";

// Note: Service exports are intentionally not included here.
// Services are accessed through the SesClient instance using lazy-loading
// for better tree-shaking and reduced bundle size.
//
// Example:
//   const client = await SesClient.fromEnv();
//   await client.emails.send(...);
//   await client.templates.create(...);
//   await client.identities.verify(...);

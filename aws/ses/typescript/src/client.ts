/**
 * AWS SES Client
 *
 * High-level client for AWS Simple Email Service operations.
 * Provides service accessors and convenience methods following the
 * SPARC hexagonal architecture pattern.
 *
 * @module client
 */

import { SesConfig, SesConfigBuilder, configBuilder } from "./config";
import { defaultProvider } from "./credentials/chain";
import { SesError, configurationError } from "./error";
import {
  SendEmailRequest,
  SendBulkEmailRequest,
} from "./builders";

// Service imports (lazy-loaded)
type EmailService = any; // Will be imported lazily
type TemplateService = any;
type IdentityService = any;
type ConfigurationSetService = any;
type SuppressionService = any;
type DedicatedIpService = any;
type AccountService = any;

/**
 * Send email response.
 */
export interface SendEmailResponse {
  /**
   * Unique message ID assigned by SES.
   */
  messageId: string;

  /**
   * AWS request ID for tracking.
   */
  requestId?: string;
}

/**
 * Send bulk email response.
 */
export interface SendBulkEmailResponse {
  /**
   * Results for each destination.
   */
  results: BulkEmailResult[];

  /**
   * AWS request ID for tracking.
   */
  requestId?: string;
}

/**
 * Result for a single bulk email destination.
 */
export interface BulkEmailResult {
  /**
   * Message ID if successful.
   */
  messageId?: string;

  /**
   * Error if failed.
   */
  error?: {
    code: string;
    message: string;
  };

  /**
   * Status of the send operation.
   */
  status: "SUCCESS" | "ACCOUNT_SUSPENDED" | "CONFIGURATION_SET_NOT_FOUND" | "MESSAGE_REJECTED" | "MAIL_FROM_DOMAIN_NOT_VERIFIED" | "TEMPLATE_NOT_FOUND" | "FAILED";
}

/**
 * AWS SES Client.
 *
 * Main entry point for interacting with AWS SES.
 * Provides lazy-loaded service accessors and convenience methods.
 *
 * @example
 * ```typescript
 * // Create from environment
 * const client = await SesClient.fromEnv();
 *
 * // Send a simple email
 * const response = await client.sendEmail({
 *   from: { email: 'sender@example.com' },
 *   to: [{ email: 'recipient@example.com' }],
 *   subject: 'Hello!',
 *   text: 'This is a test email'
 * });
 *
 * console.log('Message ID:', response.messageId);
 * ```
 *
 * @example
 * ```typescript
 * // Create with builder
 * const client = await SesClient.builder()
 *   .region('us-east-1')
 *   .credentials('AKIAIOSFODNN7EXAMPLE', 'wJalrXUtn...')
 *   .build();
 *
 * // Access services
 * const templates = client.templates;
 * await templates.createTemplate({
 *   name: 'welcome',
 *   subject: 'Welcome {{name}}!',
 *   html: '<p>Hello {{name}}</p>'
 * });
 * ```
 */
export class SesClient {
  private _config: SesConfig;

  // Lazy-loaded services
  private _emailService?: EmailService;
  private _templateService?: TemplateService;
  private _identityService?: IdentityService;
  private _configurationSetService?: ConfigurationSetService;
  private _suppressionService?: SuppressionService;
  private _dedicatedIpService?: DedicatedIpService;
  private _accountService?: AccountService;

  /**
   * Create a new SES client.
   *
   * Use `SesClient.builder()` or `SesClient.fromEnv()` instead of
   * calling this constructor directly.
   *
   * @param config - SES configuration
   */
  constructor(config: SesConfig) {
    this._config = config;
  }

  /**
   * Get the client configuration.
   *
   * @returns SES configuration
   */
  getConfig(): SesConfig {
    return this._config;
  }

  /**
   * Email service for sending emails.
   *
   * Lazy-loaded on first access.
   *
   * @returns Email service instance
   *
   * @example
   * ```typescript
   * const response = await client.emails.send({
   *   from: { email: 'sender@example.com' },
   *   to: [{ email: 'recipient@example.com' }],
   *   subject: 'Test',
   *   text: 'Hello!'
   * });
   * ```
   */
  get emails(): EmailService {
    if (!this._emailService) {
      // Lazy-load email service
      const { EmailService } = require("./services/email");
      this._emailService = new EmailService(this._config);
    }
    return this._emailService;
  }

  /**
   * Template service for managing email templates.
   *
   * Lazy-loaded on first access.
   *
   * @returns Template service instance
   *
   * @example
   * ```typescript
   * await client.templates.create({
   *   name: 'welcome',
   *   subject: 'Welcome!',
   *   html: '<p>Hello {{name}}</p>'
   * });
   * ```
   */
  get templates(): TemplateService {
    if (!this._templateService) {
      const { TemplateService } = require("./services/templates");
      this._templateService = new TemplateService(this._config);
    }
    return this._templateService;
  }

  /**
   * Identity service for managing verified email addresses and domains.
   *
   * Lazy-loaded on first access.
   *
   * @returns Identity service instance
   *
   * @example
   * ```typescript
   * await client.identities.verifyEmail('user@example.com');
   * const identities = await client.identities.list();
   * ```
   */
  get identities(): IdentityService {
    if (!this._identityService) {
      const { IdentityService } = require("./services/identities");
      this._identityService = new IdentityService(this._config);
    }
    return this._identityService;
  }

  /**
   * Configuration set service for managing configuration sets.
   *
   * Lazy-loaded on first access.
   *
   * @returns Configuration set service instance
   *
   * @example
   * ```typescript
   * await client.configurationSets.create('my-config-set');
   * ```
   */
  get configurationSets(): ConfigurationSetService {
    if (!this._configurationSetService) {
      const { ConfigurationSetService } = require("./services/configuration-sets");
      this._configurationSetService = new ConfigurationSetService(this._config);
    }
    return this._configurationSetService;
  }

  /**
   * Suppression service for managing suppression lists.
   *
   * Lazy-loaded on first access.
   *
   * @returns Suppression service instance
   *
   * @example
   * ```typescript
   * await client.suppression.add('bounce@example.com', 'BOUNCE');
   * ```
   */
  get suppression(): SuppressionService {
    if (!this._suppressionService) {
      const { SuppressionService } = require("./services/suppression");
      this._suppressionService = new SuppressionService(this._config);
    }
    return this._suppressionService;
  }

  /**
   * Dedicated IP service for managing dedicated IP addresses.
   *
   * Lazy-loaded on first access.
   *
   * @returns Dedicated IP service instance
   *
   * @example
   * ```typescript
   * const ips = await client.dedicatedIps.list();
   * ```
   */
  get dedicatedIps(): DedicatedIpService {
    if (!this._dedicatedIpService) {
      const { DedicatedIpService } = require("./services/dedicated-ips");
      this._dedicatedIpService = new DedicatedIpService(this._config);
    }
    return this._dedicatedIpService;
  }

  /**
   * Account service for managing account-level settings.
   *
   * Lazy-loaded on first access.
   *
   * @returns Account service instance
   *
   * @example
   * ```typescript
   * const quota = await client.account.getSendQuota();
   * console.log('Daily quota:', quota.max24HourSend);
   * ```
   */
  get account(): AccountService {
    if (!this._accountService) {
      const { AccountService } = require("./services/account");
      this._accountService = new AccountService(this._config);
    }
    return this._accountService;
  }

  /**
   * Send an email.
   *
   * Convenience method that delegates to the email service.
   *
   * @param request - Send email request
   * @returns Send email response with message ID
   *
   * @example
   * ```typescript
   * const response = await client.sendEmail({
   *   from: { email: 'sender@example.com', name: 'Sender' },
   *   to: [{ email: 'recipient@example.com' }],
   *   subject: 'Hello!',
   *   text: 'This is a test email',
   *   html: '<p>This is a test email</p>'
   * });
   *
   * console.log('Sent:', response.messageId);
   * ```
   */
  async sendEmail(request: SendEmailRequest): Promise<SendEmailResponse> {
    return this.emails.send(request);
  }

  /**
   * Send bulk emails.
   *
   * Convenience method that delegates to the email service.
   *
   * @param request - Bulk email request
   * @returns Bulk email response with results per destination
   *
   * @example
   * ```typescript
   * const response = await client.sendBulkEmail({
   *   from: { email: 'sender@example.com' },
   *   defaultContent: { templateName: 'newsletter' },
   *   destinations: [
   *     { to: [{ email: 'user1@example.com' }], templateData: { name: 'User 1' } },
   *     { to: [{ email: 'user2@example.com' }], templateData: { name: 'User 2' } }
   *   ]
   * });
   *
   * console.log('Results:', response.results);
   * ```
   */
  async sendBulkEmail(request: SendBulkEmailRequest): Promise<SendBulkEmailResponse> {
    return this.emails.sendBulk(request);
  }

  /**
   * Create a new SES client builder.
   *
   * @returns New configuration builder
   *
   * @example
   * ```typescript
   * const client = await SesClient.builder()
   *   .region('us-east-1')
   *   .credentials('AKIAIOSFODNN7EXAMPLE', 'wJalrXUtn...')
   *   .timeout(60000)
   *   .build();
   * ```
   */
  static builder(): SesClientBuilder {
    return new SesClientBuilder();
  }

  /**
   * Create a client from environment variables.
   *
   * Reads configuration from:
   * - AWS_REGION or AWS_DEFAULT_REGION
   * - AWS_ENDPOINT_URL_SES or AWS_ENDPOINT_URL
   * - Credentials from default credential chain
   *
   * @returns New SES client instance
   *
   * @example
   * ```typescript
   * const client = await SesClient.fromEnv();
   * ```
   */
  static async fromEnv(): Promise<SesClient> {
    const configBuilder = new SesConfigBuilder()
      .fromEnv()
      .credentialsProvider(defaultProvider());

    const config = configBuilder.build();
    return new SesClient(config);
  }
}

/**
 * SES client builder.
 *
 * Provides a fluent API for constructing SES clients.
 * Delegates to SesConfigBuilder internally.
 */
export class SesClientBuilder {
  private configBuilder: SesConfigBuilder;

  /**
   * Create a new client builder.
   */
  constructor() {
    this.configBuilder = configBuilder();
  }

  /**
   * Set the AWS region.
   *
   * @param region - AWS region code
   * @returns This builder for chaining
   */
  region(region: string): this {
    this.configBuilder.region(region);
    return this;
  }

  /**
   * Set a custom endpoint URL.
   *
   * @param endpoint - Endpoint URL
   * @returns This builder for chaining
   */
  endpoint(endpoint: string): this {
    this.configBuilder.endpoint(endpoint);
    return this;
  }

  /**
   * Set static credentials.
   *
   * @param accessKey - AWS access key ID
   * @param secretKey - AWS secret access key
   * @param sessionToken - Optional session token
   * @returns This builder for chaining
   */
  credentials(accessKey: string, secretKey: string, sessionToken?: string): this {
    this.configBuilder.credentials(accessKey, secretKey, sessionToken);
    return this;
  }

  /**
   * Set a custom credentials provider.
   *
   * @param provider - Credentials provider
   * @returns This builder for chaining
   */
  credentialsProvider(provider: any): this {
    this.configBuilder.credentialsProvider(provider);
    return this;
  }

  /**
   * Set request timeout.
   *
   * @param ms - Timeout in milliseconds
   * @returns This builder for chaining
   */
  timeout(ms: number): this {
    this.configBuilder.timeout(ms);
    return this;
  }

  /**
   * Set maximum retry attempts.
   *
   * @param n - Maximum retries
   * @returns This builder for chaining
   */
  maxRetries(n: number): this {
    this.configBuilder.maxRetries(n);
    return this;
  }

  /**
   * Set rate limiting configuration.
   *
   * @param config - Rate limit config
   * @returns This builder for chaining
   */
  rateLimit(config: any): this {
    this.configBuilder.rateLimit(config);
    return this;
  }

  /**
   * Load configuration from environment.
   *
   * @returns This builder for chaining
   */
  fromEnv(): this {
    this.configBuilder.fromEnv();
    return this;
  }

  /**
   * Build the SES client.
   *
   * @returns New SES client instance
   */
  async build(): Promise<SesClient> {
    const config = this.configBuilder.build();
    return new SesClient(config);
  }
}

/**
 * Create a new SES client builder.
 *
 * @returns New client builder
 */
export function clientBuilder(): SesClientBuilder {
  return new SesClientBuilder();
}

/**
 * Create a SES client from environment variables.
 *
 * @returns New SES client instance
 */
export async function createClientFromEnv(): Promise<SesClient> {
  return SesClient.fromEnv();
}

/**
 * Create a SES client with explicit configuration.
 *
 * @param config - SES configuration
 * @returns New SES client instance
 */
export function createClient(config: SesConfig): SesClient {
  return new SesClient(config);
}

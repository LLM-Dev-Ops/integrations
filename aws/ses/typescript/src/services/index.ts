/**
 * SES Services Module
 *
 * Exports all service classes for AWS SES v2 API operations.
 * Each service encapsulates a specific area of SES functionality.
 *
 * @module services
 *
 * @example
 * ```typescript
 * import { SesHttpClient } from '../http/client';
 * import {
 *   EmailService,
 *   TemplateService,
 *   IdentityService,
 *   ConfigurationSetService,
 *   SuppressionService,
 *   AccountService
 * } from './services';
 *
 * // Create HTTP client
 * const client = new SesHttpClient(config, transport, credentials);
 *
 * // Create services
 * const emailService = new EmailService(client);
 * const templateService = new TemplateService(client);
 * const identityService = new IdentityService(client);
 * const configService = new ConfigurationSetService(client);
 * const suppressionService = new SuppressionService(client);
 * const accountService = new AccountService(client);
 *
 * // Use services
 * await emailService.sendEmail({ ... });
 * await templateService.createEmailTemplate({ ... });
 * await identityService.createEmailIdentity({ ... });
 * ```
 */

// Base service class
export { BaseService } from './base.js';

// Email operations
export { EmailService } from './emails.js';

// Template management
export { TemplateService } from './templates.js';

// Identity management (verified emails and domains)
export { IdentityService } from './identities.js';

// Configuration sets and event destinations
export { ConfigurationSetService } from './configuration-sets.js';

// Suppression list management
export { SuppressionService } from './suppression.js';

// Dedicated IP management
export {
  DedicatedIpService,
  type GetDedicatedIpResponse,
  type ListDedicatedIpsResponse,
  type GetDedicatedIpPoolResponse,
  type ListDedicatedIpPoolsResponse,
} from './dedicated-ips.js';

// Account settings and quotas
export { AccountService } from './account.js';

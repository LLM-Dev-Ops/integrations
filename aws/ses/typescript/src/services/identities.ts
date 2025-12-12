/**
 * Identity Service
 *
 * Service for managing email identities (verified email addresses and domains)
 * in AWS SES v2.
 *
 * @module services/identities
 */

import { BaseService } from './base.js';
import type {
  CreateEmailIdentityRequest,
  DeleteEmailIdentityRequest,
  GetEmailIdentityRequest,
  ListEmailIdentitiesRequest,
  PutEmailIdentityDkimAttributesRequest,
  PutEmailIdentityDkimSigningAttributesRequest,
  PutEmailIdentityFeedbackAttributesRequest,
  PutEmailIdentityMailFromAttributesRequest,
  PutEmailIdentityConfigurationSetAttributesRequest,
} from '../types/requests.js';
import type {
  CreateEmailIdentityResponse,
  DeleteEmailIdentityResponse,
  GetEmailIdentityResponse,
  ListEmailIdentitiesResponse,
  PutEmailIdentityDkimAttributesResponse,
  PutEmailIdentityDkimSigningAttributesResponse,
  PutEmailIdentityFeedbackAttributesResponse,
  PutEmailIdentityMailFromAttributesResponse,
  PutEmailIdentityConfigurationSetAttributesResponse,
} from '../types/responses.js';
import type { MailFromAttributes } from '../types/identity.js';

/**
 * Identity service for managing verified email addresses and domains.
 *
 * Provides methods for:
 * - Creating and verifying identities
 * - Deleting identities
 * - Retrieving identity details
 * - Listing all identities
 * - Managing DKIM signing
 * - Configuring MAIL FROM domain
 * - Managing feedback forwarding
 *
 * @example
 * ```typescript
 * const identityService = new IdentityService(client);
 *
 * // Verify a domain
 * const result = await identityService.createEmailIdentity({
 *   emailIdentity: 'example.com'
 * });
 *
 * // Check DKIM tokens for DNS verification
 * if (result.dkimAttributes?.tokens) {
 *   console.log('Add these CNAME records to your DNS:');
 *   result.dkimAttributes.tokens.forEach(token => {
 *     console.log(`${token}._domainkey.example.com`);
 *   });
 * }
 * ```
 */
export class IdentityService extends BaseService {
  /**
   * Create an email identity.
   *
   * Verifies an email address or domain for sending emails.
   * For domains, you'll receive DKIM tokens to add to your DNS records.
   *
   * @param request - Identity creation request
   * @returns Promise resolving to identity creation response with verification details
   *
   * @throws {IdentityError} If identity already exists
   * @throws {ValidationError} If email or domain format is invalid
   *
   * @example Verify an email address
   * ```typescript
   * const response = await identityService.createEmailIdentity({
   *   emailIdentity: 'sender@example.com'
   * });
   *
   * console.log('Identity type:', response.identityType);
   * // User will receive a verification email
   * ```
   *
   * @example Verify a domain with DKIM
   * ```typescript
   * const response = await identityService.createEmailIdentity({
   *   emailIdentity: 'example.com',
   *   dkimSigningAttributes: {
   *     nextSigningKeyLength: 'RSA_2048_BIT'
   *   }
   * });
   *
   * // Add these DNS records to verify the domain
   * if (response.dkimAttributes?.tokens) {
   *   response.dkimAttributes.tokens.forEach((token, index) => {
   *     console.log(`CNAME ${index + 1}:`);
   *     console.log(`  Name: ${token}._domainkey.example.com`);
   *     console.log(`  Value: ${token}.dkim.amazonses.com`);
   *   });
   * }
   * ```
   */
  async createEmailIdentity(request: CreateEmailIdentityRequest): Promise<CreateEmailIdentityResponse> {
    return this.post<CreateEmailIdentityResponse>('/v2/email/identities', request);
  }

  /**
   * Delete an email identity.
   *
   * Removes an email address or domain from your verified identities.
   * After deletion, you can no longer send emails from this identity.
   *
   * @param identityName - Email address or domain name to delete
   * @returns Promise resolving when identity is deleted
   *
   * @throws {IdentityError} If identity does not exist
   *
   * @example
   * ```typescript
   * await identityService.deleteEmailIdentity('old-domain.com');
   * // Identity is now removed and cannot be used for sending
   * ```
   */
  async deleteEmailIdentity(identityName: string): Promise<void> {
    return this.delete(`/v2/email/identities/${encodeURIComponent(identityName)}`);
  }

  /**
   * Get email identity details.
   *
   * Retrieves complete information about a verified identity including
   * verification status, DKIM configuration, and feedback settings.
   *
   * @param identityName - Email address or domain name
   * @returns Promise resolving to identity details
   *
   * @throws {IdentityError} If identity does not exist
   *
   * @example
   * ```typescript
   * const identity = await identityService.getEmailIdentity('example.com');
   *
   * console.log('Identity type:', identity.identityType);
   * console.log('Verified:', identity.verifiedForSendingStatus);
   * console.log('DKIM enabled:', identity.dkimAttributes?.signingEnabled);
   * console.log('DKIM status:', identity.dkimAttributes?.status);
   *
   * if (identity.mailFromAttributes) {
   *   console.log('MAIL FROM domain:', identity.mailFromAttributes.mailFromDomain);
   *   console.log('Status:', identity.mailFromAttributes.mailFromDomainStatus);
   * }
   * ```
   */
  async getEmailIdentity(identityName: string): Promise<GetEmailIdentityResponse> {
    return this.get<GetEmailIdentityResponse>(
      `/v2/email/identities/${encodeURIComponent(identityName)}`
    );
  }

  /**
   * List email identities.
   *
   * Returns a list of all verified email identities in your account.
   * Results are paginated if you have many identities.
   *
   * @param nextToken - Token for pagination (from previous response)
   * @param pageSize - Maximum number of identities to return (1-1000)
   * @returns Promise resolving to list of identities
   *
   * @example
   * ```typescript
   * const response = await identityService.listEmailIdentities();
   *
   * response.emailIdentities?.forEach(identity => {
   *   console.log(`${identity.identityName} (${identity.identityType})`);
   *   console.log(`  Verified: ${identity.verifiedForSendingStatus}`);
   *   console.log(`  Sending enabled: ${identity.sendingEnabled}`);
   * });
   * ```
   *
   * @example Paginate through all identities
   * ```typescript
   * let nextToken: string | undefined;
   * const allIdentities = [];
   *
   * do {
   *   const response = await identityService.listEmailIdentities(nextToken, 100);
   *   if (response.emailIdentities) {
   *     allIdentities.push(...response.emailIdentities);
   *   }
   *   nextToken = response.nextToken;
   * } while (nextToken);
   *
   * console.log(`Total identities: ${allIdentities.length}`);
   * ```
   */
  async listEmailIdentities(
    nextToken?: string,
    pageSize?: number
  ): Promise<ListEmailIdentitiesResponse> {
    const query = this.buildQuery({
      NextToken: nextToken,
      PageSize: pageSize,
    });

    return this.get<ListEmailIdentitiesResponse>('/v2/email/identities', query);
  }

  /**
   * Update DKIM signing attributes.
   *
   * Enables or disables DKIM signing for an identity.
   * DKIM (DomainKeys Identified Mail) helps prevent email spoofing.
   *
   * @param identityName - Email address or domain name
   * @param signingEnabled - Whether to enable DKIM signing
   * @returns Promise resolving when DKIM settings are updated
   *
   * @throws {IdentityError} If identity does not exist
   *
   * @example
   * ```typescript
   * // Enable DKIM signing
   * await identityService.putEmailIdentityDkimAttributes(
   *   'example.com',
   *   true
   * );
   * ```
   */
  async putEmailIdentityDkimAttributes(
    identityName: string,
    signingEnabled: boolean
  ): Promise<PutEmailIdentityDkimAttributesResponse> {
    return this.put<PutEmailIdentityDkimAttributesResponse>(
      `/v2/email/identities/${encodeURIComponent(identityName)}/dkim`,
      { signingEnabled }
    );
  }

  /**
   * Update MAIL FROM domain attributes.
   *
   * Configures a custom MAIL FROM domain for an identity.
   * This allows you to use your own domain in the "envelope from" address.
   *
   * @param identityName - Domain name (not email address)
   * @param attrs - MAIL FROM attributes configuration
   * @returns Promise resolving when MAIL FROM settings are updated
   *
   * @throws {IdentityError} If identity does not exist or is not a domain
   * @throws {ValidationError} If MAIL FROM domain is invalid
   *
   * @example
   * ```typescript
   * await identityService.putEmailIdentityMailFromAttributes(
   *   'example.com',
   *   {
   *     mailFromDomain: 'mail.example.com',
   *     behaviorOnMxFailure: 'USE_DEFAULT_VALUE'
   *   }
   * });
   *
   * // Add MX record to DNS:
   * // mail.example.com  MX  10  feedback-smtp.us-east-1.amazonses.com
   * ```
   */
  async putEmailIdentityMailFromAttributes(
    identityName: string,
    attrs: MailFromAttributes
  ): Promise<PutEmailIdentityMailFromAttributesResponse> {
    return this.put<PutEmailIdentityMailFromAttributesResponse>(
      `/v2/email/identities/${encodeURIComponent(identityName)}/mail-from`,
      attrs
    );
  }

  /**
   * Update feedback forwarding attributes.
   *
   * Configures whether bounce and complaint notifications are forwarded via email.
   * If disabled, you should configure SNS topics for notifications instead.
   *
   * @param identityName - Email address or domain name
   * @param enabled - Whether to enable email feedback forwarding
   * @returns Promise resolving when feedback settings are updated
   *
   * @throws {IdentityError} If identity does not exist
   *
   * @example
   * ```typescript
   * // Disable email feedback (use SNS instead)
   * await identityService.putEmailIdentityFeedbackAttributes(
   *   'example.com',
   *   false
   * );
   * ```
   */
  async putEmailIdentityFeedbackAttributes(
    identityName: string,
    enabled: boolean
  ): Promise<PutEmailIdentityFeedbackAttributesResponse> {
    return this.put<PutEmailIdentityFeedbackAttributesResponse>(
      `/v2/email/identities/${encodeURIComponent(identityName)}/feedback`,
      { emailForwardingEnabled: enabled }
    );
  }

  /**
   * Associate a configuration set with an identity.
   *
   * Links a configuration set to an identity. When you send emails from this
   * identity without specifying a configuration set, the associated one will be used.
   *
   * @param identityName - Email address or domain name
   * @param configurationSetName - Name of the configuration set (or undefined to remove)
   * @returns Promise resolving when configuration set is associated
   *
   * @throws {IdentityError} If identity does not exist
   * @throws {ValidationError} If configuration set does not exist
   *
   * @example
   * ```typescript
   * // Associate configuration set
   * await identityService.putEmailIdentityConfigurationSetAttributes(
   *   'example.com',
   *   'production-config'
   * );
   *
   * // Remove association
   * await identityService.putEmailIdentityConfigurationSetAttributes(
   *   'example.com',
   *   undefined
   * );
   * ```
   */
  async putEmailIdentityConfigurationSetAttributes(
    identityName: string,
    configurationSetName?: string
  ): Promise<PutEmailIdentityConfigurationSetAttributesResponse> {
    return this.put<PutEmailIdentityConfigurationSetAttributesResponse>(
      `/v2/email/identities/${encodeURIComponent(identityName)}/configuration-set`,
      { configurationSetName }
    );
  }
}

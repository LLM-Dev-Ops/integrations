/**
 * Account Service
 *
 * Service for managing account-level settings and quotas in AWS SES v2.
 *
 * @module services/account
 */

import { BaseService } from './base.js';
import type {
  GetAccountRequest,
  PutAccountDetailsRequest,
  PutAccountSuppressionAttributesRequest,
  GetAccountSuppressionAttributesRequest,
  PutAccountSendingAttributesRequest,
  PutAccountVdmAttributesRequest,
  GetAccountVdmAttributesRequest,
} from '../types/requests.js';
import type {
  GetAccountResponse,
  PutAccountDetailsResponse,
  PutAccountSuppressionAttributesResponse,
  GetAccountSuppressionAttributesResponse,
  PutAccountSendingAttributesResponse,
  PutAccountVdmAttributesResponse,
  GetAccountVdmAttributesResponse,
} from '../types/responses.js';

/**
 * Account service for managing SES account settings.
 *
 * Provides methods for:
 * - Retrieving account details and quotas
 * - Updating account information
 * - Managing account-level suppression settings
 * - Controlling sending enable/disable
 * - Managing Virtual Deliverability Manager (VDM) settings
 *
 * @example
 * ```typescript
 * const accountService = new AccountService(client);
 *
 * // Get account details
 * const account = await accountService.getAccount();
 * console.log('Production access:', account.productionAccessEnabled);
 * console.log('Daily send quota:', account.sendQuota?.max24HourSend);
 * console.log('Max send rate:', account.sendQuota?.maxSendRate);
 * console.log('Sent today:', account.sendQuota?.sentLast24Hours);
 *
 * // Check if in sandbox
 * if (!account.productionAccessEnabled) {
 *   console.log('Account is in sandbox mode');
 * }
 * ```
 */
export class AccountService extends BaseService {
  /**
   * Get account details.
   *
   * Retrieves information about your SES account including:
   * - Production access status
   * - Sending quotas (daily limit, rate limit, current usage)
   * - Sending status (enabled/paused)
   * - Account details (mail type, contact info, etc.)
   *
   * @returns Promise resolving to account details
   *
   * @example
   * ```typescript
   * const account = await accountService.getAccount();
   *
   * // Check sending quota
   * const quota = account.sendQuota;
   * if (quota) {
   *   console.log(`Daily quota: ${quota.sentLast24Hours}/${quota.max24HourSend}`);
   *   console.log(`Max send rate: ${quota.maxSendRate} emails/second`);
   *
   *   const remaining = quota.max24HourSend! - quota.sentLast24Hours!;
   *   console.log(`Remaining today: ${remaining} emails`);
   * }
   *
   * // Check production access
   * if (!account.productionAccessEnabled) {
   *   console.log('⚠️ Sandbox mode - can only send to verified addresses');
   * }
   *
   * // Check sending status
   * console.log('Sending enabled:', account.sendingEnabled);
   *
   * // View account details
   * if (account.details) {
   *   console.log('Mail type:', account.details.mailType);
   *   console.log('Website:', account.details.websiteURL);
   *   console.log('Use case:', account.details.useCaseDescription);
   * }
   * ```
   */
  async getAccount(): Promise<GetAccountResponse> {
    return this.get<GetAccountResponse>('/v2/email/account');
  }

  /**
   * Update account details.
   *
   * Updates information about your use case and business to help AWS
   * review your account for production access.
   *
   * @param request - Account details update request
   * @returns Promise resolving when account details are updated
   *
   * @example Request production access
   * ```typescript
   * await accountService.putAccountDetails({
   *   mailType: 'TRANSACTIONAL',
   *   websiteURL: 'https://example.com',
   *   contactLanguage: 'EN',
   *   useCaseDescription: `
   *     We send transactional emails including:
   *     - Order confirmations
   *     - Shipping notifications
   *     - Password reset emails
   *     Expected volume: 10,000 emails/day
   *   `,
   *   additionalContactEmailAddresses: [
   *     'admin@example.com',
   *     'support@example.com'
   *   ],
   *   productionAccessEnabled: true
   * });
   * ```
   *
   * @example Update for marketing emails
   * ```typescript
   * await accountService.putAccountDetails({
   *   mailType: 'MARKETING',
   *   websiteURL: 'https://example.com',
   *   contactLanguage: 'EN',
   *   useCaseDescription: `
   *     We send marketing newsletters to opted-in subscribers.
   *     - Weekly newsletter
   *     - Product announcements
   *     - All recipients have explicitly subscribed
   *     Expected volume: 50,000 emails/week
   *   `
   * });
   * ```
   */
  async putAccountDetails(request: PutAccountDetailsRequest): Promise<PutAccountDetailsResponse> {
    return this.put<PutAccountDetailsResponse>('/v2/email/account/details', request);
  }

  /**
   * Update account-level suppression settings.
   *
   * Configures which types of addresses are automatically added to the
   * account suppression list (bounces and/or complaints).
   *
   * @param suppressedReasons - Array of suppression reasons to enable
   * @returns Promise resolving when suppression settings are updated
   *
   * @example Enable both bounce and complaint suppression
   * ```typescript
   * await accountService.putAccountSuppressionAttributes(['BOUNCE', 'COMPLAINT']);
   * ```
   *
   * @example Only suppress bounces
   * ```typescript
   * await accountService.putAccountSuppressionAttributes(['BOUNCE']);
   * ```
   */
  async putAccountSuppressionAttributes(
    suppressedReasons: Array<'BOUNCE' | 'COMPLAINT'>
  ): Promise<PutAccountSuppressionAttributesResponse> {
    return this.put<PutAccountSuppressionAttributesResponse>(
      '/v2/email/account/suppression',
      { suppressedReasons }
    );
  }

  /**
   * Get account suppression settings.
   *
   * Retrieves the current account-level suppression configuration.
   *
   * @returns Promise resolving to suppression settings
   *
   * @example
   * ```typescript
   * const response = await accountService.getAccountSuppressionAttributes();
   *
   * console.log('Suppression enabled for:', response.suppressionAttributes?.suppressedReasons);
   * // Example output: ['BOUNCE', 'COMPLAINT']
   * ```
   */
  async getAccountSuppressionAttributes(): Promise<GetAccountSuppressionAttributesResponse> {
    return this.get<GetAccountSuppressionAttributesResponse>('/v2/email/account/suppression');
  }

  /**
   * Update account sending status.
   *
   * Enables or disables email sending for the entire account.
   * When disabled, no emails can be sent from any identity.
   *
   * @param sendingEnabled - Whether to enable sending
   * @returns Promise resolving when sending status is updated
   *
   * @example Pause all sending
   * ```typescript
   * // Temporarily pause all email sending
   * await accountService.putAccountSendingAttributes(false);
   *
   * console.log('All email sending is now paused');
   * ```
   *
   * @example Resume sending
   * ```typescript
   * // Resume email sending
   * await accountService.putAccountSendingAttributes(true);
   *
   * console.log('Email sending is now enabled');
   * ```
   */
  async putAccountSendingAttributes(sendingEnabled: boolean): Promise<PutAccountSendingAttributesResponse> {
    return this.put<PutAccountSendingAttributesResponse>(
      '/v2/email/account/sending',
      { sendingEnabled }
    );
  }

  /**
   * Update Virtual Deliverability Manager (VDM) settings.
   *
   * Configures VDM features including dashboard and engagement tracking.
   * VDM provides insights and recommendations to improve deliverability.
   *
   * @param request - VDM settings request
   * @returns Promise resolving when VDM settings are updated
   *
   * @example Enable VDM features
   * ```typescript
   * await accountService.putAccountVdmAttributes({
   *   vdmAttributes: {
   *     dashboardOptions: {
   *       engagementMetrics: 'ENABLED'
   *     },
   *     guardianOptions: {
   *       optimizedSharedDelivery: 'ENABLED'
   *     }
   *   }
   * });
   * ```
   *
   * @example Disable VDM
   * ```typescript
   * await accountService.putAccountVdmAttributes({
   *   vdmAttributes: {
   *     dashboardOptions: {
   *       engagementMetrics: 'DISABLED'
   *     },
   *     guardianOptions: {
   *       optimizedSharedDelivery: 'DISABLED'
   *     }
   *   }
   * });
   * ```
   */
  async putAccountVdmAttributes(request: PutAccountVdmAttributesRequest): Promise<PutAccountVdmAttributesResponse> {
    return this.put<PutAccountVdmAttributesResponse>('/v2/email/account/vdm', request);
  }

  /**
   * Get Virtual Deliverability Manager (VDM) settings.
   *
   * Retrieves the current VDM configuration for the account.
   *
   * @returns Promise resolving to VDM settings
   *
   * @example
   * ```typescript
   * const response = await accountService.getAccountVdmAttributes();
   *
   * const vdm = response.vdmAttributes;
   * console.log('Dashboard enabled:', vdm?.dashboardOptions?.engagementMetrics === 'ENABLED');
   * console.log('Guardian enabled:', vdm?.guardianOptions?.optimizedSharedDelivery === 'ENABLED');
   * ```
   */
  async getAccountVdmAttributes(): Promise<GetAccountVdmAttributesResponse> {
    return this.get<GetAccountVdmAttributesResponse>('/v2/email/account/vdm');
  }
}

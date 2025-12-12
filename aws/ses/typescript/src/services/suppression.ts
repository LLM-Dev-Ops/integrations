/**
 * Suppression Service
 *
 * Service for managing the account-level suppression list in AWS SES v2.
 * The suppression list prevents sending to addresses that have bounced or complained.
 *
 * @module services/suppression
 */

import { BaseService } from './base.js';
import type {
  PutSuppressedDestinationRequest,
  DeleteSuppressedDestinationRequest,
  GetSuppressedDestinationRequest,
  ListSuppressedDestinationsRequest,
} from '../types/requests.js';
import type {
  PutSuppressedDestinationResponse,
  DeleteSuppressedDestinationResponse,
  GetSuppressedDestinationResponse,
  ListSuppressedDestinationsResponse,
} from '../types/responses.js';

/**
 * Suppression service for managing suppressed email addresses.
 *
 * The suppression list automatically prevents emails from being sent to
 * addresses that have:
 * - Hard bounced (recipient address doesn't exist)
 * - Complained (marked email as spam)
 *
 * Provides methods for:
 * - Adding addresses to the suppression list
 * - Removing addresses from the suppression list
 * - Retrieving suppression details for an address
 * - Listing all suppressed addresses
 *
 * @example
 * ```typescript
 * const suppressionService = new SuppressionService(client);
 *
 * // Check if an address is suppressed
 * try {
 *   const result = await suppressionService.getSuppressedDestination(
 *     'bounced@example.com'
 *   );
 *   console.log('Suppression reason:', result.suppressedDestination?.reason);
 *   console.log('Last update:', result.suppressedDestination?.lastUpdateTime);
 * } catch (error) {
 *   console.log('Address is not suppressed');
 * }
 *
 * // Remove from suppression list to allow sending again
 * await suppressionService.deleteSuppressedDestination('bounced@example.com');
 * ```
 */
export class SuppressionService extends BaseService {
  /**
   * Add an email address to the suppression list.
   *
   * Manually adds an address to your account suppression list.
   * SES will not send emails to suppressed addresses.
   *
   * @param emailAddress - Email address to suppress
   * @param reason - Reason for suppression (BOUNCE or COMPLAINT)
   * @returns Promise resolving when address is added
   *
   * @throws {SuppressionError} If address is already suppressed
   * @throws {ValidationError} If email address is invalid
   *
   * @example
   * ```typescript
   * // Manually suppress an address that bounced
   * await suppressionService.putSuppressedDestination(
   *   'invalid@example.com',
   *   'BOUNCE'
   * );
   *
   * // Suppress an address that complained
   * await suppressionService.putSuppressedDestination(
   *   'complainer@example.com',
   *   'COMPLAINT'
   * );
   * ```
   */
  async putSuppressedDestination(
    emailAddress: string,
    reason: 'BOUNCE' | 'COMPLAINT'
  ): Promise<PutSuppressedDestinationResponse> {
    return this.put<PutSuppressedDestinationResponse>(
      `/v2/email/suppression/addresses/${encodeURIComponent(emailAddress)}`,
      { reason }
    );
  }

  /**
   * Remove an email address from the suppression list.
   *
   * Removes an address from your account suppression list, allowing
   * you to send emails to it again.
   *
   * Use this carefully - if an address bounced due to being invalid,
   * sending to it again will result in another bounce.
   *
   * @param emailAddress - Email address to remove from suppression list
   * @returns Promise resolving when address is removed
   *
   * @throws {SuppressionError} If address is not in the suppression list
   *
   * @example
   * ```typescript
   * // Remove a previously suppressed address
   * await suppressionService.deleteSuppressedDestination('user@example.com');
   *
   * // Now you can send to this address again
   * ```
   */
  async deleteSuppressedDestination(emailAddress: string): Promise<void> {
    return this.delete(`/v2/email/suppression/addresses/${encodeURIComponent(emailAddress)}`);
  }

  /**
   * Get suppression details for an email address.
   *
   * Retrieves information about why and when an address was suppressed.
   *
   * @param emailAddress - Email address to look up
   * @returns Promise resolving to suppression details
   *
   * @throws {SuppressionError} If address is not in the suppression list
   *
   * @example
   * ```typescript
   * const result = await suppressionService.getSuppressedDestination(
   *   'bounced@example.com'
   * );
   *
   * const destination = result.suppressedDestination;
   * console.log('Email:', destination?.emailAddress);
   * console.log('Reason:', destination?.reason);
   * console.log('Last update:', destination?.lastUpdateTime);
   *
   * if (destination?.attributes) {
   *   console.log('Message ID:', destination.attributes.messageId);
   *   console.log('Feedback ID:', destination.attributes.feedbackId);
   * }
   * ```
   */
  async getSuppressedDestination(emailAddress: string): Promise<GetSuppressedDestinationResponse> {
    return this.get<GetSuppressedDestinationResponse>(
      `/v2/email/suppression/addresses/${encodeURIComponent(emailAddress)}`
    );
  }

  /**
   * List suppressed email addresses.
   *
   * Returns a list of all suppressed addresses in your account.
   * You can filter by suppression reason and date range.
   *
   * @param options - List options including filters and pagination
   * @returns Promise resolving to list of suppressed addresses
   *
   * @example List all suppressed addresses
   * ```typescript
   * const response = await suppressionService.listSuppressedDestinations();
   *
   * response.suppressedDestinationSummaries?.forEach(dest => {
   *   console.log(`${dest.emailAddress} - ${dest.reason} (${dest.lastUpdateTime})`);
   * });
   * ```
   *
   * @example Filter by bounce reason
   * ```typescript
   * const response = await suppressionService.listSuppressedDestinations({
   *   reasons: ['BOUNCE']
   * });
   *
   * console.log(`Found ${response.suppressedDestinationSummaries?.length} bounced addresses`);
   * ```
   *
   * @example Filter by date range
   * ```typescript
   * const startDate = new Date('2024-01-01');
   * const endDate = new Date('2024-12-31');
   *
   * const response = await suppressionService.listSuppressedDestinations({
   *   startDate,
   *   endDate,
   *   reasons: ['COMPLAINT']
   * });
   *
   * console.log('Complaints in 2024:', response.suppressedDestinationSummaries?.length);
   * ```
   *
   * @example Paginate through all results
   * ```typescript
   * let nextToken: string | undefined;
   * const allSuppressed = [];
   *
   * do {
   *   const response = await suppressionService.listSuppressedDestinations({
   *     nextToken,
   *     pageSize: 100
   *   });
   *
   *   if (response.suppressedDestinationSummaries) {
   *     allSuppressed.push(...response.suppressedDestinationSummaries);
   *   }
   *
   *   nextToken = response.nextToken;
   * } while (nextToken);
   *
   * console.log(`Total suppressed: ${allSuppressed.length}`);
   * ```
   */
  async listSuppressedDestinations(options?: {
    reasons?: Array<'BOUNCE' | 'COMPLAINT'>;
    startDate?: Date;
    endDate?: Date;
    nextToken?: string;
    pageSize?: number;
  }): Promise<ListSuppressedDestinationsResponse> {
    const query = this.buildQuery({
      Reason: options?.reasons?.join(','),
      StartDate: options?.startDate?.toISOString(),
      EndDate: options?.endDate?.toISOString(),
      NextToken: options?.nextToken,
      PageSize: options?.pageSize,
    });

    return this.get<ListSuppressedDestinationsResponse>(
      '/v2/email/suppression/addresses',
      query
    );
  }
}

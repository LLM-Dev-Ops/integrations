/**
 * Configuration Set Service
 *
 * Service for managing configuration sets and event destinations in AWS SES v2.
 *
 * @module services/configuration-sets
 */

import { BaseService } from './base.js';
import type {
  CreateConfigurationSetRequest,
  DeleteConfigurationSetRequest,
  GetConfigurationSetRequest,
  ListConfigurationSetsRequest,
  PutConfigurationSetDeliveryOptionsRequest,
  PutConfigurationSetReputationOptionsRequest,
  PutConfigurationSetSendingOptionsRequest,
  PutConfigurationSetSuppressionOptionsRequest,
  PutConfigurationSetTrackingOptionsRequest,
  CreateConfigurationSetEventDestinationRequest,
  UpdateConfigurationSetEventDestinationRequest,
  DeleteConfigurationSetEventDestinationRequest,
  GetConfigurationSetEventDestinationsRequest,
} from '../types/requests.js';
import type {
  CreateConfigurationSetResponse,
  DeleteConfigurationSetResponse,
  GetConfigurationSetResponse,
  ListConfigurationSetsResponse,
  PutConfigurationSetDeliveryOptionsResponse,
  PutConfigurationSetReputationOptionsResponse,
  PutConfigurationSetSendingOptionsResponse,
  PutConfigurationSetSuppressionOptionsResponse,
  PutConfigurationSetTrackingOptionsResponse,
  CreateConfigurationSetEventDestinationResponse,
  UpdateConfigurationSetEventDestinationResponse,
  DeleteConfigurationSetEventDestinationResponse,
  GetConfigurationSetEventDestinationsResponse,
} from '../types/responses.js';

/**
 * Configuration set service for managing email sending settings.
 *
 * Configuration sets allow you to:
 * - Track email events (sends, opens, clicks, bounces, complaints)
 * - Control sending behavior and reputation monitoring
 * - Configure delivery options (TLS policy, dedicated IP pools)
 * - Manage suppression lists
 *
 * @example
 * ```typescript
 * const configService = new ConfigurationSetService(client);
 *
 * // Create a configuration set
 * await configService.createConfigurationSet({
 *   configurationSetName: 'production',
 *   sendingOptions: { sendingEnabled: true },
 *   reputationOptions: { reputationMetricsEnabled: true }
 * });
 *
 * // Add event destination to track bounces in Kinesis
 * await configService.createConfigurationSetEventDestination({
 *   configurationSetName: 'production',
 *   eventDestinationName: 'kinesis-bounces',
 *   eventDestination: {
 *     enabled: true,
 *     matchingEventTypes: ['BOUNCE', 'COMPLAINT'],
 *     kinesisFirehoseDestination: {
 *       iamRoleArn: 'arn:aws:iam::123456789012:role/SESKinesisRole',
 *       deliveryStreamArn: 'arn:aws:firehose:us-east-1:123456789012:deliverystream/ses-events'
 *     }
 *   }
 * });
 * ```
 */
export class ConfigurationSetService extends BaseService {
  /**
   * Create a configuration set.
   *
   * Creates a new configuration set with specified settings for tracking,
   * delivery, reputation monitoring, and suppression.
   *
   * @param request - Configuration set creation request
   * @returns Promise resolving when configuration set is created
   *
   * @throws {ConfigurationSetError} If configuration set already exists
   * @throws {ValidationError} If configuration is invalid
   *
   * @example
   * ```typescript
   * await configService.createConfigurationSet({
   *   configurationSetName: 'transactional',
   *   trackingOptions: {
   *     customRedirectDomain: 'click.example.com'
   *   },
   *   deliveryOptions: {
   *     tlsPolicy: 'REQUIRE',
   *     sendingPoolName: 'my-pool'
   *   },
   *   reputationOptions: {
   *     reputationMetricsEnabled: true
   *   },
   *   sendingOptions: {
   *     sendingEnabled: true
   *   },
   *   suppressionOptions: {
   *     suppressedReasons: ['BOUNCE', 'COMPLAINT']
   *   }
   * });
   * ```
   */
  async createConfigurationSet(request: CreateConfigurationSetRequest): Promise<CreateConfigurationSetResponse> {
    return this.post<CreateConfigurationSetResponse>('/v2/email/configuration-sets', request);
  }

  /**
   * Delete a configuration set.
   *
   * Permanently deletes a configuration set. Event destinations associated
   * with the configuration set are also deleted.
   *
   * @param configurationSetName - Name of the configuration set to delete
   * @returns Promise resolving when configuration set is deleted
   *
   * @throws {ConfigurationSetError} If configuration set does not exist or is in use
   *
   * @example
   * ```typescript
   * await configService.deleteConfigurationSet('old-config');
   * ```
   */
  async deleteConfigurationSet(configurationSetName: string): Promise<void> {
    return this.delete(`/v2/email/configuration-sets/${encodeURIComponent(configurationSetName)}`);
  }

  /**
   * Get configuration set details.
   *
   * Retrieves complete information about a configuration set including
   * all settings and options.
   *
   * @param configurationSetName - Name of the configuration set
   * @returns Promise resolving to configuration set details
   *
   * @throws {ConfigurationSetError} If configuration set does not exist
   *
   * @example
   * ```typescript
   * const config = await configService.getConfigurationSet('production');
   *
   * console.log('Sending enabled:', config.sendingOptions?.sendingEnabled);
   * console.log('TLS policy:', config.deliveryOptions?.tlsPolicy);
   * console.log('Reputation tracking:', config.reputationOptions?.reputationMetricsEnabled);
   * ```
   */
  async getConfigurationSet(configurationSetName: string): Promise<GetConfigurationSetResponse> {
    return this.get<GetConfigurationSetResponse>(
      `/v2/email/configuration-sets/${encodeURIComponent(configurationSetName)}`
    );
  }

  /**
   * List configuration sets.
   *
   * Returns a list of all configuration sets in your account.
   * Results are paginated if you have many configuration sets.
   *
   * @param nextToken - Token for pagination (from previous response)
   * @param pageSize - Maximum number of configuration sets to return
   * @returns Promise resolving to list of configuration sets
   *
   * @example
   * ```typescript
   * const response = await configService.listConfigurationSets();
   *
   * response.configurationSets?.forEach(configSet => {
   *   console.log('Configuration set:', configSet);
   * });
   * ```
   */
  async listConfigurationSets(
    nextToken?: string,
    pageSize?: number
  ): Promise<ListConfigurationSetsResponse> {
    const query = this.buildQuery({
      NextToken: nextToken,
      PageSize: pageSize,
    });

    return this.get<ListConfigurationSetsResponse>('/v2/email/configuration-sets', query);
  }

  /**
   * Update delivery options for a configuration set.
   *
   * Modifies TLS policy and sending pool configuration.
   *
   * @param configurationSetName - Name of the configuration set
   * @param tlsPolicy - TLS policy (REQUIRE or OPTIONAL)
   * @param sendingPoolName - Name of dedicated IP pool (optional)
   * @returns Promise resolving when delivery options are updated
   *
   * @example
   * ```typescript
   * await configService.putConfigurationSetDeliveryOptions(
   *   'production',
   *   'REQUIRE',
   *   'my-dedicated-pool'
   * );
   * ```
   */
  async putConfigurationSetDeliveryOptions(
    configurationSetName: string,
    tlsPolicy?: 'REQUIRE' | 'OPTIONAL',
    sendingPoolName?: string
  ): Promise<PutConfigurationSetDeliveryOptionsResponse> {
    return this.put<PutConfigurationSetDeliveryOptionsResponse>(
      `/v2/email/configuration-sets/${encodeURIComponent(configurationSetName)}/delivery-options`,
      { tlsPolicy, sendingPoolName }
    );
  }

  /**
   * Update reputation options for a configuration set.
   *
   * Enables or disables reputation metrics tracking for the configuration set.
   *
   * @param configurationSetName - Name of the configuration set
   * @param reputationMetricsEnabled - Whether to enable reputation metrics
   * @returns Promise resolving when reputation options are updated
   *
   * @example
   * ```typescript
   * await configService.putConfigurationSetReputationOptions('production', true);
   * ```
   */
  async putConfigurationSetReputationOptions(
    configurationSetName: string,
    reputationMetricsEnabled: boolean
  ): Promise<PutConfigurationSetReputationOptionsResponse> {
    return this.put<PutConfigurationSetReputationOptionsResponse>(
      `/v2/email/configuration-sets/${encodeURIComponent(configurationSetName)}/reputation-options`,
      { reputationMetricsEnabled }
    );
  }

  /**
   * Update sending options for a configuration set.
   *
   * Enables or disables email sending for the configuration set.
   *
   * @param configurationSetName - Name of the configuration set
   * @param sendingEnabled - Whether to enable sending
   * @returns Promise resolving when sending options are updated
   *
   * @example
   * ```typescript
   * // Pause sending
   * await configService.putConfigurationSetSendingOptions('production', false);
   *
   * // Resume sending
   * await configService.putConfigurationSetSendingOptions('production', true);
   * ```
   */
  async putConfigurationSetSendingOptions(
    configurationSetName: string,
    sendingEnabled: boolean
  ): Promise<PutConfigurationSetSendingOptionsResponse> {
    return this.put<PutConfigurationSetSendingOptionsResponse>(
      `/v2/email/configuration-sets/${encodeURIComponent(configurationSetName)}/sending`,
      { sendingEnabled }
    );
  }

  /**
   * Update suppression options for a configuration set.
   *
   * Configures which suppression list reasons to use (BOUNCE, COMPLAINT).
   *
   * @param configurationSetName - Name of the configuration set
   * @param suppressedReasons - Array of suppression reasons to enable
   * @returns Promise resolving when suppression options are updated
   *
   * @example
   * ```typescript
   * await configService.putConfigurationSetSuppressionOptions(
   *   'production',
   *   ['BOUNCE', 'COMPLAINT']
   * );
   * ```
   */
  async putConfigurationSetSuppressionOptions(
    configurationSetName: string,
    suppressedReasons: Array<'BOUNCE' | 'COMPLAINT'>
  ): Promise<PutConfigurationSetSuppressionOptionsResponse> {
    return this.put<PutConfigurationSetSuppressionOptionsResponse>(
      `/v2/email/configuration-sets/${encodeURIComponent(configurationSetName)}/suppression-options`,
      { suppressedReasons }
    );
  }

  /**
   * Update tracking options for a configuration set.
   *
   * Configures a custom redirect domain for tracking open and click events.
   *
   * @param configurationSetName - Name of the configuration set
   * @param customRedirectDomain - Custom domain for redirects
   * @returns Promise resolving when tracking options are updated
   *
   * @example
   * ```typescript
   * await configService.putConfigurationSetTrackingOptions(
   *   'production',
   *   'click.example.com'
   * );
   * ```
   */
  async putConfigurationSetTrackingOptions(
    configurationSetName: string,
    customRedirectDomain: string
  ): Promise<PutConfigurationSetTrackingOptionsResponse> {
    return this.put<PutConfigurationSetTrackingOptionsResponse>(
      `/v2/email/configuration-sets/${encodeURIComponent(configurationSetName)}/tracking-options`,
      { customRedirectDomain }
    );
  }

  /**
   * Create an event destination for a configuration set.
   *
   * Adds a destination for sending email event notifications (e.g., to Kinesis,
   * CloudWatch, SNS, or EventBridge).
   *
   * @param request - Event destination creation request
   * @returns Promise resolving when event destination is created
   *
   * @example Send events to Kinesis Firehose
   * ```typescript
   * await configService.createConfigurationSetEventDestination({
   *   configurationSetName: 'production',
   *   eventDestinationName: 'firehose-all-events',
   *   eventDestination: {
   *     enabled: true,
   *     matchingEventTypes: ['SEND', 'DELIVERY', 'BOUNCE', 'COMPLAINT', 'OPEN', 'CLICK'],
   *     kinesisFirehoseDestination: {
   *       iamRoleArn: 'arn:aws:iam::123456789012:role/SESKinesisRole',
   *       deliveryStreamArn: 'arn:aws:firehose:us-east-1:123456789012:deliverystream/ses-events'
   *     }
   *   }
   * });
   * ```
   *
   * @example Send events to CloudWatch
   * ```typescript
   * await configService.createConfigurationSetEventDestination({
   *   configurationSetName: 'production',
   *   eventDestinationName: 'cloudwatch-bounces',
   *   eventDestination: {
   *     enabled: true,
   *     matchingEventTypes: ['BOUNCE', 'COMPLAINT'],
   *     cloudWatchDestination: {
   *       dimensionConfigurations: [
   *         {
   *           dimensionName: 'ses:configuration-set',
   *           dimensionValueSource: 'MESSAGE_TAG',
   *           defaultDimensionValue: 'unknown'
   *         }
   *       ]
   *     }
   *   }
   * });
   * ```
   */
  async createConfigurationSetEventDestination(
    request: CreateConfigurationSetEventDestinationRequest
  ): Promise<CreateConfigurationSetEventDestinationResponse> {
    const { configurationSetName, eventDestinationName, eventDestination } = request;
    return this.post<CreateConfigurationSetEventDestinationResponse>(
      `/v2/email/configuration-sets/${encodeURIComponent(configurationSetName)}/event-destinations`,
      { eventDestinationName, eventDestination }
    );
  }

  /**
   * Update an event destination.
   *
   * Modifies the configuration of an existing event destination.
   *
   * @param request - Event destination update request
   * @returns Promise resolving when event destination is updated
   *
   * @example
   * ```typescript
   * await configService.updateConfigurationSetEventDestination({
   *   configurationSetName: 'production',
   *   eventDestinationName: 'firehose-all-events',
   *   eventDestination: {
   *     enabled: false  // Temporarily disable
   *   }
   * });
   * ```
   */
  async updateConfigurationSetEventDestination(
    request: UpdateConfigurationSetEventDestinationRequest
  ): Promise<UpdateConfigurationSetEventDestinationResponse> {
    const { configurationSetName, eventDestinationName, eventDestination } = request;
    return this.put<UpdateConfigurationSetEventDestinationResponse>(
      `/v2/email/configuration-sets/${encodeURIComponent(configurationSetName)}/event-destinations/${encodeURIComponent(eventDestinationName)}`,
      { eventDestination }
    );
  }

  /**
   * Delete an event destination.
   *
   * Removes an event destination from a configuration set.
   *
   * @param configurationSetName - Name of the configuration set
   * @param eventDestinationName - Name of the event destination to delete
   * @returns Promise resolving when event destination is deleted
   *
   * @example
   * ```typescript
   * await configService.deleteConfigurationSetEventDestination(
   *   'production',
   *   'old-destination'
   * );
   * ```
   */
  async deleteConfigurationSetEventDestination(
    configurationSetName: string,
    eventDestinationName: string
  ): Promise<void> {
    return this.delete(
      `/v2/email/configuration-sets/${encodeURIComponent(configurationSetName)}/event-destinations/${encodeURIComponent(eventDestinationName)}`
    );
  }

  /**
   * Get event destinations for a configuration set.
   *
   * Retrieves all event destinations associated with a configuration set.
   *
   * @param configurationSetName - Name of the configuration set
   * @returns Promise resolving to list of event destinations
   *
   * @example
   * ```typescript
   * const response = await configService.getConfigurationSetEventDestinations('production');
   *
   * response.eventDestinations?.forEach(destination => {
   *   console.log('Destination:', destination.name);
   *   console.log('Enabled:', destination.enabled);
   *   console.log('Event types:', destination.matchingEventTypes);
   * });
   * ```
   */
  async getConfigurationSetEventDestinations(
    configurationSetName: string
  ): Promise<GetConfigurationSetEventDestinationsResponse> {
    return this.get<GetConfigurationSetEventDestinationsResponse>(
      `/v2/email/configuration-sets/${encodeURIComponent(configurationSetName)}/event-destinations`
    );
  }
}

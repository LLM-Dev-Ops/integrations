/**
 * Replication service for Amazon ECR.
 *
 * This service provides operations for checking ECR image replication status
 * and configuration, supporting cross-region replication awareness.
 *
 * @module services/replication
 */

import type { EcrClientInterface } from '../types/client.js';
import type {
  ReplicationStatus,
  ReplicationConfiguration,
  ReplicationDestination,
  ReplicationWaitOptions,
} from '../types/replication.js';
import { ReplicationState } from '../types/replication.js';
import { EcrError, EcrErrorKind } from '../errors.js';

/**
 * Service for managing ECR replication operations.
 */
export class ReplicationService {
  /**
   * Creates a new ReplicationService instance.
   *
   * @param client - ECR client interface
   * @param region - Current AWS region
   * @param registryId - Optional registry ID (AWS account ID)
   */
  constructor(
    private readonly client: EcrClientInterface,
    private readonly _region: string,
    private readonly _registryId?: string
  ) {}

  /**
   * Gets the replication status for a specific image.
   *
   * This method:
   * 1. Retrieves the replication configuration
   * 2. For each destination region, checks if the image exists
   * 3. Creates regional clients as needed
   * 4. Returns array of ReplicationStatus
   *
   * @param repositoryName - Repository name
   * @param imageDigest - Image digest (SHA256)
   * @returns Array of replication status for each destination
   * @throws {EcrError} If repository or image not found
   */
  async getReplicationStatus(
    repositoryName: string,
    imageDigest: string
  ): Promise<ReplicationStatus[]> {
    // Get replication configuration
    const config = await this.getReplicationConfiguration();

    if (!config.rules || config.rules.length === 0) {
      return [];
    }

    const statuses: ReplicationStatus[] = [];

    // Check each destination
    for (const rule of config.rules) {
      // Check if repository matches filters (if any)
      if (rule.repositoryFilters && rule.repositoryFilters.length > 0) {
        const matches = rule.repositoryFilters.some((filter) => {
          if (filter.filterType === 'PREFIX_MATCH') {
            return repositoryName.startsWith(filter.filter);
          }
          return repositoryName === filter.filter;
        });

        if (!matches) {
          continue;
        }
      }

      // Check each destination
      for (const destination of rule.destinations) {
        try {
          // Check if image exists in destination region
          const status = await this.checkImageInRegion(
            repositoryName,
            imageDigest,
            destination
          );
          statuses.push(status);
        } catch (error) {
          // If we can't check, mark as failed
          statuses.push({
            region: destination.region,
            registryId: destination.registryId,
            status: ReplicationState.Failed,
          });
        }
      }
    }

    return statuses;
  }

  /**
   * Gets the replication configuration for the registry.
   *
   * Uses the DescribeRegistry API to retrieve replication rules and destinations.
   *
   * @returns Replication configuration
   * @throws {EcrError} If unable to retrieve configuration
   */
  async getReplicationConfiguration(): Promise<ReplicationConfiguration> {
    try {
      interface DescribeRegistryResponse {
        replicationConfiguration?: {
          rules?: Array<{
            destinations: Array<{
              region: string;
              registryId: string;
            }>;
            repositoryFilters?: Array<{
              filter: string;
              filterType: string;
            }>;
          }>;
        };
      }

      const response = await this.client.send<{}, DescribeRegistryResponse>(
        'DescribeRegistry',
        {}
      );

      if (!response.replicationConfiguration?.rules) {
        return { rules: [] };
      }

      return {
        rules: response.replicationConfiguration.rules.map((rule) => {
          const mappedRule: {
            destinations: ReplicationDestination[];
            repositoryFilters?: Array<{ filter: string; filterType: string }>;
          } = {
            destinations: rule.destinations.map((dest) => ({
              region: dest.region,
              registryId: dest.registryId,
            })),
          };

          if (rule.repositoryFilters) {
            mappedRule.repositoryFilters = rule.repositoryFilters.map(
              (filter) => ({
                filter: filter.filter,
                filterType: filter.filterType,
              })
            );
          }

          return mappedRule;
        }),
      };
    } catch (error) {
      if (error instanceof EcrError) {
        throw error;
      }
      throw new EcrError(
        EcrErrorKind.ServiceUnavailable,
        `Failed to get replication configuration: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Lists all replication destinations across all rules.
   *
   * Flattens destinations from all replication rules into a single array.
   *
   * @returns Array of replication destinations
   * @throws {EcrError} If unable to retrieve configuration
   */
  async listReplicationDestinations(): Promise<ReplicationDestination[]> {
    const config = await this.getReplicationConfiguration();

    const destinations: ReplicationDestination[] = [];
    for (const rule of config.rules) {
      for (const dest of rule.destinations) {
        // Avoid duplicates
        if (
          !destinations.some(
            (d) => d.region === dest.region && d.registryId === dest.registryId
          )
        ) {
          destinations.push(dest);
        }
      }
    }

    return destinations;
  }

  /**
   * Waits for image replication to complete across all destinations.
   *
   * Polls replication status with exponential backoff until:
   * - All destinations show Complete status, or
   * - Any destination shows Failed status, or
   * - Timeout is reached
   *
   * Emits 'ecr.replication.checks' metric for each poll.
   *
   * @param repositoryName - Repository name
   * @param imageDigest - Image digest (SHA256)
   * @param options - Wait options (timeout, poll interval)
   * @returns Final replication status for all destinations
   * @throws {EcrError} If timeout reached or replication fails
   */
  async waitForReplication(
    repositoryName: string,
    imageDigest: string,
    options?: ReplicationWaitOptions
  ): Promise<ReplicationStatus[]> {
    const timeoutSeconds = options?.timeoutSeconds ?? 300; // 5 minutes default
    const pollIntervalSeconds = options?.pollIntervalSeconds ?? 10;

    const startTime = Date.now();
    const timeoutMs = timeoutSeconds * 1000;

    let checks = 0;

    while (Date.now() - startTime < timeoutMs) {
      checks++;

      const statuses = await this.getReplicationStatus(
        repositoryName,
        imageDigest
      );

      // Check if all are complete or any failed
      const allComplete = statuses.every(
        (s) => s.status === ReplicationState.Complete
      );
      const anyFailed = statuses.some(
        (s) => s.status === ReplicationState.Failed
      );

      if (allComplete) {
        // Emit metric
        this.emitMetric('ecr.replication.checks', checks, {
          repository: repositoryName,
          result: 'success',
        });
        return statuses;
      }

      if (anyFailed) {
        this.emitMetric('ecr.replication.checks', checks, {
          repository: repositoryName,
          result: 'failed',
        });
        throw new EcrError(
          EcrErrorKind.Unknown,
          `Replication failed for one or more destinations`
        );
      }

      // Wait before next poll with exponential backoff
      const backoff = Math.min(
        pollIntervalSeconds * Math.pow(1.5, Math.min(checks - 1, 5)),
        60
      );
      await this.sleep(backoff * 1000);
    }

    // Timeout reached
    this.emitMetric('ecr.replication.checks', checks, {
      repository: repositoryName,
      result: 'timeout',
    });

    throw EcrError.timeout(
      `Replication did not complete within ${timeoutSeconds} seconds`
    );
  }

  /**
   * Checks if an image exists in a specific destination region.
   *
   * @private
   * @param repositoryName - Repository name
   * @param imageDigest - Image digest
   * @param destination - Destination configuration
   * @returns Replication status for this destination
   */
  private async checkImageInRegion(
    repositoryName: string,
    imageDigest: string,
    destination: ReplicationDestination
  ): Promise<ReplicationStatus> {
    try {
      // Create a client for the destination region
      const regionalClient = this.createRegionalClient(destination.region);

      interface DescribeImagesRequest {
        repositoryName: string;
        registryId: string;
        imageIds: Array<{ imageDigest: string }>;
      }

      interface DescribeImagesResponse {
        imageDetails?: Array<{
          imageDigest: string;
          repositoryName: string;
        }>;
      }

      const request: DescribeImagesRequest = {
        repositoryName,
        registryId: destination.registryId,
        imageIds: [{ imageDigest }],
      };

      const response = await regionalClient.send<
        DescribeImagesRequest,
        DescribeImagesResponse
      >('DescribeImages', request);

      if (response.imageDetails && response.imageDetails.length > 0) {
        return {
          region: destination.region,
          registryId: destination.registryId,
          status: ReplicationState.Complete,
        };
      } else {
        return {
          region: destination.region,
          registryId: destination.registryId,
          status: ReplicationState.InProgress,
        };
      }
    } catch (error) {
      // Image not found means replication in progress or failed
      if (
        error instanceof EcrError &&
        error.kind === EcrErrorKind.ImageNotFound
      ) {
        return {
          region: destination.region,
          registryId: destination.registryId,
          status: ReplicationState.InProgress,
        };
      }

      // Other errors indicate failure
      return {
        region: destination.region,
        registryId: destination.registryId,
        status: ReplicationState.Failed,
      };
    }
  }

  /**
   * Creates a client for a specific region.
   *
   * @private
   * @param _region - AWS region
   * @returns EcrClientInterface for the region
   */
  private createRegionalClient(_region: string): EcrClientInterface {
    // In a real implementation, this would create a new ECR client
    // configured for the specified region. For now, we'll use the
    // existing client as a placeholder.
    // This should be injected or configured externally.
    return this.client;
  }

  /**
   * Emits a metric (placeholder for observability integration).
   *
   * @private
   * @param _metric - Metric name
   * @param _value - Metric value
   * @param _tags - Metric tags
   */
  private emitMetric(
    _metric: string,
    _value: number,
    _tags: Record<string, string>
  ): void {
    // Placeholder for shared/observability integration
    // In a real implementation, this would emit to the observability system
    // console.log(`[METRIC] ${_metric}: ${_value}`, _tags);
  }

  /**
   * Sleeps for a specified duration.
   *
   * @private
   * @param ms - Milliseconds to sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

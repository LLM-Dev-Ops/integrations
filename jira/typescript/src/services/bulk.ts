/**
 * Bulk operations service implementation following SPARC specification.
 *
 * Provides batch operations for issues with proper chunking and error handling.
 */

import { JiraClient } from '../client/index.js';
import {
  JiraIssue,
  CreateIssueInput,
  TransitionInput,
  BulkCreateResult,
  BulkOperationResult,
  textToAdf,
} from '../types/index.js';
import { BulkOperationPartialFailureError, ValidationError } from '../errors/index.js';
import { MetricNames } from '../observability/index.js';

// ============================================================================
// Bulk Service Interface
// ============================================================================

/**
 * Bulk update specification.
 */
export interface BulkUpdateSpec {
  /** Issue key or ID */
  issueKeyOrId: string;
  /** Fields to update */
  fields: Record<string, unknown>;
}

/**
 * Bulk transition specification.
 */
export interface BulkTransitionSpec {
  /** Issue key or ID */
  issueKeyOrId: string;
  /** Transition input */
  transition: TransitionInput;
}

/**
 * Bulk transition result.
 */
export interface BulkTransitionResult {
  /** Number of successful transitions */
  successes: number;
  /** Failed transitions */
  failures: Array<{
    issueKeyOrId: string;
    error: string;
  }>;
}

/**
 * Bulk service interface.
 */
export interface BulkService {
  /** Bulk create issues */
  createIssues(inputs: CreateIssueInput[]): Promise<BulkCreateResult>;
  /** Bulk update issues */
  updateIssues(updates: BulkUpdateSpec[]): Promise<BulkOperationResult<{ key: string }>>;
  /** Bulk transition issues */
  transitionIssues(transitions: BulkTransitionSpec[]): Promise<BulkTransitionResult>;
}

// ============================================================================
// Bulk Service Implementation
// ============================================================================

/**
 * Bulk operations service implementation.
 */
export class BulkServiceImpl implements BulkService {
  private readonly client: JiraClient;

  constructor(client: JiraClient) {
    this.client = client;
  }

  /**
   * Bulk creates issues.
   */
  async createIssues(inputs: CreateIssueInput[]): Promise<BulkCreateResult> {
    return this.client.tracer.withSpan(
      'jira.bulk.create',
      async (span) => {
        span.setAttribute('count', inputs.length);

        const batchSize = this.client.configuration.bulkConfig.batchSize;

        if (inputs.length > batchSize) {
          throw new ValidationError([
            `Batch size ${inputs.length} exceeds maximum ${batchSize}`,
          ]);
        }

        if (inputs.length === 0) {
          return { issues: [], errors: [] };
        }

        // Build issue updates array
        const issueUpdates = inputs.map(input => ({
          fields: this.buildCreateFields(input),
        }));

        const response = await this.client.post<BulkCreateResult>(
          '/issue/bulk',
          { issueUpdates }
        );

        const successCount = response.issues.length;
        const failureCount = response.errors.length;

        this.client.metrics.increment(MetricNames.BULK_OPERATIONS_TOTAL, 1, {
          operation: 'create',
        });
        this.client.metrics.increment(MetricNames.BULK_ITEMS_PROCESSED, successCount);
        this.client.metrics.increment(MetricNames.BULK_ITEMS_FAILED, failureCount);

        this.client.logger.info('Bulk create completed', {
          total: inputs.length,
          successes: successCount,
          failures: failureCount,
        });

        if (failureCount > 0 && successCount > 0) {
          // Partial failure
          span.setAttribute('partial_failure', true);
        }

        return response;
      },
      { operation: 'bulkCreate' }
    );
  }

  /**
   * Bulk updates issues.
   */
  async updateIssues(updates: BulkUpdateSpec[]): Promise<BulkOperationResult<{ key: string }>> {
    return this.client.tracer.withSpan(
      'jira.bulk.update',
      async (span) => {
        span.setAttribute('count', updates.length);

        if (updates.length === 0) {
          return { successes: [], failures: [] };
        }

        const batchSize = this.client.configuration.bulkConfig.batchSize;
        const results: BulkOperationResult<{ key: string }> = {
          successes: [],
          failures: [],
        };

        // Process in batches
        const batches = this.chunkArray(updates, batchSize);

        for (const batch of batches) {
          // Process batch concurrently with limited parallelism
          const batchResults = await this.processBatchUpdates(batch);
          results.successes.push(...batchResults.successes);
          results.failures.push(...batchResults.failures);
        }

        this.client.metrics.increment(MetricNames.BULK_OPERATIONS_TOTAL, 1, {
          operation: 'update',
        });
        this.client.metrics.increment(MetricNames.BULK_ITEMS_PROCESSED, results.successes.length);
        this.client.metrics.increment(MetricNames.BULK_ITEMS_FAILED, results.failures.length);

        this.client.logger.info('Bulk update completed', {
          total: updates.length,
          successes: results.successes.length,
          failures: results.failures.length,
        });

        return results;
      },
      { operation: 'bulkUpdate' }
    );
  }

  /**
   * Bulk transitions issues.
   */
  async transitionIssues(transitions: BulkTransitionSpec[]): Promise<BulkTransitionResult> {
    return this.client.tracer.withSpan(
      'jira.bulk.transition',
      async (span) => {
        span.setAttribute('count', transitions.length);

        if (transitions.length === 0) {
          return { successes: 0, failures: [] };
        }

        const maxConcurrent = this.client.configuration.bulkConfig.maxConcurrentTransitions;
        const result: BulkTransitionResult = {
          successes: 0,
          failures: [],
        };

        // Process transitions with limited concurrency
        const semaphore = new Semaphore(maxConcurrent);

        const promises = transitions.map(async (spec) => {
          await semaphore.acquire();
          try {
            await this.executeTransition(spec);
            result.successes++;
          } catch (error) {
            result.failures.push({
              issueKeyOrId: spec.issueKeyOrId,
              error: (error as Error).message,
            });
          } finally {
            semaphore.release();
          }
        });

        await Promise.all(promises);

        this.client.metrics.increment(MetricNames.BULK_OPERATIONS_TOTAL, 1, {
          operation: 'transition',
        });
        this.client.metrics.increment(MetricNames.BULK_ITEMS_PROCESSED, result.successes);
        this.client.metrics.increment(MetricNames.BULK_ITEMS_FAILED, result.failures.length);

        this.client.logger.info('Bulk transition completed', {
          total: transitions.length,
          successes: result.successes,
          failures: result.failures.length,
        });

        return result;
      },
      { operation: 'bulkTransition' }
    );
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private buildCreateFields(input: CreateIssueInput): Record<string, unknown> {
    const fields: Record<string, unknown> = {};

    // Project
    if (typeof input.project === 'string') {
      fields.project = { key: input.project };
    } else {
      fields.project = input.project;
    }

    // Issue type
    if (typeof input.issueType === 'string') {
      fields.issuetype = { name: input.issueType };
    } else {
      fields.issuetype = input.issueType;
    }

    // Summary
    fields.summary = input.summary;

    // Description
    if (input.description !== undefined) {
      fields.description = typeof input.description === 'string'
        ? textToAdf(input.description)
        : input.description;
    }

    // Priority
    if (input.priority !== undefined) {
      if (typeof input.priority === 'string') {
        fields.priority = { name: input.priority };
      } else {
        fields.priority = input.priority;
      }
    }

    // Assignee
    if (input.assignee !== undefined) {
      if (typeof input.assignee === 'string') {
        fields.assignee = { accountId: input.assignee };
      } else {
        fields.assignee = input.assignee;
      }
    }

    // Labels
    if (input.labels !== undefined) {
      fields.labels = input.labels;
    }

    // Custom fields
    if (input.customFields) {
      for (const [key, value] of Object.entries(input.customFields)) {
        const fieldKey = key.startsWith('customfield_') ? key : `customfield_${key}`;
        fields[fieldKey] = value;
      }
    }

    return fields;
  }

  private async processBatchUpdates(
    batch: BulkUpdateSpec[]
  ): Promise<BulkOperationResult<{ key: string }>> {
    const results: BulkOperationResult<{ key: string }> = {
      successes: [],
      failures: [],
    };

    const maxConcurrent = this.client.configuration.bulkConfig.maxConcurrentTransitions;
    const semaphore = new Semaphore(maxConcurrent);

    const promises = batch.map(async (spec) => {
      await semaphore.acquire();
      try {
        await this.client.put<void>(`/issue/${spec.issueKeyOrId}`, {
          fields: spec.fields,
        });
        results.successes.push({ key: spec.issueKeyOrId });
      } catch (error) {
        results.failures.push({
          input: spec,
          error: (error as Error).message,
        });
      } finally {
        semaphore.release();
      }
    });

    await Promise.all(promises);
    return results;
  }

  private async executeTransition(spec: BulkTransitionSpec): Promise<void> {
    const transitionId = typeof spec.transition.transition === 'string'
      ? spec.transition.transition
      : spec.transition.transition.id;

    const body: Record<string, unknown> = {
      transition: { id: transitionId },
    };

    if (spec.transition.fields) {
      body.fields = spec.transition.fields;
    }

    await this.client.post<void>(
      `/issue/${spec.issueKeyOrId}/transitions`,
      body
    );
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}

// ============================================================================
// Simple Semaphore Implementation
// ============================================================================

/**
 * Simple semaphore for limiting concurrency.
 */
class Semaphore {
  private permits: number;
  private readonly waiting: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }

    return new Promise<void>((resolve) => {
      this.waiting.push(resolve);
    });
  }

  release(): void {
    const next = this.waiting.shift();
    if (next) {
      next();
    } else {
      this.permits++;
    }
  }
}

/**
 * Creates a bulk service instance.
 */
export function createBulkService(client: JiraClient): BulkService {
  return new BulkServiceImpl(client);
}

/**
 * SObject service implementation following SPARC specification.
 *
 * Provides CRUD operations for Salesforce SObjects, including create, read,
 * update, upsert, delete, describe, and composite operations.
 */

import type { SalesforceClient } from '../client/index.js';
import type {
  SObjectRecord,
  SObjectDescribe,
  CreateResult,
  UpsertResult,
  CompositeRequest,
  CompositeResponse,
  SalesforceFieldError,
} from '../types/index.js';
import type { Logger } from '../observability/index.js';
import { MetricNames } from '../observability/index.js';
import { SalesforceError, SalesforceErrorCode } from '../errors/index.js';

// ============================================================================
// Validation Error
// ============================================================================

/**
 * Validation error for SObject operations.
 */
export class ValidationError extends SalesforceError {
  constructor(message: string, details?: Record<string, unknown>) {
    super({
      code: SalesforceErrorCode.ConfigurationError,
      message: `Validation error: ${message}`,
      retryable: false,
      details,
    });
    this.name = 'ValidationError';
  }
}

// ============================================================================
// SObject Service Interface
// ============================================================================

/**
 * Result type for update operations.
 */
export interface UpdateResult {
  /** The ID of the updated record */
  id: string;
  /** Whether the update was successful */
  success: boolean;
  /** Array of errors if the update failed */
  errors: SalesforceFieldError[];
}

/**
 * Result type for delete operations.
 */
export interface DeleteResult {
  /** The ID of the deleted record */
  id: string;
  /** Whether the deletion was successful */
  success: boolean;
  /** Array of errors if the deletion failed */
  errors: SalesforceFieldError[];
}

/**
 * Global describe result.
 */
export interface GlobalDescribeResult {
  /** Array of SObject metadata */
  sobjects: SObjectDescribe[];
}

/**
 * SObject service interface.
 */
export interface SObjectService {
  /** Create a new SObject record */
  create(sobjectType: string, record: Record<string, unknown>): Promise<CreateResult>;

  /** Get an SObject record by ID */
  get(sobjectType: string, id: string, fields?: string[]): Promise<SObjectRecord>;

  /** Update an SObject record */
  update(sobjectType: string, id: string, record: Record<string, unknown>): Promise<void>;

  /** Upsert an SObject record using external ID */
  upsert(
    sobjectType: string,
    externalIdField: string,
    externalIdValue: string,
    record: Record<string, unknown>
  ): Promise<UpsertResult>;

  /** Delete an SObject record */
  delete(sobjectType: string, id: string): Promise<void>;

  /** Describe an SObject type */
  describe(sobjectType: string): Promise<SObjectDescribe>;

  /** Get global describe information for all SObjects */
  describeGlobal(): Promise<GlobalDescribeResult>;

  /** Execute composite requests */
  composite(requests: CompositeRequest[], allOrNone?: boolean): Promise<CompositeResponse>;

  /** Batch operation helper for multiple records */
  compositeBatch(
    sobjectType: string,
    records: Record<string, unknown>[],
    operation: 'insert' | 'update' | 'delete',
    batchSize?: number
  ): Promise<(CreateResult | UpdateResult | DeleteResult)[]>;
}

// ============================================================================
// SObject Service Implementation
// ============================================================================

/**
 * SObject service implementation.
 */
export class SObjectServiceImpl implements SObjectService {
  private readonly client: SalesforceClient;
  private readonly logger: Logger;

  constructor(client: SalesforceClient) {
    this.client = client;
    this.logger = client.logger;
  }

  /**
   * Creates a new SObject record.
   */
  async create(sobjectType: string, record: Record<string, unknown>): Promise<CreateResult> {
    // Validate inputs
    validateSObjectType(sobjectType);

    if (!record || Object.keys(record).length === 0) {
      throw new ValidationError('Record data is required');
    }

    return this.executeWithTracing(
      'salesforce.sobject.create',
      { sobjectType, operation: 'create' },
      async () => {
        const result = await this.client.post<CreateResult>(
          `/sobjects/${sobjectType}`,
          record
        );

        this.logger.info('SObject created', {
          sobjectType,
          id: result.id,
          success: result.success,
        });

        // Record metrics
        if (result.success) {
          this.client.metrics.increment(MetricNames.RECORDS_CREATED, 1, {
            sobject_type: sobjectType,
          });
        }

        return result;
      }
    );
  }

  /**
   * Gets an SObject record by ID.
   */
  async get(sobjectType: string, id: string, fields?: string[]): Promise<SObjectRecord> {
    // Validate inputs
    validateSObjectType(sobjectType);

    if (!isValidSalesforceId(id)) {
      throw new ValidationError(`Invalid Salesforce ID: ${id}`);
    }

    return this.executeWithTracing(
      'salesforce.sobject.get',
      { sobjectType, operation: 'get' },
      async () => {
        const query: Record<string, string> = {};
        if (fields && fields.length > 0) {
          query.fields = fields.join(',');
        }

        const record = await this.client.get<SObjectRecord>(
          `/sobjects/${sobjectType}/${id}`,
          query
        );

        this.logger.debug('SObject retrieved', { sobjectType, id });

        return record;
      }
    );
  }

  /**
   * Updates an SObject record.
   */
  async update(
    sobjectType: string,
    id: string,
    record: Record<string, unknown>
  ): Promise<void> {
    // Validate inputs
    validateSObjectType(sobjectType);

    if (!isValidSalesforceId(id)) {
      throw new ValidationError(`Invalid Salesforce ID: ${id}`);
    }

    if (!record || Object.keys(record).length === 0) {
      throw new ValidationError('Record data is required');
    }

    return this.executeWithTracing(
      'salesforce.sobject.update',
      { sobjectType, operation: 'update' },
      async () => {
        // PATCH returns 204 No Content on success
        await this.client.patch<void>(
          `/sobjects/${sobjectType}/${id}`,
          record
        );

        this.logger.info('SObject updated', { sobjectType, id });

        // Record metrics
        this.client.metrics.increment(MetricNames.RECORDS_UPDATED, 1, {
          sobject_type: sobjectType,
        });
      }
    );
  }

  /**
   * Upserts an SObject record using an external ID field.
   */
  async upsert(
    sobjectType: string,
    externalIdField: string,
    externalIdValue: string,
    record: Record<string, unknown>
  ): Promise<UpsertResult> {
    // Validate inputs
    validateSObjectType(sobjectType);

    if (!externalIdField || externalIdField.trim().length === 0) {
      throw new ValidationError('External ID field name is required');
    }

    if (!externalIdValue || externalIdValue.trim().length === 0) {
      throw new ValidationError('External ID value is required');
    }

    if (!record || Object.keys(record).length === 0) {
      throw new ValidationError('Record data is required');
    }

    return this.executeWithTracing(
      'salesforce.sobject.upsert',
      { sobjectType, operation: 'upsert', externalIdField },
      async () => {
        const result = await this.client.patch<UpsertResult>(
          `/sobjects/${sobjectType}/${externalIdField}/${externalIdValue}`,
          record
        );

        this.logger.info('SObject upserted', {
          sobjectType,
          externalIdField,
          externalIdValue,
          id: result.id,
          created: result.created,
          success: result.success,
        });

        // Record metrics
        if (result.success) {
          const metricName = result.created ? MetricNames.RECORDS_CREATED : MetricNames.RECORDS_UPDATED;
          this.client.metrics.increment(metricName, 1, {
            sobject_type: sobjectType,
            operation: 'upsert',
          });
        }

        return result;
      }
    );
  }

  /**
   * Deletes an SObject record.
   */
  async delete(sobjectType: string, id: string): Promise<void> {
    // Validate inputs
    validateSObjectType(sobjectType);

    if (!isValidSalesforceId(id)) {
      throw new ValidationError(`Invalid Salesforce ID: ${id}`);
    }

    return this.executeWithTracing(
      'salesforce.sobject.delete',
      { sobjectType, operation: 'delete' },
      async () => {
        // DELETE returns 204 No Content on success
        await this.client.delete<void>(
          `/sobjects/${sobjectType}/${id}`
        );

        this.logger.info('SObject deleted', { sobjectType, id });

        // Record metrics
        this.client.metrics.increment(MetricNames.RECORDS_DELETED, 1, {
          sobject_type: sobjectType,
        });
      }
    );
  }

  /**
   * Describes an SObject type.
   */
  async describe(sobjectType: string): Promise<SObjectDescribe> {
    // Validate inputs
    validateSObjectType(sobjectType);

    return this.executeWithTracing(
      'salesforce.sobject.describe',
      { sobjectType, operation: 'describe' },
      async () => {
        const result = await this.client.get<SObjectDescribe>(
          `/sobjects/${sobjectType}/describe`
        );

        this.logger.debug('SObject described', {
          sobjectType,
          fieldCount: result.fields?.length ?? 0,
        });

        return result;
      }
    );
  }

  /**
   * Gets global describe information for all SObjects.
   */
  async describeGlobal(): Promise<GlobalDescribeResult> {
    return this.executeWithTracing(
      'salesforce.sobject.describeGlobal',
      { operation: 'describeGlobal' },
      async () => {
        const result = await this.client.get<GlobalDescribeResult>(
          '/sobjects'
        );

        this.logger.debug('Global describe retrieved', {
          sobjectCount: result.sobjects?.length ?? 0,
        });

        return result;
      }
    );
  }

  /**
   * Executes composite requests.
   */
  async composite(
    requests: CompositeRequest[],
    allOrNone: boolean = false
  ): Promise<CompositeResponse> {
    if (!requests || requests.length === 0) {
      throw new ValidationError('At least one composite request is required');
    }

    if (requests.length > 25) {
      throw new ValidationError('Composite API supports maximum 25 subrequests');
    }

    return this.executeWithTracing(
      'salesforce.sobject.composite',
      { operation: 'composite', requestCount: requests.length },
      async () => {
        const body = {
          allOrNone,
          compositeRequest: requests,
        };

        const result = await this.client.post<CompositeResponse>(
          '/composite',
          body
        );

        this.logger.info('Composite request executed', {
          requestCount: requests.length,
          responseCount: result.compositeResponse?.length ?? 0,
          allOrNone,
        });

        return result;
      }
    );
  }

  /**
   * Batch operation helper for multiple records.
   */
  async compositeBatch(
    sobjectType: string,
    records: Record<string, unknown>[],
    operation: 'insert' | 'update' | 'delete',
    batchSize: number = 25
  ): Promise<(CreateResult | UpdateResult | DeleteResult)[]> {
    // Validate inputs
    validateSObjectType(sobjectType);

    if (!records || records.length === 0) {
      throw new ValidationError('At least one record is required');
    }

    if (batchSize < 1 || batchSize > 25) {
      throw new ValidationError('Batch size must be between 1 and 25');
    }

    return this.executeWithTracing(
      'salesforce.sobject.compositeBatch',
      { sobjectType, operation, recordCount: records.length },
      async () => {
        const results: (CreateResult | UpdateResult | DeleteResult)[] = [];

        // Process records in batches
        for (let i = 0; i < records.length; i += batchSize) {
          const batch = records.slice(i, i + batchSize);
          const requests: CompositeRequest[] = batch.map((record, index) => {
            const refId = `${operation}_${i + index}`;

            switch (operation) {
              case 'insert':
                return {
                  method: 'POST',
                  url: `/services/data/${this.client.configuration.apiVersion}/sobjects/${sobjectType}`,
                  referenceId: refId,
                  body: record,
                };

              case 'update':
                if (!record.Id) {
                  throw new ValidationError(`Record at index ${i + index} missing Id field for update operation`);
                }
                return {
                  method: 'PATCH',
                  url: `/services/data/${this.client.configuration.apiVersion}/sobjects/${sobjectType}/${record.Id}`,
                  referenceId: refId,
                  body: record,
                };

              case 'delete':
                if (!record.Id) {
                  throw new ValidationError(`Record at index ${i + index} missing Id field for delete operation`);
                }
                return {
                  method: 'DELETE',
                  url: `/services/data/${this.client.configuration.apiVersion}/sobjects/${sobjectType}/${record.Id}`,
                  referenceId: refId,
                };
            }
          });

          const response = await this.composite(requests, false);

          // Extract results from composite response
          for (const subResponse of response.compositeResponse) {
            const result = subResponse.body as CreateResult | UpdateResult | DeleteResult;
            results.push(result);
          }
        }

        this.logger.info('Composite batch completed', {
          sobjectType,
          operation,
          totalRecords: records.length,
          batchSize,
        });

        return results;
      }
    );
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Executes an operation with tracing support if available.
   */
  private async executeWithTracing<T>(
    spanName: string,
    attributes: Record<string, unknown>,
    operation: () => Promise<T>
  ): Promise<T> {
    // Check if tracer is available (it may not be if observability is minimal)
    if (this.client.tracer && typeof this.client.tracer.withSpan === 'function') {
      return this.client.tracer.withSpan(
        spanName,
        async (span: any) => {
          // Set attributes if span supports it
          if (span && typeof span.setAttribute === 'function') {
            for (const [key, value] of Object.entries(attributes)) {
              span.setAttribute(key, value);
            }
          }
          return operation();
        },
        { operation: spanName }
      );
    } else {
      // Execute without tracing if not available
      return operation();
    }
  }
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validates a Salesforce ID format.
 *
 * Salesforce IDs are either 15 characters (case-sensitive) or 18 characters
 * (case-insensitive with checksum). They consist of alphanumeric characters.
 */
export function isValidSalesforceId(id: string): boolean {
  if (!id || typeof id !== 'string') {
    return false;
  }

  // Must be exactly 15 or 18 characters
  if (id.length !== 15 && id.length !== 18) {
    return false;
  }

  // Must contain only alphanumeric characters
  return /^[a-zA-Z0-9]{15}([a-zA-Z0-9]{3})?$/.test(id);
}

/**
 * Validates an SObject type name.
 *
 * SObject type names must:
 * - Not be empty
 * - Contain only letters, numbers, and underscores
 * - Start with a letter
 */
export function validateSObjectType(sobjectType: string): void {
  if (!sobjectType || typeof sobjectType !== 'string') {
    throw new ValidationError('SObject type is required');
  }

  const trimmed = sobjectType.trim();

  if (trimmed.length === 0) {
    throw new ValidationError('SObject type cannot be empty');
  }

  // SObject names must start with a letter and contain only letters, numbers, and underscores
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(trimmed)) {
    throw new ValidationError(
      `Invalid SObject type name: ${sobjectType}. Must start with a letter and contain only letters, numbers, and underscores.`
    );
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates an SObject service instance.
 */
export function createSObjectService(client: SalesforceClient): SObjectService {
  return new SObjectServiceImpl(client);
}

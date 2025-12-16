/**
 * Object operations service
 *
 * Provides CRUD operations for Weaviate objects with observability,
 * resilience, and schema validation.
 */

import type { HttpTransport } from '../transport/types.js';
import type { ObservabilityContext } from '../observability/types.js';
import type { ResilienceOrchestrator } from '../resilience/orchestrator.js';
import type {
  WeaviateObject,
  UUID,
  Properties,
  Vector,
} from '../types/index.js';
import type { ClassDefinition } from '../types/schema.js';
import {
  ObjectNotFoundError,
  InvalidObjectError,
  mapHttpError,
} from '../errors/index.js';
import {
  serializeObject,
  deserializeObject,
  serializeUpdateRequest,
  buildIncludeParams,
} from './serialization.js';
import { validateObject, validateVector } from './validation.js';
import type {
  CreateObjectOptions,
  GetObjectOptions,
  UpdateObjectOptions,
  DeleteObjectOptions,
  ValidateObjectOptions,
  ObjectValidationResult,
  ObjectQueryParams,
  ObjectApiResponse,
  ValidateObjectResponse,
} from './types.js';
import { SpanNames, MetricNames, SpanAttributes } from '../observability/types.js';

// ============================================================================
// Schema Cache Interface
// ============================================================================

/**
 * Interface for schema cache
 *
 * Allows injecting a schema cache implementation for validation
 */
export interface SchemaCache {
  /**
   * Get a class definition from cache or fetch it
   *
   * @param className - Name of the class
   * @returns Class definition
   */
  getClass(className: string): Promise<ClassDefinition | null>;

  /**
   * Invalidate cache for a specific class
   *
   * @param className - Name of the class
   */
  invalidate(className: string): void;

  /**
   * Clear all cached schemas
   */
  clear(): void;
}

// ============================================================================
// Object Service
// ============================================================================

/**
 * Service for object CRUD operations
 *
 * Provides methods for creating, reading, updating, and deleting
 * individual objects in Weaviate.
 */
export class ObjectService {
  constructor(
    private readonly transport: HttpTransport,
    private readonly observability: ObservabilityContext,
    private readonly schemaCache?: SchemaCache,
    private readonly resilience?: ResilienceOrchestrator
  ) {}

  // ==========================================================================
  // Create Object
  // ==========================================================================

  /**
   * Create a new object
   *
   * @param className - Name of the class
   * @param properties - Object properties
   * @param options - Creation options
   * @returns Created object
   */
  async createObject(
    className: string,
    properties: Properties,
    options?: CreateObjectOptions
  ): Promise<WeaviateObject> {
    const span = this.observability.tracer.startSpan(SpanNames.CREATE_OBJECT, {
      [SpanAttributes.CLASS_NAME]: className,
      [SpanAttributes.TENANT]: options?.tenant ?? '',
    });

    try {
      // Build object
      const object: Partial<WeaviateObject> = {
        id: options?.id ?? this.generateUUID(),
        className,
        properties,
        vector: options?.vector,
        tenant: options?.tenant,
      };

      // Validate object if requested
      if (options?.validate && this.schemaCache) {
        const schema = await this.schemaCache.getClass(className);
        if (!schema) {
          throw new InvalidObjectError(
            `Class '${className}' not found in schema`
          );
        }

        const validation = validateObject(object, schema);
        if (!validation.valid) {
          const errorMessages = validation.errors
            .map((e) => e.message)
            .join(', ');
          throw new InvalidObjectError(
            `Object validation failed: ${errorMessages}`
          );
        }
      }

      // Build request body
      const requestBody = serializeObject(object as WeaviateObject);

      // Build query parameters
      const queryParams: ObjectQueryParams = {};
      if (options?.consistencyLevel) {
        queryParams.consistency_level = options.consistencyLevel;
      }

      // Execute with resilience
      const executeFn = async () => {
        const response = await this.transport.post<ObjectApiResponse>(
          '/v1/objects',
          requestBody,
          queryParams
        );

        if (response.status !== 200) {
          throw mapHttpError(response);
        }

        return deserializeObject(response.data);
      };

      const result = this.resilience
        ? await this.resilience.execute(executeFn)
        : await executeFn();

      // Record success metrics
      this.observability.metrics.increment(
        `${MetricNames.OBJECT_CREATE}.success`,
        1,
        { class_name: className }
      );

      span.end('ok');
      return result;
    } catch (error) {
      // Record error metrics
      this.observability.metrics.increment(
        `${MetricNames.OBJECT_CREATE}.error`,
        1,
        {
          class_name: className,
          error_type: error instanceof Error ? error.constructor.name : 'unknown',
        }
      );

      span.recordError(error as Error);
      span.end('error');
      throw error;
    }
  }

  // ==========================================================================
  // Get Object
  // ==========================================================================

  /**
   * Retrieve an object by ID
   *
   * @param className - Name of the class
   * @param id - Object UUID
   * @param options - Get options
   * @returns Object if found, null otherwise
   */
  async getObject(
    className: string,
    id: UUID,
    options?: GetObjectOptions
  ): Promise<WeaviateObject | null> {
    const span = this.observability.tracer.startSpan(SpanNames.GET_OBJECT, {
      [SpanAttributes.CLASS_NAME]: className,
      [SpanAttributes.TENANT]: options?.tenant ?? '',
    });

    try {
      // Build query parameters
      const queryParams: ObjectQueryParams = {};

      // Include parameters
      const include = buildIncludeParams(
        options?.includeVector,
        options?.includeClassification
      );
      if (include) {
        queryParams.include = include;
      }

      // Tenant
      if (options?.tenant) {
        queryParams.tenant = options.tenant;
      }

      // Consistency level
      if (options?.consistencyLevel) {
        queryParams.consistency_level = options.consistencyLevel;
      }

      // Node name
      if (options?.nodeName) {
        queryParams.node_name = options.nodeName;
      }

      // Execute with resilience
      const executeFn = async () => {
        const response = await this.transport.get<ObjectApiResponse>(
          `/v1/objects/${className}/${id}`,
          queryParams
        );

        // Return null on 404
        if (response.status === 404) {
          return null;
        }

        if (response.status !== 200) {
          throw mapHttpError(response);
        }

        return deserializeObject(response.data);
      };

      const result = this.resilience
        ? await this.resilience.execute(executeFn)
        : await executeFn();

      span.end('ok');
      return result;
    } catch (error) {
      span.recordError(error as Error);
      span.end('error');
      throw error;
    }
  }

  // ==========================================================================
  // Update Object
  // ==========================================================================

  /**
   * Update an existing object
   *
   * @param className - Name of the class
   * @param id - Object UUID
   * @param properties - Properties to update
   * @param options - Update options
   * @returns Updated object
   */
  async updateObject(
    className: string,
    id: UUID,
    properties: Properties,
    options?: UpdateObjectOptions
  ): Promise<WeaviateObject> {
    const span = this.observability.tracer.startSpan(SpanNames.UPDATE_OBJECT, {
      [SpanAttributes.CLASS_NAME]: className,
      [SpanAttributes.TENANT]: options?.tenant ?? '',
    });

    try {
      // Build request body
      const requestBody = serializeUpdateRequest(
        className,
        id,
        properties,
        options?.vector
      );

      // Build query parameters
      const queryParams: ObjectQueryParams = {};
      if (options?.tenant) {
        queryParams.tenant = options.tenant;
      }

      // Determine HTTP method based on merge option
      const merge = options?.merge !== false; // Default to true

      // Execute with resilience
      const executeFn = async () => {
        const response = merge
          ? await this.transport.patch<ObjectApiResponse>(
              `/v1/objects/${className}/${id}`,
              requestBody,
              queryParams
            )
          : await this.transport.put<ObjectApiResponse>(
              `/v1/objects/${className}/${id}`,
              requestBody,
              queryParams
            );

        if (response.status !== 200) {
          throw mapHttpError(response);
        }

        return deserializeObject(response.data);
      };

      const result = this.resilience
        ? await this.resilience.execute(executeFn)
        : await executeFn();

      // Record success metrics
      this.observability.metrics.increment(
        `${MetricNames.OBJECT_UPDATE}.success`,
        1,
        { class_name: className }
      );

      span.end('ok');
      return result;
    } catch (error) {
      // Record error metrics
      this.observability.metrics.increment(
        `${MetricNames.OBJECT_UPDATE}.error`,
        1,
        {
          class_name: className,
          error_type: error instanceof Error ? error.constructor.name : 'unknown',
        }
      );

      span.recordError(error as Error);
      span.end('error');
      throw error;
    }
  }

  // ==========================================================================
  // Delete Object
  // ==========================================================================

  /**
   * Delete an object
   *
   * @param className - Name of the class
   * @param id - Object UUID
   * @param options - Delete options
   */
  async deleteObject(
    className: string,
    id: UUID,
    options?: DeleteObjectOptions
  ): Promise<void> {
    const span = this.observability.tracer.startSpan(SpanNames.DELETE_OBJECT, {
      [SpanAttributes.CLASS_NAME]: className,
      [SpanAttributes.TENANT]: options?.tenant ?? '',
    });

    try {
      // Build query parameters
      const queryParams: ObjectQueryParams = {};
      if (options?.tenant) {
        queryParams.tenant = options.tenant;
      }
      if (options?.consistencyLevel) {
        queryParams.consistency_level = options.consistencyLevel;
      }

      // Execute with resilience
      const executeFn = async () => {
        const response = await this.transport.delete<void>(
          `/v1/objects/${className}/${id}`,
          undefined,
          queryParams
        );

        // Handle 404 based on options
        if (response.status === 404) {
          if (!options?.ignoreNotFound) {
            throw new ObjectNotFoundError(className, id);
          }
          return;
        }

        if (response.status !== 204) {
          throw mapHttpError(response);
        }
      };

      if (this.resilience) {
        await this.resilience.execute(executeFn);
      } else {
        await executeFn();
      }

      // Record success metrics
      this.observability.metrics.increment(
        `${MetricNames.OBJECT_DELETE}.success`,
        1,
        { class_name: className }
      );

      span.end('ok');
    } catch (error) {
      // Record error metrics
      this.observability.metrics.increment(
        `${MetricNames.OBJECT_DELETE}.error`,
        1,
        {
          class_name: className,
          error_type: error instanceof Error ? error.constructor.name : 'unknown',
        }
      );

      span.recordError(error as Error);
      span.end('error');
      throw error;
    }
  }

  // ==========================================================================
  // Check Existence
  // ==========================================================================

  /**
   * Check if an object exists
   *
   * @param className - Name of the class
   * @param id - Object UUID
   * @param tenant - Optional tenant name
   * @returns True if object exists, false otherwise
   */
  async exists(
    className: string,
    id: UUID,
    tenant?: string
  ): Promise<boolean> {
    try {
      // Build query parameters
      const queryParams: ObjectQueryParams = {};
      if (tenant) {
        queryParams.tenant = tenant;
      }

      const response = await this.transport.head(
        `/v1/objects/${className}/${id}`,
        queryParams
      );

      // 204 = exists, 404 = not found
      return response.status === 204;
    } catch (error) {
      // Any error means it doesn't exist or we can't check
      return false;
    }
  }

  // ==========================================================================
  // Validate Object
  // ==========================================================================

  /**
   * Validate an object against the schema without creating it
   *
   * @param className - Name of the class
   * @param properties - Properties to validate
   * @param options - Validation options
   * @returns Validation result
   */
  async validate(
    className: string,
    properties: Properties,
    options?: ValidateObjectOptions
  ): Promise<ObjectValidationResult> {
    try {
      // Build request body
      const requestBody = {
        id: options?.id,
        class: className,
        properties: properties,
        vector: options?.vector,
      };

      const response = await this.transport.post<ValidateObjectResponse>(
        '/v1/objects/validate',
        requestBody
      );

      if (response.status !== 200) {
        throw mapHttpError(response);
      }

      // Parse validation response
      if (response.data.valid) {
        return {
          valid: true,
          errors: [],
        };
      } else {
        return {
          valid: false,
          errors: [
            {
              message: response.data.error?.message ?? 'Validation failed',
              code: 'VALIDATION_ERROR',
            },
          ],
        };
      }
    } catch (error) {
      // If validation endpoint fails, return error
      return {
        valid: false,
        errors: [
          {
            message:
              error instanceof Error
                ? error.message
                : 'Validation request failed',
            code: 'VALIDATION_REQUEST_FAILED',
          },
        ],
      };
    }
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * Generate a new UUID v4
   *
   * @returns UUID string
   */
  private generateUUID(): UUID {
    // Simple UUID v4 generation
    const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(
      /[xy]/g,
      (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      }
    );
    return uuid as UUID;
  }
}

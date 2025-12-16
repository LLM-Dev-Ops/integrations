/**
 * Field Transform Service for Google Cloud Firestore.
 *
 * Provides server-side field transformation operations following the SPARC specification.
 * Implements increment, arrayUnion, arrayRemove, serverTimestamp, deleteField, and applyTransforms.
 */

import type { FirestoreConfig } from "../config/index.js";
import type { GcpAuthProvider } from "../credentials/index.js";
import type { WriteResult, Precondition } from "../types/document.js";
import type { FieldValue } from "../types/field-value.js";
import type { HttpTransport, CircuitBreaker, MetricsEmitter, Tracer } from "./document.js";
import {
  FirestoreError,
  mapFirestoreError,
  isRetryableError,
  calculateBackoff,
  getRetryPolicy,
  InvalidArgumentError,
} from "../error/index.js";

/**
 * Field transform types.
 */
export type FieldTransform =
  | { type: "increment"; value: number }
  | { type: "maximum"; value: number }
  | { type: "minimum"; value: number }
  | { type: "arrayUnion"; elements: FieldValue[] }
  | { type: "arrayRemove"; elements: FieldValue[] }
  | { type: "serverTimestamp" }
  | { type: "deleteField" };

/**
 * Field transform service for Firestore server-side field transformations.
 */
export class FieldTransformService {
  private readonly config: FirestoreConfig;
  private readonly transport: HttpTransport;
  private readonly authProvider: GcpAuthProvider;
  private readonly circuitBreaker?: CircuitBreaker;
  private readonly metrics?: MetricsEmitter;
  private readonly tracer?: Tracer;

  constructor(
    config: FirestoreConfig,
    transport: HttpTransport,
    authProvider: GcpAuthProvider,
    options?: {
      circuitBreaker?: CircuitBreaker;
      metrics?: MetricsEmitter;
      tracer?: Tracer;
    }
  ) {
    this.config = config;
    this.transport = transport;
    this.authProvider = authProvider;
    this.circuitBreaker = options?.circuitBreaker;
    this.metrics = options?.metrics;
    this.tracer = options?.tracer;
  }

  /**
   * Atomically increment a numeric field.
   *
   * @param path - Document path
   * @param field - Field name
   * @param value - Increment value (positive or negative)
   * @returns Write result
   */
  async increment(
    path: string,
    field: string,
    value: number
  ): Promise<WriteResult> {
    return this.applyTransforms(path, [
      [field, { type: "increment", value }],
    ]);
  }

  /**
   * Add elements to an array field (union operation).
   *
   * Only adds elements that don't already exist in the array.
   *
   * @param path - Document path
   * @param field - Field name
   * @param elements - Elements to add
   * @returns Write result
   */
  async arrayUnion(
    path: string,
    field: string,
    elements: FieldValue[]
  ): Promise<WriteResult> {
    return this.applyTransforms(path, [
      [field, { type: "arrayUnion", elements }],
    ]);
  }

  /**
   * Remove elements from an array field.
   *
   * @param path - Document path
   * @param field - Field name
   * @param elements - Elements to remove
   * @returns Write result
   */
  async arrayRemove(
    path: string,
    field: string,
    elements: FieldValue[]
  ): Promise<WriteResult> {
    return this.applyTransforms(path, [
      [field, { type: "arrayRemove", elements }],
    ]);
  }

  /**
   * Set a field to the server timestamp.
   *
   * @param path - Document path
   * @param field - Field name
   * @returns Write result
   */
  async serverTimestamp(path: string, field: string): Promise<WriteResult> {
    return this.applyTransforms(path, [[field, { type: "serverTimestamp" }]]);
  }

  /**
   * Delete a field from a document.
   *
   * @param path - Document path
   * @param field - Field name
   * @returns Write result
   */
  async deleteField(path: string, field: string): Promise<WriteResult> {
    return this.applyTransforms(path, [[field, { type: "deleteField" }]]);
  }

  /**
   * Apply multiple field transforms atomically.
   *
   * @param path - Document path
   * @param transforms - Array of [field, transform] tuples
   * @returns Write result
   */
  async applyTransforms(
    path: string,
    transforms: Array<[string, FieldTransform]>
  ): Promise<WriteResult> {
    const span = this.tracer?.startSpan("firestore.field.transform", {
      path,
      transformCount: transforms.length,
    });
    const startTime = Date.now();

    try {
      this.validateDocumentPath(path);

      if (transforms.length === 0) {
        throw new InvalidArgumentError(
          "Must specify at least one field transform"
        );
      }

      const fullPath = this.buildDocumentPath(path);
      const endpoint = this.getEndpoint();
      const token = await this.authProvider.getAccessToken();
      const parent = `projects/${this.config.project_id}/databases/${this.config.database_id}/documents`;

      // Build field transforms
      const fieldTransforms = transforms.map(([fieldPath, transform]) => {
        const ft: any = {
          fieldPath,
        };

        switch (transform.type) {
          case "increment":
            ft.increment = this.toNumericValue(transform.value);
            break;

          case "maximum":
            ft.maximum = this.toNumericValue(transform.value);
            break;

          case "minimum":
            ft.minimum = this.toNumericValue(transform.value);
            break;

          case "arrayUnion":
            ft.appendMissingElements = { values: transform.elements };
            break;

          case "arrayRemove":
            ft.removeAllFromArray = { values: transform.elements };
            break;

          case "serverTimestamp":
            ft.setToServerValue = "REQUEST_TIME";
            break;

          case "deleteField":
            // For delete field, we need to use update with null
            ft.setToServerValue = "REQUEST_TIME"; // Placeholder
            break;

          default:
            throw new InvalidArgumentError(
              `Unknown transform type: ${(transform as any).type}`
            );
        }

        return ft;
      });

      // Build commit request with transform
      const writes = [
        {
          transform: {
            document: fullPath,
            fieldTransforms,
          },
        },
      ];

      const body = {
        writes,
      };

      const operation = async () => {
        const response = await this.transport.send({
          method: "POST",
          url: `${endpoint}/v1/${parent}:commit`,
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          timeout: this.config.request_timeout_ms,
        });

        if (response.status < 200 || response.status >= 300) {
          const errorBody = JSON.parse(response.body.toString());
          throw mapFirestoreError(errorBody, this.getRequestId(response));
        }

        const result = JSON.parse(response.body.toString());

        const { createTimestamp } = await import("../types/document.js");

        const writeResult: WriteResult = {
          update_time:
            result.writeResults?.[0]?.updateTime
              ? this.parseTimestamp(result.writeResults[0].updateTime)
              : createTimestamp(),
          transform_results: result.writeResults?.[0]?.transformResults,
        };

        return writeResult;
      };

      const result = this.circuitBreaker
        ? await this.circuitBreaker.execute(operation)
        : await this.retryOperation(operation);

      const duration = Date.now() - startTime;
      this.metrics?.increment("firestore.writes", 1, {
        operation: "transform",
      });
      this.metrics?.timing("firestore.latency", duration, {
        operation: "transform",
      });

      span?.setAttribute("transforms.count", transforms.length);
      span?.setStatus({ code: 0 });
      span?.end();

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.metrics?.increment("firestore.errors", 1, {
        operation: "transform",
      });
      this.metrics?.timing("firestore.latency", duration, {
        operation: "transform",
        status: "error",
      });

      span?.setStatus({
        code: 2,
        message: error instanceof Error ? error.message : String(error),
      });
      span?.end();

      throw error;
    }
  }

  // ========================================================================
  // Private Helper Methods
  // ========================================================================

  /**
   * Validate document path.
   */
  private validateDocumentPath(path: string): void {
    if (!path || path.trim().length === 0) {
      throw new InvalidArgumentError("Document path cannot be empty");
    }

    const segments = path.split("/").filter((s) => s.length > 0);
    if (segments.length % 2 !== 0) {
      throw new InvalidArgumentError(
        `Invalid document path: ${path}. Must have even number of segments`
      );
    }
  }

  /**
   * Build full document path.
   */
  private buildDocumentPath(path: string): string {
    if (path.startsWith("projects/")) {
      return path;
    }

    return `projects/${this.config.project_id}/databases/${this.config.database_id}/documents/${path}`;
  }

  /**
   * Get Firestore endpoint.
   */
  private getEndpoint(): string {
    if (this.config.endpoint) {
      return this.config.endpoint;
    }

    if (this.config.use_emulator) {
      return "http://localhost:8080";
    }

    return "https://firestore.googleapis.com";
  }

  /**
   * Get request ID from response headers.
   */
  private getRequestId(response: {
    headers: Record<string, string>;
  }): string | undefined {
    return (
      response.headers["x-goog-request-id"] ||
      response.headers["X-Goog-Request-Id"]
    );
  }

  /**
   * Convert number to Firestore numeric value.
   */
  private toNumericValue(value: number): any {
    if (Number.isInteger(value)) {
      return { integerValue: String(value) };
    }
    return { doubleValue: value };
  }

  /**
   * Parse timestamp from string.
   */
  private parseTimestamp(
    timestamp: string
  ): { seconds: number; nanos: number } {
    const date = new Date(timestamp);
    const milliseconds = date.getTime();
    return {
      seconds: Math.floor(milliseconds / 1000),
      nanos: (milliseconds % 1000) * 1_000_000,
    };
  }

  /**
   * Retry operation with exponential backoff.
   */
  private async retryOperation<T>(operation: () => Promise<T>): Promise<T> {
    const policy = getRetryPolicy(this.config);
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= policy.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        if (!isRetryableError(lastError) || attempt === policy.maxRetries) {
          throw error;
        }

        const delay = calculateBackoff(attempt, policy);
        await this.sleep(delay);
      }
    }

    throw lastError ?? new FirestoreError("Operation failed", "UNKNOWN", 2);
  }

  /**
   * Sleep for specified milliseconds.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

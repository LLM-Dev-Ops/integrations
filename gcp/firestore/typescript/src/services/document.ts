/**
 * Document Service for Google Cloud Firestore.
 *
 * Provides document CRUD operations following the SPARC specification.
 * Implements get, create, set, update, delete, and exists operations.
 */

import type { FirestoreConfig } from "../config/index.js";
import type { GcpAuthProvider } from "../credentials/index.js";
import type {
  DocumentSnapshot,
  WriteResult,
  Precondition,
  DocumentRef,
  createTimestamp,
  createDocumentSnapshot,
  formatDocumentPath,
  parseDocumentPath,
} from "../types/document.js";
import type {
  FieldValueMap,
  SetOptions,
  toFirestoreFields,
  fromFirestoreFields,
  validateDocumentDepth,
  validateFieldPath,
} from "../types/field-value.js";
import {
  FirestoreError,
  mapFirestoreError,
  isRetryableError,
  calculateBackoff,
  getRetryPolicy,
  NotFoundError,
  InvalidArgumentError,
} from "../error/index.js";

/**
 * HTTP transport interface for making requests.
 */
export interface HttpTransport {
  send(request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: string | Buffer;
    timeout?: number;
  }): Promise<{
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: Buffer;
  }>;
}

/**
 * Circuit breaker interface for fault tolerance.
 */
export interface CircuitBreaker {
  execute<T>(operation: () => Promise<T>): Promise<T>;
  getState(): string;
}

/**
 * Metrics emitter interface for observability.
 */
export interface MetricsEmitter {
  increment(name: string, value?: number, tags?: Record<string, string>): void;
  timing(name: string, duration: number, tags?: Record<string, string>): void;
  gauge(name: string, value: number, tags?: Record<string, string>): void;
}

/**
 * Tracer interface for distributed tracing.
 */
export interface Tracer {
  startSpan(name: string, attributes?: Record<string, unknown>): Span;
}

/**
 * Span interface for tracing.
 */
export interface Span {
  setAttribute(key: string, value: unknown): void;
  setStatus(status: { code: number; message?: string }): void;
  end(): void;
}

/**
 * Document service for Firestore document operations.
 */
export class DocumentService {
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
   * Get a document by path.
   *
   * @param path - Document path (e.g., "users/123" or full path)
   * @returns Document snapshot
   * @throws NotFoundError if document does not exist
   */
  async get(path: string): Promise<DocumentSnapshot> {
    const span = this.tracer?.startSpan("firestore.document.get", { path });
    const startTime = Date.now();

    try {
      this.validateDocumentPath(path);

      const fullPath = this.buildDocumentPath(path);
      const endpoint = this.getEndpoint();
      const token = await this.authProvider.getAccessToken();

      const operation = async () => {
        const response = await this.transport.send({
          method: "GET",
          url: `${endpoint}/v1/${fullPath}`,
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          timeout: this.config.request_timeout_ms,
        });

        if (response.status === 404) {
          throw new NotFoundError(`Document not found: ${path}`, { path });
        }

        if (response.status < 200 || response.status >= 300) {
          const errorBody = JSON.parse(response.body.toString());
          throw mapFirestoreError(errorBody, this.getRequestId(response));
        }

        const data = JSON.parse(response.body.toString());
        return this.parseDocumentSnapshot(data, path);
      };

      const result = this.circuitBreaker
        ? await this.circuitBreaker.execute(operation)
        : await this.retryOperation(operation);

      const duration = Date.now() - startTime;
      this.metrics?.increment("firestore.reads", 1, { operation: "get" });
      this.metrics?.timing("firestore.latency", duration, { operation: "get" });

      span?.setAttribute("document.exists", result.exists);
      span?.setStatus({ code: 0 });
      span?.end();

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.metrics?.increment("firestore.errors", 1, { operation: "get" });
      this.metrics?.timing("firestore.latency", duration, {
        operation: "get",
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

  /**
   * Create a new document (fails if it already exists).
   *
   * @param path - Document path
   * @param data - Document data
   * @returns Write result
   * @throws AlreadyExistsError if document exists
   */
  async create(path: string, data: FieldValueMap): Promise<WriteResult> {
    return this.set(path, data, { merge: false });
  }

  /**
   * Set a document (create or overwrite).
   *
   * @param path - Document path
   * @param data - Document data
   * @param options - Set options (merge, etc.)
   * @returns Write result
   */
  async set(
    path: string,
    data: FieldValueMap,
    options?: SetOptions
  ): Promise<WriteResult> {
    const span = this.tracer?.startSpan("firestore.document.set", {
      path,
      merge: options?.merge,
    });
    const startTime = Date.now();

    try {
      this.validateDocumentPath(path);
      this.validateDocumentData(data);

      const fullPath = this.buildDocumentPath(path);
      const endpoint = this.getEndpoint();
      const token = await this.authProvider.getAccessToken();

      // Import helper functions dynamically to avoid circular dependencies
      const { toFirestoreFields } = await import("../types/field-value.js");
      const fields = toFirestoreFields(data);

      const body: any = {
        fields,
      };

      // Build query parameters
      const params = new URLSearchParams();
      if (options?.merge) {
        params.set("updateMask.fieldPaths", "*");
      } else if (options?.mergeFields) {
        for (const field of options.mergeFields) {
          params.append("updateMask.fieldPaths", field);
        }
      }

      if (!options?.merge && !options?.mergeFields) {
        // Create mode - document must not exist
        params.set("currentDocument.exists", "false");
      }

      const url = `${endpoint}/v1/${fullPath}${
        params.toString() ? `?${params.toString()}` : ""
      }`;

      const operation = async () => {
        const response = await this.transport.send({
          method: "PATCH",
          url,
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

        return {
          update_time: result.updateTime
            ? this.parseTimestamp(result.updateTime)
            : createTimestamp(),
        };
      };

      const result = this.circuitBreaker
        ? await this.circuitBreaker.execute(operation)
        : await this.retryOperation(operation);

      const duration = Date.now() - startTime;
      this.metrics?.increment("firestore.writes", 1, { operation: "set" });
      this.metrics?.timing("firestore.latency", duration, { operation: "set" });

      span?.setStatus({ code: 0 });
      span?.end();

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.metrics?.increment("firestore.errors", 1, { operation: "set" });
      this.metrics?.timing("firestore.latency", duration, {
        operation: "set",
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

  /**
   * Update a document (must exist).
   *
   * @param path - Document path
   * @param updates - Fields to update
   * @param precondition - Optional precondition
   * @returns Write result
   * @throws NotFoundError if document does not exist
   */
  async update(
    path: string,
    updates: FieldValueMap,
    precondition?: Precondition
  ): Promise<WriteResult> {
    const span = this.tracer?.startSpan("firestore.document.update", { path });
    const startTime = Date.now();

    try {
      this.validateDocumentPath(path);
      if (Object.keys(updates).length === 0) {
        throw new InvalidArgumentError("Update must specify at least one field");
      }

      const fullPath = this.buildDocumentPath(path);
      const endpoint = this.getEndpoint();
      const token = await this.authProvider.getAccessToken();

      const { toFirestoreFields } = await import("../types/field-value.js");
      const fields = toFirestoreFields(updates);

      const body: any = {
        fields,
      };

      // Build query parameters with update mask
      const params = new URLSearchParams();
      for (const field of Object.keys(updates)) {
        params.append("updateMask.fieldPaths", field);
      }

      // Add precondition if specified
      if (precondition?.exists !== undefined) {
        params.set("currentDocument.exists", String(precondition.exists));
      } else if (precondition?.update_time) {
        params.set(
          "currentDocument.updateTime",
          this.formatTimestamp(precondition.update_time)
        );
      } else {
        // Default: document must exist for update
        params.set("currentDocument.exists", "true");
      }

      const url = `${endpoint}/v1/${fullPath}?${params.toString()}`;

      const operation = async () => {
        const response = await this.transport.send({
          method: "PATCH",
          url,
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

        return {
          update_time: result.updateTime
            ? this.parseTimestamp(result.updateTime)
            : createTimestamp(),
        };
      };

      const result = this.circuitBreaker
        ? await this.circuitBreaker.execute(operation)
        : await this.retryOperation(operation);

      const duration = Date.now() - startTime;
      this.metrics?.increment("firestore.writes", 1, { operation: "update" });
      this.metrics?.timing("firestore.latency", duration, {
        operation: "update",
      });

      span?.setStatus({ code: 0 });
      span?.end();

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.metrics?.increment("firestore.errors", 1, { operation: "update" });
      this.metrics?.timing("firestore.latency", duration, {
        operation: "update",
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

  /**
   * Delete a document.
   *
   * @param path - Document path
   * @param precondition - Optional precondition
   * @returns Write result
   */
  async delete(path: string, precondition?: Precondition): Promise<WriteResult> {
    const span = this.tracer?.startSpan("firestore.document.delete", { path });
    const startTime = Date.now();

    try {
      this.validateDocumentPath(path);

      const fullPath = this.buildDocumentPath(path);
      const endpoint = this.getEndpoint();
      const token = await this.authProvider.getAccessToken();

      // Build query parameters
      const params = new URLSearchParams();
      if (precondition?.exists !== undefined) {
        params.set("currentDocument.exists", String(precondition.exists));
      } else if (precondition?.update_time) {
        params.set(
          "currentDocument.updateTime",
          this.formatTimestamp(precondition.update_time)
        );
      }

      const url = `${endpoint}/v1/${fullPath}${
        params.toString() ? `?${params.toString()}` : ""
      }`;

      const operation = async () => {
        const response = await this.transport.send({
          method: "DELETE",
          url,
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          timeout: this.config.request_timeout_ms,
        });

        if (response.status < 200 || response.status >= 300) {
          const errorBody = JSON.parse(response.body.toString());
          throw mapFirestoreError(errorBody, this.getRequestId(response));
        }

        const { createTimestamp } = await import("../types/document.js");
        return {
          update_time: createTimestamp(),
        };
      };

      const result = this.circuitBreaker
        ? await this.circuitBreaker.execute(operation)
        : await this.retryOperation(operation);

      const duration = Date.now() - startTime;
      this.metrics?.increment("firestore.writes", 1, { operation: "delete" });
      this.metrics?.timing("firestore.latency", duration, {
        operation: "delete",
      });

      span?.setStatus({ code: 0 });
      span?.end();

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.metrics?.increment("firestore.errors", 1, { operation: "delete" });
      this.metrics?.timing("firestore.latency", duration, {
        operation: "delete",
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

  /**
   * Check if a document exists.
   *
   * @param path - Document path
   * @returns True if document exists
   */
  async exists(path: string): Promise<boolean> {
    try {
      const snapshot = await this.get(path);
      return snapshot.exists;
    } catch (error) {
      if (error instanceof NotFoundError) {
        return false;
      }
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

    // Path should have even number of segments (collection/doc pairs)
    const segments = path.split("/").filter((s) => s.length > 0);
    if (segments.length % 2 !== 0) {
      throw new InvalidArgumentError(
        `Invalid document path: ${path}. Must have even number of segments (collection/document pairs)`
      );
    }
  }

  /**
   * Validate document data.
   */
  private validateDocumentData(data: FieldValueMap): void {
    if (!data || typeof data !== "object") {
      throw new InvalidArgumentError("Document data must be a non-null object");
    }

    // Validate depth
    const { validateDocumentDepth } = require("../types/field-value.js");
    validateDocumentDepth(data, 20);
  }

  /**
   * Build full document path.
   */
  private buildDocumentPath(path: string): string {
    // If path is already full, return it
    if (path.startsWith("projects/")) {
      return path;
    }

    // Build full path
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
  private getRequestId(response: { headers: Record<string, string> }): string | undefined {
    return (
      response.headers["x-goog-request-id"] ||
      response.headers["X-Goog-Request-Id"]
    );
  }

  /**
   * Parse document snapshot from API response.
   */
  private parseDocumentSnapshot(data: any, path: string): DocumentSnapshot {
    const { fromFirestoreFields, createDocumentSnapshot, createDocumentRef, parseDocumentPath } =
      require("../types/index.js");

    const docPath = parseDocumentPath(data.name || this.buildDocumentPath(path));
    const ref = createDocumentRef(docPath);

    const snapshot: DocumentSnapshot = {
      reference: ref,
      exists: !!data.fields,
      data: data.fields ? fromFirestoreFields(data.fields) : null,
      create_time: data.createTime ? this.parseTimestamp(data.createTime) : undefined,
      update_time: data.updateTime ? this.parseTimestamp(data.updateTime) : undefined,
      read_time: this.parseTimestamp(data.readTime || new Date().toISOString()),
    };

    return snapshot;
  }

  /**
   * Parse timestamp from string.
   */
  private parseTimestamp(timestamp: string): { seconds: number; nanos: number } {
    const date = new Date(timestamp);
    const milliseconds = date.getTime();
    return {
      seconds: Math.floor(milliseconds / 1000),
      nanos: (milliseconds % 1000) * 1_000_000,
    };
  }

  /**
   * Format timestamp to string.
   */
  private formatTimestamp(timestamp: { seconds: number; nanos: number }): string {
    const milliseconds =
      timestamp.seconds * 1000 + Math.floor(timestamp.nanos / 1_000_000);
    return new Date(milliseconds).toISOString();
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

        // Don't retry if not retryable or last attempt
        if (!isRetryableError(lastError) || attempt === policy.maxRetries) {
          throw error;
        }

        // Calculate backoff delay
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

/**
 * Collection Service for Google Cloud Firestore.
 *
 * Provides collection operations following the SPARC specification.
 * Implements listDocuments, listCollections, add, and collectionGroup operations.
 */

import type { FirestoreConfig } from "../config/index.js";
import type { GcpAuthProvider } from "../credentials/index.js";
import type { DocumentSnapshot, DocumentRef } from "../types/document.js";
import type { FieldValueMap, ListOptions } from "../types/field-value.js";
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
 * Query builder interface for collection group queries.
 */
export interface QueryBuilder {
  where(field: string, op: string, value: unknown): QueryBuilder;
  orderBy(field: string, direction?: "asc" | "desc"): QueryBuilder;
  limit(limit: number): QueryBuilder;
  offset(offset: number): QueryBuilder;
  get(): Promise<DocumentSnapshot[]>;
}

/**
 * Collection service for Firestore collection operations.
 */
export class CollectionService {
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
   * List documents in a collection.
   *
   * @param collection - Collection path (e.g., "users" or "users/123/orders")
   * @param options - List options (pageSize, pageToken)
   * @returns Async iterator of document snapshots
   */
  async *listDocuments(
    collection: string,
    options?: ListOptions
  ): AsyncIterator<DocumentSnapshot> {
    const span = this.tracer?.startSpan("firestore.collection.listDocuments", {
      collection,
    });

    try {
      this.validateCollectionPath(collection);

      let pageToken = options?.pageToken;
      const pageSize = options?.pageSize || 100;

      do {
        const response = await this.fetchDocumentPage(
          collection,
          pageSize,
          pageToken
        );

        for (const doc of response.documents) {
          yield doc;
        }

        pageToken = response.nextPageToken;
      } while (pageToken);

      span?.setStatus({ code: 0 });
      span?.end();
    } catch (error) {
      span?.setStatus({
        code: 2,
        message: error instanceof Error ? error.message : String(error),
      });
      span?.end();

      throw error;
    }
  }

  /**
   * List subcollections of a document.
   *
   * @param documentPath - Document path (e.g., "users/123")
   * @returns Array of collection IDs
   */
  async listCollections(documentPath: string): Promise<string[]> {
    const span = this.tracer?.startSpan("firestore.collection.listCollections", {
      documentPath,
    });
    const startTime = Date.now();

    try {
      this.validateDocumentPath(documentPath);

      const fullPath = this.buildDocumentPath(documentPath);
      const endpoint = this.getEndpoint();
      const token = await this.authProvider.getAccessToken();

      const operation = async () => {
        const response = await this.transport.send({
          method: "GET",
          url: `${endpoint}/v1/${fullPath}:listCollectionIds`,
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
          timeout: this.config.request_timeout_ms,
        });

        if (response.status < 200 || response.status >= 300) {
          const errorBody = JSON.parse(response.body.toString());
          throw mapFirestoreError(errorBody, this.getRequestId(response));
        }

        const data = JSON.parse(response.body.toString());
        return data.collectionIds || [];
      };

      const result = this.circuitBreaker
        ? await this.circuitBreaker.execute(operation)
        : await this.retryOperation(operation);

      const duration = Date.now() - startTime;
      this.metrics?.increment("firestore.reads", 1, {
        operation: "listCollections",
      });
      this.metrics?.timing("firestore.latency", duration, {
        operation: "listCollections",
      });

      span?.setStatus({ code: 0 });
      span?.end();

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.metrics?.increment("firestore.errors", 1, {
        operation: "listCollections",
      });
      this.metrics?.timing("firestore.latency", duration, {
        operation: "listCollections",
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
   * Add a document to a collection with auto-generated ID.
   *
   * @param collection - Collection path
   * @param data - Document data
   * @returns Document reference of created document
   */
  async add(collection: string, data: FieldValueMap): Promise<DocumentRef> {
    const span = this.tracer?.startSpan("firestore.collection.add", {
      collection,
    });
    const startTime = Date.now();

    try {
      this.validateCollectionPath(collection);

      // Generate auto-ID (20 character alphanumeric)
      const documentId = this.generateAutoId();
      const documentPath = `${collection}/${documentId}`;

      const fullPath = this.buildDocumentPath(documentPath);
      const endpoint = this.getEndpoint();
      const token = await this.authProvider.getAccessToken();

      const { toFirestoreFields } = await import("../types/field-value.js");
      const fields = toFirestoreFields(data);

      const body = {
        fields,
      };

      const operation = async () => {
        const response = await this.transport.send({
          method: "PATCH",
          url: `${endpoint}/v1/${fullPath}?currentDocument.exists=false`,
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

        const { createDocumentRef, parseDocumentPath } = await import(
          "../types/document.js"
        );
        const docPath = parseDocumentPath(result.name);
        return createDocumentRef(docPath);
      };

      const result = this.circuitBreaker
        ? await this.circuitBreaker.execute(operation)
        : await this.retryOperation(operation);

      const duration = Date.now() - startTime;
      this.metrics?.increment("firestore.writes", 1, { operation: "add" });
      this.metrics?.timing("firestore.latency", duration, { operation: "add" });

      span?.setAttribute("document.id", documentId);
      span?.setStatus({ code: 0 });
      span?.end();

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.metrics?.increment("firestore.errors", 1, { operation: "add" });
      this.metrics?.timing("firestore.latency", duration, {
        operation: "add",
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
   * Create a collection group query builder.
   *
   * Collection group queries allow querying across all collections
   * with the same collection ID.
   *
   * @param collectionId - Collection ID to query across
   * @returns Query builder
   */
  collectionGroup(collectionId: string): QueryBuilder {
    this.validateCollectionId(collectionId);

    // Return a query builder for collection group queries
    return new CollectionGroupQueryBuilder(
      collectionId,
      this.config,
      this.transport,
      this.authProvider,
      {
        circuitBreaker: this.circuitBreaker,
        metrics: this.metrics,
        tracer: this.tracer,
      }
    );
  }

  // ========================================================================
  // Private Helper Methods
  // ========================================================================

  /**
   * Fetch a page of documents from a collection.
   */
  private async fetchDocumentPage(
    collection: string,
    pageSize: number,
    pageToken?: string
  ): Promise<{
    documents: DocumentSnapshot[];
    nextPageToken?: string;
  }> {
    const startTime = Date.now();

    const fullPath = this.buildCollectionPath(collection);
    const endpoint = this.getEndpoint();
    const token = await this.authProvider.getAccessToken();

    const params = new URLSearchParams();
    params.set("pageSize", String(pageSize));
    if (pageToken) {
      params.set("pageToken", pageToken);
    }

    const operation = async () => {
      const response = await this.transport.send({
        method: "GET",
        url: `${endpoint}/v1/${fullPath}?${params.toString()}`,
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

      const data = JSON.parse(response.body.toString());

      const { fromFirestoreFields, createDocumentRef, parseDocumentPath } =
        await import("../types/index.js");

      const documents: DocumentSnapshot[] = (data.documents || []).map(
        (doc: any) => {
          const docPath = parseDocumentPath(doc.name);
          const ref = createDocumentRef(docPath);

          return {
            reference: ref,
            exists: !!doc.fields,
            data: doc.fields ? fromFirestoreFields(doc.fields) : null,
            create_time: doc.createTime
              ? this.parseTimestamp(doc.createTime)
              : undefined,
            update_time: doc.updateTime
              ? this.parseTimestamp(doc.updateTime)
              : undefined,
            read_time: this.parseTimestamp(
              doc.readTime || new Date().toISOString()
            ),
          };
        }
      );

      return {
        documents,
        nextPageToken: data.nextPageToken,
      };
    };

    const result = this.circuitBreaker
      ? await this.circuitBreaker.execute(operation)
      : await this.retryOperation(operation);

    const duration = Date.now() - startTime;
    this.metrics?.increment("firestore.reads", result.documents.length, {
      operation: "list",
    });
    this.metrics?.timing("firestore.latency", duration, { operation: "list" });

    return result;
  }

  /**
   * Validate collection path.
   */
  private validateCollectionPath(path: string): void {
    if (!path || path.trim().length === 0) {
      throw new InvalidArgumentError("Collection path cannot be empty");
    }

    // Collection path should have odd number of segments
    const segments = path.split("/").filter((s) => s.length > 0);
    if (segments.length % 2 !== 1) {
      throw new InvalidArgumentError(
        `Invalid collection path: ${path}. Must have odd number of segments`
      );
    }
  }

  /**
   * Validate document path.
   */
  private validateDocumentPath(path: string): void {
    if (!path || path.trim().length === 0) {
      throw new InvalidArgumentError("Document path cannot be empty");
    }

    // Document path should have even number of segments
    const segments = path.split("/").filter((s) => s.length > 0);
    if (segments.length % 2 !== 0) {
      throw new InvalidArgumentError(
        `Invalid document path: ${path}. Must have even number of segments`
      );
    }
  }

  /**
   * Validate collection ID.
   */
  private validateCollectionId(id: string): void {
    if (!id || id.trim().length === 0) {
      throw new InvalidArgumentError("Collection ID cannot be empty");
    }

    if (id.includes("/")) {
      throw new InvalidArgumentError(
        `Invalid collection ID: ${id}. Cannot contain slashes`
      );
    }
  }

  /**
   * Build full collection path.
   */
  private buildCollectionPath(path: string): string {
    if (path.startsWith("projects/")) {
      return path;
    }

    return `projects/${this.config.project_id}/databases/${this.config.database_id}/documents/${path}`;
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
   * Generate auto-ID for documents (20 character alphanumeric).
   */
  private generateAutoId(): string {
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let autoId = "";

    for (let i = 0; i < 20; i++) {
      autoId += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return autoId;
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

/**
 * Collection group query builder implementation.
 */
class CollectionGroupQueryBuilder implements QueryBuilder {
  private collectionId: string;
  private config: FirestoreConfig;
  private transport: HttpTransport;
  private authProvider: GcpAuthProvider;
  private circuitBreaker?: CircuitBreaker;
  private metrics?: MetricsEmitter;
  private tracer?: Tracer;
  private filters: any[] = [];
  private orderByFields: Array<{ field: string; direction: "asc" | "desc" }> =
    [];
  private limitValue?: number;
  private offsetValue?: number;

  constructor(
    collectionId: string,
    config: FirestoreConfig,
    transport: HttpTransport,
    authProvider: GcpAuthProvider,
    options?: {
      circuitBreaker?: CircuitBreaker;
      metrics?: MetricsEmitter;
      tracer?: Tracer;
    }
  ) {
    this.collectionId = collectionId;
    this.config = config;
    this.transport = transport;
    this.authProvider = authProvider;
    this.circuitBreaker = options?.circuitBreaker;
    this.metrics = options?.metrics;
    this.tracer = options?.tracer;
  }

  where(field: string, op: string, value: unknown): QueryBuilder {
    this.filters.push({ field, op, value });
    return this;
  }

  orderBy(field: string, direction: "asc" | "desc" = "asc"): QueryBuilder {
    this.orderByFields.push({ field, direction });
    return this;
  }

  limit(limit: number): QueryBuilder {
    this.limitValue = limit;
    return this;
  }

  offset(offset: number): QueryBuilder {
    this.offsetValue = offset;
    return this;
  }

  async get(): Promise<DocumentSnapshot[]> {
    const span = this.tracer?.startSpan("firestore.collectionGroup.query", {
      collectionId: this.collectionId,
    });

    try {
      const parent = `projects/${this.config.project_id}/databases/${this.config.database_id}/documents`;
      const endpoint = this.config.endpoint || "https://firestore.googleapis.com";
      const token = await this.authProvider.getAccessToken();

      // Build structured query
      const query: any = {
        from: [
          {
            collectionId: this.collectionId,
            allDescendants: true,
          },
        ],
      };

      if (this.filters.length > 0) {
        // Add filters (simplified - would need full implementation)
        query.where = this.buildFilter();
      }

      if (this.orderByFields.length > 0) {
        query.orderBy = this.orderByFields.map((ob) => ({
          field: { fieldPath: ob.field },
          direction: ob.direction === "asc" ? "ASCENDING" : "DESCENDING",
        }));
      }

      if (this.limitValue) {
        query.limit = this.limitValue;
      }

      if (this.offsetValue) {
        query.offset = this.offsetValue;
      }

      const body = {
        structuredQuery: query,
      };

      const response = await this.transport.send({
        method: "POST",
        url: `${endpoint}/v1/${parent}:runQuery`,
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        timeout: this.config.request_timeout_ms,
      });

      if (response.status < 200 || response.status >= 300) {
        const errorBody = JSON.parse(response.body.toString());
        throw mapFirestoreError(errorBody);
      }

      const data = JSON.parse(response.body.toString());
      const { fromFirestoreFields, createDocumentRef, parseDocumentPath } =
        await import("../types/index.js");

      const documents: DocumentSnapshot[] = (data.documents || []).map(
        (doc: any) => {
          const docPath = parseDocumentPath(doc.name);
          const ref = createDocumentRef(docPath);

          return {
            reference: ref,
            exists: !!doc.fields,
            data: doc.fields ? fromFirestoreFields(doc.fields) : null,
            create_time: doc.createTime
              ? this.parseTimestamp(doc.createTime)
              : undefined,
            update_time: doc.updateTime
              ? this.parseTimestamp(doc.updateTime)
              : undefined,
            read_time: this.parseTimestamp(
              doc.readTime || new Date().toISOString()
            ),
          };
        }
      );

      span?.setStatus({ code: 0 });
      span?.end();

      return documents;
    } catch (error) {
      span?.setStatus({
        code: 2,
        message: error instanceof Error ? error.message : String(error),
      });
      span?.end();

      throw error;
    }
  }

  private buildFilter(): any {
    // Simplified filter building - full implementation would handle all operators
    if (this.filters.length === 1) {
      const filter = this.filters[0];
      return {
        fieldFilter: {
          field: { fieldPath: filter.field },
          op: this.mapOperator(filter.op),
          value: this.toFieldValue(filter.value),
        },
      };
    }

    // Multiple filters - combine with AND
    return {
      compositeFilter: {
        op: "AND",
        filters: this.filters.map((f) => ({
          fieldFilter: {
            field: { fieldPath: f.field },
            op: this.mapOperator(f.op),
            value: this.toFieldValue(f.value),
          },
        })),
      },
    };
  }

  private mapOperator(op: string): string {
    const opMap: Record<string, string> = {
      "==": "EQUAL",
      "!=": "NOT_EQUAL",
      "<": "LESS_THAN",
      "<=": "LESS_THAN_OR_EQUAL",
      ">": "GREATER_THAN",
      ">=": "GREATER_THAN_OR_EQUAL",
      "in": "IN",
      "not-in": "NOT_IN",
      "array-contains": "ARRAY_CONTAINS",
      "array-contains-any": "ARRAY_CONTAINS_ANY",
    };

    return opMap[op] || "EQUAL";
  }

  private toFieldValue(value: unknown): any {
    if (value === null) return { nullValue: null };
    if (typeof value === "boolean") return { booleanValue: value };
    if (typeof value === "number")
      return Number.isInteger(value)
        ? { integerValue: String(value) }
        : { doubleValue: value };
    if (typeof value === "string") return { stringValue: value };
    if (Array.isArray(value))
      return { arrayValue: { values: value.map((v) => this.toFieldValue(v)) } };
    return { stringValue: String(value) };
  }

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
}

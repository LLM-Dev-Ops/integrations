/**
 * Firestore Transaction Service
 *
 * Provides transaction management with automatic retry on ABORTED errors.
 * Following the SPARC specification for Google Firestore integration.
 */

import { DocumentSnapshot, FieldValueMap, Timestamp } from './query.js';

/**
 * Transaction options.
 */
export interface TransactionOptions {
  /** Maximum number of retry attempts on ABORTED (default: 5) */
  maxAttempts?: number;
  /** Whether the transaction is read-only (default: false) */
  readOnly?: boolean;
  /** Read time for read-only transactions */
  readTime?: Timestamp;
}

/**
 * Firestore error codes.
 */
export enum FirestoreErrorCode {
  ABORTED = 'ABORTED',
  ALREADY_EXISTS = 'ALREADY_EXISTS',
  CANCELLED = 'CANCELLED',
  DATA_LOSS = 'DATA_LOSS',
  DEADLINE_EXCEEDED = 'DEADLINE_EXCEEDED',
  FAILED_PRECONDITION = 'FAILED_PRECONDITION',
  INTERNAL = 'INTERNAL',
  INVALID_ARGUMENT = 'INVALID_ARGUMENT',
  NOT_FOUND = 'NOT_FOUND',
  OUT_OF_RANGE = 'OUT_OF_RANGE',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  RESOURCE_EXHAUSTED = 'RESOURCE_EXHAUSTED',
  UNAUTHENTICATED = 'UNAUTHENTICATED',
  UNAVAILABLE = 'UNAVAILABLE',
  UNIMPLEMENTED = 'UNIMPLEMENTED',
  UNKNOWN = 'UNKNOWN',
}

/**
 * Firestore error.
 */
export class FirestoreError extends Error {
  constructor(
    public readonly code: FirestoreErrorCode,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'FirestoreError';
    Object.setPrototypeOf(this, FirestoreError.prototype);
  }
}

/**
 * Transaction interface passed to user function.
 */
export interface Transaction {
  /**
   * Read a document within the transaction.
   *
   * @param path - Document path
   * @returns Document snapshot
   */
  get(path: string): Promise<DocumentSnapshot>;

  /**
   * Write a document within the transaction.
   * The write is buffered and applied on commit.
   *
   * @param path - Document path
   * @param data - Document data
   */
  set(path: string, data: FieldValueMap): void;

  /**
   * Update a document within the transaction.
   * The update is buffered and applied on commit.
   *
   * @param path - Document path
   * @param updates - Field updates
   */
  update(path: string, updates: FieldValueMap): void;

  /**
   * Delete a document within the transaction.
   * The delete is buffered and applied on commit.
   *
   * @param path - Document path
   */
  delete(path: string): void;
}

/**
 * Buffered write operation.
 */
interface BufferedWrite {
  type: 'set' | 'update' | 'delete';
  path: string;
  data?: FieldValueMap;
}

/**
 * Transaction implementation.
 */
class TransactionImpl implements Transaction {
  private transactionId: string;
  private writes: BufferedWrite[] = [];
  private readonly service: TransactionService;

  constructor(transactionId: string, service: TransactionService) {
    this.transactionId = transactionId;
    this.service = service;
  }

  /**
   * Get the transaction ID.
   */
  getTransactionId(): string {
    return this.transactionId;
  }

  /**
   * Get buffered writes.
   */
  getWrites(): BufferedWrite[] {
    return this.writes;
  }

  /**
   * Read a document within the transaction.
   */
  async get(path: string): Promise<DocumentSnapshot> {
    this.validateDocumentPath(path);
    return this.service.getDocumentInTransaction(path, this.transactionId);
  }

  /**
   * Write a document within the transaction.
   */
  set(path: string, data: FieldValueMap): void {
    this.validateDocumentPath(path);
    this.writes.push({
      type: 'set',
      path,
      data,
    });
  }

  /**
   * Update a document within the transaction.
   */
  update(path: string, updates: FieldValueMap): void {
    this.validateDocumentPath(path);
    this.writes.push({
      type: 'update',
      path,
      data: updates,
    });
  }

  /**
   * Delete a document within the transaction.
   */
  delete(path: string): void {
    this.validateDocumentPath(path);
    this.writes.push({
      type: 'delete',
      path,
    });
  }

  /**
   * Validate document path format.
   */
  private validateDocumentPath(path: string): void {
    if (!path) {
      throw new Error('Document path cannot be empty');
    }

    const parts = path.split('/');
    if (parts.length % 2 !== 0) {
      throw new Error(`Invalid document path: ${path} (must have even number of segments)`);
    }
  }
}

/**
 * Observability interface for metrics and logging.
 */
export interface TransactionObservability {
  /** Metrics reporter */
  metrics?: {
    increment(name: string, value?: number, tags?: Record<string, string>): void;
    timing(name: string, durationMs: number, tags?: Record<string, string>): void;
  };
  /** Logger */
  logger?: {
    debug(message: string, context?: Record<string, unknown>): void;
    info(message: string, context?: Record<string, unknown>): void;
    warn(message: string, context?: Record<string, unknown>): void;
    error(message: string, context?: Record<string, unknown>): void;
  };
}

/**
 * Transaction service for managing Firestore transactions.
 */
export class TransactionService {
  private readonly observability?: TransactionObservability;

  constructor(observability?: TransactionObservability) {
    this.observability = observability;
  }

  /**
   * Run a function within a transaction with automatic retry on ABORTED.
   *
   * @param fn - Function to execute within transaction
   * @param options - Transaction options
   * @returns Result of the function
   */
  async runTransaction<T>(
    fn: (tx: Transaction) => Promise<T>,
    options?: TransactionOptions
  ): Promise<T> {
    const maxAttempts = options?.maxAttempts || 5;
    const readOnly = options?.readOnly || false;

    let attempt = 0;
    let lastError: Error | undefined;

    while (attempt < maxAttempts) {
      attempt++;

      const startTime = Date.now();

      try {
        this.observability?.logger?.debug('Starting transaction attempt', {
          attempt,
          maxAttempts,
          readOnly,
        });

        // Begin transaction
        const transactionId = await this.beginTransaction(readOnly, options?.readTime);

        this.observability?.logger?.debug('Transaction started', {
          transactionId,
          attempt,
        });

        // Create transaction object
        const tx = new TransactionImpl(transactionId, this);

        // Execute user function
        const result = await fn(tx);

        // Commit transaction with buffered writes
        await this.commitTransaction(transactionId, tx.getWrites());

        const duration = Date.now() - startTime;

        this.observability?.metrics?.increment('firestore.transactions', 1, {
          status: 'success',
          attempt: attempt.toString(),
        });

        this.observability?.metrics?.timing('firestore.transaction.duration', duration, {
          status: 'success',
        });

        this.observability?.logger?.info('Transaction committed successfully', {
          transactionId,
          attempt,
          durationMs: duration,
        });

        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if error is ABORTED (retriable)
        if (error instanceof FirestoreError && error.code === FirestoreErrorCode.ABORTED) {
          this.observability?.logger?.warn('Transaction aborted, retrying', {
            attempt,
            maxAttempts,
            error: lastError.message,
          });

          this.observability?.metrics?.increment('firestore.transactions', 1, {
            status: 'aborted',
            attempt: attempt.toString(),
          });

          // Exponential backoff before retry
          if (attempt < maxAttempts) {
            const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
            await this.sleep(backoffMs);
            continue;
          }
        }

        // Non-retriable error or max attempts reached
        this.observability?.metrics?.increment('firestore.transactions', 1, {
          status: 'failed',
          attempt: attempt.toString(),
          error: error instanceof FirestoreError ? error.code : 'unknown',
        });

        this.observability?.metrics?.timing('firestore.transaction.duration', duration, {
          status: 'failed',
        });

        this.observability?.logger?.error('Transaction failed', {
          attempt,
          error: lastError.message,
          stack: lastError.stack,
        });

        throw lastError;
      }
    }

    // Max attempts reached
    throw new Error(
      `Transaction failed after ${maxAttempts} attempts: ${lastError?.message || 'Unknown error'}`
    );
  }

  /**
   * Run a read-only transaction.
   *
   * Read-only transactions provide consistent reads but cannot write.
   * They are more efficient as they don't acquire locks.
   *
   * @param fn - Function to execute within read-only transaction
   * @returns Result of the function
   */
  async runReadOnlyTransaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.runTransaction(fn, { readOnly: true });
  }

  /**
   * Begin a new transaction.
   *
   * @param readOnly - Whether the transaction is read-only
   * @param readTime - Optional read time for read-only transactions
   * @returns Transaction ID
   */
  private async beginTransaction(readOnly: boolean, readTime?: Timestamp): Promise<string> {
    // Build gRPC BeginTransaction request
    const request = {
      options: readOnly
        ? {
            readOnly: readTime
              ? { readTime: this.serializeTimestamp(readTime) }
              : {},
          }
        : {
            readWrite: {},
          },
    };

    // Execute gRPC call
    // Note: This is a placeholder for the actual gRPC call
    const response = await this.executeGrpcBeginTransaction(request);

    return response.transactionId;
  }

  /**
   * Commit a transaction with buffered writes.
   *
   * @param transactionId - Transaction ID
   * @param writes - Buffered writes to apply
   */
  private async commitTransaction(
    transactionId: string,
    writes: BufferedWrite[]
  ): Promise<void> {
    // Build gRPC Commit request
    const request = {
      transaction: transactionId,
      writes: writes.map(w => this.serializeWrite(w)),
    };

    // Execute gRPC call
    // Note: This is a placeholder for the actual gRPC call
    await this.executeGrpcCommit(request);
  }

  /**
   * Get a document within a transaction.
   *
   * @param path - Document path
   * @param transactionId - Transaction ID
   * @returns Document snapshot
   */
  async getDocumentInTransaction(
    path: string,
    transactionId: string
  ): Promise<DocumentSnapshot> {
    // Build gRPC GetDocument request with transaction
    const request = {
      name: path,
      transaction: transactionId,
    };

    // Execute gRPC call
    // Note: This is a placeholder for the actual gRPC call
    const response = await this.executeGrpcGetDocument(request);

    return response;
  }

  /**
   * Serialize a write operation to gRPC format.
   */
  private serializeWrite(write: BufferedWrite): unknown {
    switch (write.type) {
      case 'set':
        return {
          update: {
            name: write.path,
            fields: this.serializeFields(write.data!),
          },
        };
      case 'update':
        return {
          update: {
            name: write.path,
            fields: this.serializeFields(write.data!),
          },
          updateMask: {
            fieldPaths: Object.keys(write.data!),
          },
        };
      case 'delete':
        return {
          delete: write.path,
        };
    }
  }

  /**
   * Serialize field map to Firestore format.
   */
  private serializeFields(data: FieldValueMap): unknown {
    const fields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      fields[key] = this.serializeValue(value);
    }
    return fields;
  }

  /**
   * Serialize a value to Firestore Value format.
   */
  private serializeValue(value: unknown): unknown {
    if (value === null) {
      return { nullValue: 'NULL_VALUE' };
    }
    if (typeof value === 'boolean') {
      return { booleanValue: value };
    }
    if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        return { integerValue: value.toString() };
      }
      return { doubleValue: value };
    }
    if (typeof value === 'string') {
      return { stringValue: value };
    }
    if (Array.isArray(value)) {
      return {
        arrayValue: {
          values: value.map(v => this.serializeValue(v)),
        },
      };
    }
    if (typeof value === 'object') {
      const fields: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        fields[k] = this.serializeValue(v);
      }
      return {
        mapValue: { fields },
      };
    }
    throw new Error(`Unsupported value type: ${typeof value}`);
  }

  /**
   * Serialize timestamp to gRPC format.
   */
  private serializeTimestamp(timestamp: Timestamp): unknown {
    return {
      seconds: timestamp.seconds.toString(),
      nanos: timestamp.nanos,
    };
  }

  /**
   * Sleep for a specified duration.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Execute gRPC BeginTransaction (placeholder).
   */
  private async executeGrpcBeginTransaction(_request: unknown): Promise<{ transactionId: string }> {
    // Placeholder: In production, this would use the Firestore gRPC client
    throw new Error('Not implemented: gRPC integration required');
  }

  /**
   * Execute gRPC Commit (placeholder).
   */
  private async executeGrpcCommit(_request: unknown): Promise<void> {
    // Placeholder: In production, this would use the Firestore gRPC client
    throw new Error('Not implemented: gRPC integration required');
  }

  /**
   * Execute gRPC GetDocument (placeholder).
   */
  private async executeGrpcGetDocument(_request: unknown): Promise<DocumentSnapshot> {
    // Placeholder: In production, this would use the Firestore gRPC client
    throw new Error('Not implemented: gRPC integration required');
  }
}

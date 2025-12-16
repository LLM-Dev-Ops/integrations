/**
 * Firestore Listener Service
 *
 * Provides real-time listeners for documents, collections, and queries.
 * Handles reconnection with exponential backoff and resume tokens.
 * Following the SPARC specification for Google Firestore integration.
 */

import { DocumentSnapshot, Query, QuerySnapshot } from './query.js';
import { FirestoreError, FirestoreErrorCode } from './transaction.js';

/**
 * Listener callback for document changes.
 */
export type ListenerCallback = (
  snapshot: DocumentSnapshot,
  error?: FirestoreError
) => void;

/**
 * Listener callback for query changes.
 */
export type QueryListenerCallback = (
  snapshot: QuerySnapshot,
  error?: FirestoreError
) => void;

/**
 * Listener registration handle.
 */
export interface ListenerRegistration {
  /** Unique listener ID */
  id: string;
  /** Unsubscribe from the listener */
  unsubscribe(): void;
}

/**
 * Resume token for continuing listener stream.
 */
export interface ResumeToken {
  /** Opaque token data */
  data: Uint8Array;
}

/**
 * Listener configuration from global config.
 */
export interface ListenerConfig {
  /** Maximum number of active listeners (default: 100) */
  maxListeners?: number;
  /** Initial reconnect delay in milliseconds (default: 1000) */
  initialReconnectDelay?: number;
  /** Maximum reconnect delay in milliseconds (default: 30000) */
  maxReconnectDelay?: number;
  /** Reconnect backoff multiplier (default: 2) */
  reconnectBackoffMultiplier?: number;
}

/**
 * Internal listener state.
 */
interface ListenerState {
  /** Listener ID */
  id: string;
  /** Listener type */
  type: 'document' | 'collection' | 'query';
  /** Target (document path, collection path, or query) */
  target: string | Query;
  /** User callback */
  callback: ListenerCallback | QueryListenerCallback;
  /** Current resume token */
  resumeToken?: ResumeToken;
  /** Whether listener is currently active */
  active: boolean;
  /** Number of reconnect attempts */
  reconnectAttempts: number;
  /** Reconnect timeout handle */
  reconnectTimeout?: NodeJS.Timeout;
}

/**
 * Observability interface for metrics and logging.
 */
export interface ListenerObservability {
  /** Metrics reporter */
  metrics?: {
    increment(name: string, value?: number, tags?: Record<string, string>): void;
    gauge(name: string, value: number, tags?: Record<string, string>): void;
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
 * Listener service for real-time updates.
 */
export class ListenerService {
  private readonly config: ListenerConfig;
  private readonly observability?: ListenerObservability;
  private readonly listeners: Map<string, ListenerState> = new Map();
  private nextListenerId = 1;

  constructor(config?: ListenerConfig, observability?: ListenerObservability) {
    this.config = {
      maxListeners: config?.maxListeners || 100,
      initialReconnectDelay: config?.initialReconnectDelay || 1000,
      maxReconnectDelay: config?.maxReconnectDelay || 30000,
      reconnectBackoffMultiplier: config?.reconnectBackoffMultiplier || 2,
    };
    this.observability = observability;

    // Report initial active listener count
    this.updateActiveListenerMetric();
  }

  /**
   * Listen to a single document for changes.
   *
   * @param path - Document path
   * @param callback - Callback invoked on document changes or errors
   * @returns Listener registration
   */
  listenDocument(path: string, callback: ListenerCallback): ListenerRegistration {
    this.validateDocumentPath(path);
    this.checkListenerLimit();

    const id = this.generateListenerId();

    this.observability?.logger?.debug('Creating document listener', {
      id,
      path,
    });

    const state: ListenerState = {
      id,
      type: 'document',
      target: path,
      callback,
      active: true,
      reconnectAttempts: 0,
    };

    this.listeners.set(id, state);
    this.updateActiveListenerMetric();

    // Start listening
    this.startDocumentListener(state);

    return {
      id,
      unsubscribe: () => this.unsubscribe({ id, unsubscribe: () => {} }),
    };
  }

  /**
   * Listen to a collection for changes.
   *
   * @param collection - Collection path
   * @param callback - Callback invoked on collection changes or errors
   * @returns Listener registration
   */
  listenCollection(collection: string, callback: ListenerCallback): ListenerRegistration {
    this.validateCollectionPath(collection);
    this.checkListenerLimit();

    const id = this.generateListenerId();

    this.observability?.logger?.debug('Creating collection listener', {
      id,
      collection,
    });

    const state: ListenerState = {
      id,
      type: 'collection',
      target: collection,
      callback,
      active: true,
      reconnectAttempts: 0,
    };

    this.listeners.set(id, state);
    this.updateActiveListenerMetric();

    // Start listening
    this.startCollectionListener(state);

    return {
      id,
      unsubscribe: () => this.unsubscribe({ id, unsubscribe: () => {} }),
    };
  }

  /**
   * Listen to a query for changes.
   *
   * @param query - Query specification
   * @param callback - Callback invoked on query result changes or errors
   * @returns Listener registration
   */
  listenQuery(query: Query, callback: QueryListenerCallback): ListenerRegistration {
    this.validateQuery(query);
    this.checkListenerLimit();

    const id = this.generateListenerId();

    this.observability?.logger?.debug('Creating query listener', {
      id,
      query,
    });

    const state: ListenerState = {
      id,
      type: 'query',
      target: query,
      callback,
      active: true,
      reconnectAttempts: 0,
    };

    this.listeners.set(id, state);
    this.updateActiveListenerMetric();

    // Start listening
    this.startQueryListener(state);

    return {
      id,
      unsubscribe: () => this.unsubscribe({ id, unsubscribe: () => {} }),
    };
  }

  /**
   * Unsubscribe from a listener.
   *
   * @param registration - Listener registration to unsubscribe
   */
  unsubscribe(registration: ListenerRegistration): void {
    const state = this.listeners.get(registration.id);
    if (!state) {
      return; // Already unsubscribed
    }

    this.observability?.logger?.debug('Unsubscribing listener', {
      id: registration.id,
      type: state.type,
    });

    // Mark as inactive
    state.active = false;

    // Cancel any pending reconnect
    if (state.reconnectTimeout) {
      clearTimeout(state.reconnectTimeout);
    }

    // Remove from active listeners
    this.listeners.delete(registration.id);
    this.updateActiveListenerMetric();

    // Stop the gRPC stream
    this.stopListener(state);

    this.observability?.logger?.info('Listener unsubscribed', {
      id: registration.id,
      type: state.type,
    });
  }

  /**
   * Start a document listener.
   */
  private startDocumentListener(state: ListenerState): void {
    const path = state.target as string;

    this.observability?.logger?.debug('Starting document listener stream', {
      id: state.id,
      path,
      resumeToken: state.resumeToken ? 'present' : 'none',
    });

    // Build gRPC Listen request for document
    const request = {
      addTarget: {
        documents: {
          documents: [path],
        },
        targetId: state.id,
        resumeToken: state.resumeToken?.data,
      },
    };

    // Start gRPC stream
    this.executeGrpcListen(
      request,
      state,
      (snapshot: DocumentSnapshot) => {
        if (state.active) {
          (state.callback as ListenerCallback)(snapshot);
        }
      }
    );
  }

  /**
   * Start a collection listener.
   */
  private startCollectionListener(state: ListenerState): void {
    const collection = state.target as string;

    this.observability?.logger?.debug('Starting collection listener stream', {
      id: state.id,
      collection,
      resumeToken: state.resumeToken ? 'present' : 'none',
    });

    // Build gRPC Listen request for collection
    const request = {
      addTarget: {
        query: {
          parent: this.getParentPath(collection),
          structuredQuery: {
            from: [{ collectionId: this.getCollectionId(collection) }],
          },
        },
        targetId: state.id,
        resumeToken: state.resumeToken?.data,
      },
    };

    // Start gRPC stream
    this.executeGrpcListen(
      request,
      state,
      (snapshot: DocumentSnapshot) => {
        if (state.active) {
          (state.callback as ListenerCallback)(snapshot);
        }
      }
    );
  }

  /**
   * Start a query listener.
   */
  private startQueryListener(state: ListenerState): void {
    const query = state.target as Query;

    this.observability?.logger?.debug('Starting query listener stream', {
      id: state.id,
      query,
      resumeToken: state.resumeToken ? 'present' : 'none',
    });

    // Build gRPC Listen request for query
    const request = {
      addTarget: {
        query: {
          parent: this.getParentPath(query.collection),
          structuredQuery: this.buildStructuredQuery(query),
        },
        targetId: state.id,
        resumeToken: state.resumeToken?.data,
      },
    };

    // Start gRPC stream
    this.executeGrpcListenQuery(
      request,
      state,
      (snapshot: QuerySnapshot) => {
        if (state.active) {
          (state.callback as QueryListenerCallback)(snapshot);
        }
      }
    );
  }

  /**
   * Handle listener error and schedule reconnect if appropriate.
   */
  private handleListenerError(state: ListenerState, error: FirestoreError): void {
    if (!state.active) {
      return; // Listener was unsubscribed
    }

    this.observability?.logger?.warn('Listener error occurred', {
      id: state.id,
      type: state.type,
      code: error.code,
      message: error.message,
      reconnectAttempts: state.reconnectAttempts,
    });

    // Notify user callback
    if (state.type === 'query') {
      (state.callback as QueryListenerCallback)(
        { documents: [], changes: [], metadata: { hasPendingWrites: false, fromCache: true } },
        error
      );
    } else {
      (state.callback as ListenerCallback)(
        {
          path: '',
          id: '',
          data: {},
          createTime: { seconds: 0, nanos: 0 },
          updateTime: { seconds: 0, nanos: 0 },
          readTime: { seconds: 0, nanos: 0 },
        },
        error
      );
    }

    // Check if error is retriable
    const retriable = this.isRetriableError(error);

    if (retriable) {
      // Schedule reconnect with exponential backoff
      this.scheduleReconnect(state);

      this.observability?.metrics?.increment('firestore.listener.reconnects', 1, {
        type: state.type,
        reason: error.code,
      });
    } else {
      // Non-retriable error, unsubscribe listener
      this.observability?.logger?.error('Listener encountered non-retriable error', {
        id: state.id,
        type: state.type,
        code: error.code,
        message: error.message,
      });

      this.unsubscribe({ id: state.id, unsubscribe: () => {} });
    }
  }

  /**
   * Schedule reconnect for a listener.
   */
  private scheduleReconnect(state: ListenerState): void {
    if (!state.active) {
      return;
    }

    const delay = Math.min(
      this.config.initialReconnectDelay! *
        Math.pow(this.config.reconnectBackoffMultiplier!, state.reconnectAttempts),
      this.config.maxReconnectDelay!
    );

    state.reconnectAttempts++;

    this.observability?.logger?.info('Scheduling listener reconnect', {
      id: state.id,
      type: state.type,
      attempt: state.reconnectAttempts,
      delayMs: delay,
    });

    state.reconnectTimeout = setTimeout(() => {
      if (state.active) {
        this.reconnectListener(state);
      }
    }, delay);
  }

  /**
   * Reconnect a listener.
   */
  private reconnectListener(state: ListenerState): void {
    this.observability?.logger?.info('Reconnecting listener', {
      id: state.id,
      type: state.type,
      attempt: state.reconnectAttempts,
    });

    switch (state.type) {
      case 'document':
        this.startDocumentListener(state);
        break;
      case 'collection':
        this.startCollectionListener(state);
        break;
      case 'query':
        this.startQueryListener(state);
        break;
    }
  }

  /**
   * Check if error is retriable.
   */
  private isRetriableError(error: FirestoreError): boolean {
    const retriableCodes = [
      FirestoreErrorCode.UNAVAILABLE,
      FirestoreErrorCode.DEADLINE_EXCEEDED,
      FirestoreErrorCode.INTERNAL,
      FirestoreErrorCode.ABORTED,
    ];

    return retriableCodes.includes(error.code);
  }

  /**
   * Stop a listener stream.
   */
  private stopListener(_state: ListenerState): void {
    // Placeholder: In production, this would close the gRPC stream
    // associated with the listener
  }

  /**
   * Generate unique listener ID.
   */
  private generateListenerId(): string {
    return `listener-${this.nextListenerId++}`;
  }

  /**
   * Check if listener limit has been reached.
   */
  private checkListenerLimit(): void {
    if (this.listeners.size >= this.config.maxListeners!) {
      throw new Error(
        `Maximum number of listeners (${this.config.maxListeners}) reached. ` +
        'Unsubscribe existing listeners before creating new ones.'
      );
    }
  }

  /**
   * Update active listener count metric.
   */
  private updateActiveListenerMetric(): void {
    this.observability?.metrics?.gauge(
      'firestore.listeners.active',
      this.listeners.size
    );
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

  /**
   * Validate collection path format.
   */
  private validateCollectionPath(path: string): void {
    if (!path) {
      throw new Error('Collection path cannot be empty');
    }

    const parts = path.split('/');
    if (parts.length % 2 !== 1) {
      throw new Error(`Invalid collection path: ${path} (must have odd number of segments)`);
    }
  }

  /**
   * Validate query specification.
   */
  private validateQuery(query: Query): void {
    if (!query.collection) {
      throw new Error('Query must specify a collection');
    }
    this.validateCollectionPath(query.collection);
  }

  /**
   * Get parent path from collection path.
   */
  private getParentPath(path: string): string {
    const parts = path.split('/');
    if (parts.length === 1) {
      return ''; // Root collection
    }
    return parts.slice(0, -1).join('/');
  }

  /**
   * Get collection ID from collection path.
   */
  private getCollectionId(path: string): string {
    const parts = path.split('/');
    return parts[parts.length - 1]!;
  }

  /**
   * Build structured query from Query object.
   */
  private buildStructuredQuery(query: Query): unknown {
    return {
      from: [{ collectionId: this.getCollectionId(query.collection) }],
      where: query.where ? this.buildWhereFilter(query.where) : undefined,
      orderBy: query.orderBy?.map(o => ({
        field: { fieldPath: o.field },
        direction: o.direction === 'desc' ? 'DESCENDING' : 'ASCENDING',
      })),
      limit: query.limit ? { value: query.limit } : undefined,
      offset: query.offset,
    };
  }

  /**
   * Build where filter for query.
   */
  private buildWhereFilter(filters: any[]): unknown {
    if (filters.length === 1) {
      return this.buildSingleFilter(filters[0]);
    }

    return {
      compositeFilter: {
        op: 'AND',
        filters: filters.map(f => this.buildSingleFilter(f)),
      },
    };
  }

  /**
   * Build single filter condition.
   */
  private buildSingleFilter(filter: any): unknown {
    return {
      fieldFilter: {
        field: { fieldPath: filter.field },
        op: filter.operator,
        value: filter.value,
      },
    };
  }

  /**
   * Execute gRPC Listen for document/collection (placeholder).
   */
  private executeGrpcListen(
    _request: unknown,
    state: ListenerState,
    callback: (snapshot: DocumentSnapshot) => void
  ): void {
    // Placeholder: In production, this would:
    // 1. Open a gRPC bidirectional stream
    // 2. Send the Listen request
    // 3. Process incoming snapshot events
    // 4. Update resume token on each event
    // 5. Call the callback with snapshots
    // 6. Handle errors by calling handleListenerError

    // Simulate error for demonstration
    setTimeout(() => {
      const error = new FirestoreError(
        FirestoreErrorCode.UNIMPLEMENTED,
        'gRPC integration not implemented'
      );
      this.handleListenerError(state, error);
    }, 100);
  }

  /**
   * Execute gRPC Listen for query (placeholder).
   */
  private executeGrpcListenQuery(
    _request: unknown,
    state: ListenerState,
    callback: (snapshot: QuerySnapshot) => void
  ): void {
    // Placeholder: In production, this would:
    // 1. Open a gRPC bidirectional stream
    // 2. Send the Listen request
    // 3. Process incoming snapshot events
    // 4. Update resume token on each event
    // 5. Call the callback with query snapshots
    // 6. Handle errors by calling handleListenerError

    // Simulate error for demonstration
    setTimeout(() => {
      const error = new FirestoreError(
        FirestoreErrorCode.UNIMPLEMENTED,
        'gRPC integration not implemented'
      );
      this.handleListenerError(state, error);
    }, 100);
  }
}

/**
 * Listener manager for tracking and managing all listeners.
 *
 * This is a higher-level wrapper that can be used to manage multiple
 * ListenerService instances or provide additional features.
 */
export class ListenerManager {
  private readonly service: ListenerService;

  constructor(config?: ListenerConfig, observability?: ListenerObservability) {
    this.service = new ListenerService(config, observability);
  }

  /**
   * Create a document listener.
   */
  listenDocument(path: string, callback: ListenerCallback): ListenerRegistration {
    return this.service.listenDocument(path, callback);
  }

  /**
   * Create a collection listener.
   */
  listenCollection(collection: string, callback: ListenerCallback): ListenerRegistration {
    return this.service.listenCollection(collection, callback);
  }

  /**
   * Create a query listener.
   */
  listenQuery(query: Query, callback: QueryListenerCallback): ListenerRegistration {
    return this.service.listenQuery(query, callback);
  }

  /**
   * Unsubscribe from a listener.
   */
  unsubscribe(registration: ListenerRegistration): void {
    this.service.unsubscribe(registration);
  }

  /**
   * Unsubscribe from all listeners.
   */
  unsubscribeAll(): void {
    // This would require tracking all registrations
    // For now, this is a placeholder
    throw new Error('Not implemented');
  }
}

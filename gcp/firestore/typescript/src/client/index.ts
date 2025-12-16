/**
 * Firestore Client
 *
 * High-level client for Google Cloud Firestore operations.
 * Following the SPARC specification.
 */

import { FirestoreConfig, configBuilder, AuthConfig } from "../config/index.js";
import { GcpAuthProvider, createAuthProvider } from "../credentials/index.js";

/**
 * Document service interface for document operations.
 * Placeholder - actual implementation should be in services module.
 */
export interface DocumentService {
  // Document CRUD operations will be defined by the services module
}

/**
 * Collection service interface for collection operations.
 * Placeholder - actual implementation should be in services module.
 */
export interface CollectionService {
  // Collection operations will be defined by the services module
}

/**
 * Query service interface for query operations.
 * Placeholder - actual implementation should be in services module.
 */
export interface QueryService {
  // Query operations will be defined by the services module
}

/**
 * Batch service interface for batch write operations.
 * Placeholder - actual implementation should be in services module.
 */
export interface BatchService {
  // Batch operations will be defined by the services module
}

/**
 * Transaction service interface for transactional operations.
 * Placeholder - actual implementation should be in services module.
 */
export interface TransactionService {
  // Transaction operations will be defined by the services module
}

/**
 * Listener service interface for real-time listeners.
 * Placeholder - actual implementation should be in services module.
 */
export interface ListenerService {
  // Listener operations will be defined by the services module
}

/**
 * Field transform service interface for server-side field transforms.
 * Placeholder - actual implementation should be in services module.
 */
export interface FieldTransformService {
  // Field transform operations will be defined by the services module
}

/**
 * Firestore client interface.
 *
 * Provides access to all Firestore services and operations.
 *
 * @example
 * ```typescript
 * const client = await clientBuilder()
 *   .projectId('my-project')
 *   .databaseId('(default)')
 *   .applicationDefault()
 *   .build();
 *
 * // Access services
 * const docService = client.documents();
 * const queryService = client.queries();
 * ```
 */
export interface FirestoreClient {
  /**
   * Get the document service for document operations.
   * @returns DocumentService instance
   */
  documents(): DocumentService;

  /**
   * Get the collection service for collection operations.
   * @returns CollectionService instance
   */
  collections(): CollectionService;

  /**
   * Get the query service for query operations.
   * @returns QueryService instance
   */
  queries(): QueryService;

  /**
   * Get the batch service for batch write operations.
   * @returns BatchService instance
   */
  batches(): BatchService;

  /**
   * Get the transaction service for transactional operations.
   * @returns TransactionService instance
   */
  transactions(): TransactionService;

  /**
   * Get the listener service for real-time listeners.
   * @returns ListenerService instance
   */
  listeners(): ListenerService;

  /**
   * Get the field transform service for server-side field transforms.
   * @returns FieldTransformService instance
   */
  fieldTransforms(): FieldTransformService;

  /**
   * Get the current configuration.
   * @returns FirestoreConfig
   */
  config(): FirestoreConfig;

  /**
   * Force refresh the authentication token.
   * @returns Promise that resolves when token is refreshed
   */
  refreshToken(): Promise<void>;
}

/**
 * Firestore client implementation.
 *
 * Internal implementation of the FirestoreClient interface.
 */
export class FirestoreClientImpl implements FirestoreClient {
  private _config: FirestoreConfig;
  private _authProvider: GcpAuthProvider;

  // Lazy-initialized service instances
  private _documentService?: DocumentService;
  private _collectionService?: CollectionService;
  private _queryService?: QueryService;
  private _batchService?: BatchService;
  private _transactionService?: TransactionService;
  private _listenerService?: ListenerService;
  private _fieldTransformService?: FieldTransformService;

  constructor(config: FirestoreConfig, authProvider: GcpAuthProvider) {
    this._config = config;
    this._authProvider = authProvider;
  }

  documents(): DocumentService {
    if (!this._documentService) {
      // Service implementation will be injected when services module is implemented
      // For now, return a stub
      this._documentService = {} as DocumentService;
    }
    return this._documentService;
  }

  collections(): CollectionService {
    if (!this._collectionService) {
      // Service implementation will be injected when services module is implemented
      this._collectionService = {} as CollectionService;
    }
    return this._collectionService;
  }

  queries(): QueryService {
    if (!this._queryService) {
      // Service implementation will be injected when services module is implemented
      this._queryService = {} as QueryService;
    }
    return this._queryService;
  }

  batches(): BatchService {
    if (!this._batchService) {
      // Service implementation will be injected when services module is implemented
      this._batchService = {} as BatchService;
    }
    return this._batchService;
  }

  transactions(): TransactionService {
    if (!this._transactionService) {
      // Service implementation will be injected when services module is implemented
      this._transactionService = {} as TransactionService;
    }
    return this._transactionService;
  }

  listeners(): ListenerService {
    if (!this._listenerService) {
      // Service implementation will be injected when services module is implemented
      this._listenerService = {} as ListenerService;
    }
    return this._listenerService;
  }

  fieldTransforms(): FieldTransformService {
    if (!this._fieldTransformService) {
      // Service implementation will be injected when services module is implemented
      this._fieldTransformService = {} as FieldTransformService;
    }
    return this._fieldTransformService;
  }

  config(): FirestoreConfig {
    return this._config;
  }

  async refreshToken(): Promise<void> {
    await this._authProvider.refreshToken();
  }

  /**
   * Get the auth provider (internal use).
   * @internal
   */
  getAuthProvider(): GcpAuthProvider {
    return this._authProvider;
  }
}

/**
 * Firestore client builder with fluent API.
 *
 * Provides a convenient builder pattern for constructing Firestore clients
 * with various configuration options.
 *
 * @example
 * ```typescript
 * // Using service account key file
 * const client = await clientBuilder()
 *   .projectId('my-project')
 *   .serviceAccountKeyFile('/path/to/key.json')
 *   .build();
 *
 * // Using application default credentials
 * const client = await clientBuilder()
 *   .projectId('my-project')
 *   .applicationDefault()
 *   .build();
 *
 * // Using emulator
 * const client = await clientBuilder()
 *   .projectId('test-project')
 *   .emulator('localhost:8080')
 *   .build();
 * ```
 */
export class FirestoreClientBuilder {
  private _projectId?: string;
  private _databaseId?: string;
  private _credentials?: AuthConfig;
  private _endpoint?: string;
  private _timeout?: number;
  private _maxRetries?: number;
  private _useEmulator: boolean = false;

  /**
   * Set the GCP project ID.
   * @param id - GCP project ID
   * @returns This builder for chaining
   */
  projectId(id: string): this {
    this._projectId = id;
    return this;
  }

  /**
   * Set the Firestore database ID.
   * @param id - Database ID (default: "(default)")
   * @returns This builder for chaining
   */
  databaseId(id: string): this {
    this._databaseId = id;
    return this;
  }

  /**
   * Set explicit credentials.
   * @param creds - Authentication configuration
   * @returns This builder for chaining
   */
  credentials(creds: AuthConfig): this {
    this._credentials = creds;
    return this;
  }

  /**
   * Use service account key file for authentication.
   * @param path - Path to service account key file
   * @returns This builder for chaining
   */
  serviceAccountKeyFile(path: string): this {
    this._credentials = { type: "service_account", keyFile: path };
    return this;
  }

  /**
   * Use application default credentials.
   * @returns This builder for chaining
   */
  applicationDefault(): this {
    this._credentials = { type: "default_credentials" };
    return this;
  }

  /**
   * Use Firestore emulator.
   * @param host - Emulator host (default: "localhost:8080")
   * @returns This builder for chaining
   */
  emulator(host?: string): this {
    this._useEmulator = true;
    this._credentials = { type: "emulator" };
    const emulatorHost = host ?? "localhost:8080";
    this._endpoint = emulatorHost.startsWith("http")
      ? emulatorHost
      : `http://${emulatorHost}`;
    return this;
  }

  /**
   * Set request timeout in milliseconds.
   * @param ms - Timeout in milliseconds
   * @returns This builder for chaining
   */
  timeout(ms: number): this {
    this._timeout = ms;
    return this;
  }

  /**
   * Set maximum retry attempts.
   * @param n - Maximum retry attempts
   * @returns This builder for chaining
   */
  maxRetries(n: number): this {
    this._maxRetries = n;
    return this;
  }

  /**
   * Build the Firestore client.
   * @returns Promise resolving to configured FirestoreClient
   * @throws Error if required configuration is missing
   */
  async build(): Promise<FirestoreClient> {
    // Build configuration
    const builder = configBuilder();

    if (this._projectId) {
      builder.projectId(this._projectId);
    }

    if (this._databaseId) {
      builder.databaseId(this._databaseId);
    }

    if (this._credentials) {
      builder.auth(this._credentials);
    }

    if (this._endpoint) {
      builder.endpoint(this._endpoint);
    }

    if (this._useEmulator) {
      builder.useEmulator(true);
    }

    if (this._timeout !== undefined) {
      builder.requestTimeout(this._timeout);
    }

    if (this._maxRetries !== undefined) {
      builder.maxRetries(this._maxRetries);
    }

    const config = builder.build();

    // Create auth provider
    const authConfig = config.auth ?? { type: "default_credentials" };
    const authProvider = await createAuthProvider(authConfig);

    return new FirestoreClientImpl(config, authProvider);
  }
}

/**
 * Create a new Firestore client builder.
 *
 * @returns New FirestoreClientBuilder instance
 *
 * @example
 * ```typescript
 * const client = await clientBuilder()
 *   .projectId('my-project')
 *   .applicationDefault()
 *   .build();
 * ```
 */
export function clientBuilder(): FirestoreClientBuilder {
  return new FirestoreClientBuilder();
}

/**
 * Create a Firestore client from environment variables.
 *
 * Reads configuration from the following environment variables:
 * - FIRESTORE_PROJECT_ID or GOOGLE_CLOUD_PROJECT: Project ID (required)
 * - FIRESTORE_DATABASE_ID: Database ID (default: "(default)")
 * - GOOGLE_APPLICATION_CREDENTIALS: Path to service account key file
 * - FIRESTORE_EMULATOR_HOST: Emulator host (enables emulator mode)
 *
 * @returns Promise resolving to configured FirestoreClient
 * @throws Error if required environment variables are missing
 *
 * @example
 * ```typescript
 * // Set environment variables
 * process.env.GOOGLE_CLOUD_PROJECT = 'my-project';
 * process.env.GOOGLE_APPLICATION_CREDENTIALS = '/path/to/key.json';
 *
 * // Create client
 * const client = await createClientFromEnv();
 * ```
 */
export async function createClientFromEnv(): Promise<FirestoreClient> {
  const config = configBuilder().fromEnv().build();
  const authConfig = config.auth ?? { type: "default_credentials" };
  const authProvider = await createAuthProvider(authConfig);
  return new FirestoreClientImpl(config, authProvider);
}

/**
 * Create a Firestore client with explicit configuration.
 *
 * @param config - Firestore configuration
 * @returns Promise resolving to configured FirestoreClient
 *
 * @example
 * ```typescript
 * const config: FirestoreConfig = {
 *   project_id: 'my-project',
 *   database_id: '(default)',
 *   auth: { type: 'default_credentials' },
 *   // ... other config options
 * };
 *
 * const client = await createClient(config);
 * ```
 */
export async function createClient(config: FirestoreConfig): Promise<FirestoreClient> {
  const authConfig = config.auth ?? { type: "default_credentials" };
  const authProvider = await createAuthProvider(authConfig);
  return new FirestoreClientImpl(config, authProvider);
}

/**
 * Build a Firestore database path.
 *
 * @param projectId - GCP project ID
 * @param databaseId - Database ID (default: "(default)")
 * @returns Formatted database path
 *
 * @example
 * ```typescript
 * const path = buildDatabasePath('my-project', '(default)');
 * // Returns: "projects/my-project/databases/(default)"
 * ```
 */
export function buildDatabasePath(projectId: string, databaseId: string = "(default)"): string {
  return `projects/${projectId}/databases/${databaseId}`;
}

/**
 * Build a Firestore document path.
 *
 * @param projectId - GCP project ID
 * @param databaseId - Database ID
 * @param collectionPath - Collection path
 * @param documentId - Document ID
 * @returns Formatted document path
 *
 * @example
 * ```typescript
 * const path = buildDocumentPath('my-project', '(default)', 'users', 'user123');
 * // Returns: "projects/my-project/databases/(default)/documents/users/user123"
 * ```
 */
export function buildDocumentPath(
  projectId: string,
  databaseId: string,
  collectionPath: string,
  documentId: string
): string {
  const dbPath = buildDatabasePath(projectId, databaseId);
  return `${dbPath}/documents/${collectionPath}/${documentId}`;
}

/**
 * Build a Firestore collection path.
 *
 * @param projectId - GCP project ID
 * @param databaseId - Database ID
 * @param collectionId - Collection ID
 * @returns Formatted collection path
 *
 * @example
 * ```typescript
 * const path = buildCollectionPath('my-project', '(default)', 'users');
 * // Returns: "projects/my-project/databases/(default)/documents/users"
 * ```
 */
export function buildCollectionPath(
  projectId: string,
  databaseId: string,
  collectionId: string
): string {
  const dbPath = buildDatabasePath(projectId, databaseId);
  return `${dbPath}/documents/${collectionId}`;
}

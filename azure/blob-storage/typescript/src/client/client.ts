/**
 * Azure Blob Storage Client
 *
 * Main client class that provides a unified interface for all blob storage operations.
 * This is a thin adapter layer following SPARC specification.
 */

import type {
  // Request types
  UploadRequest,
  StreamUploadRequest,
  AppendRequest,
  DownloadRequest,
  StreamDownloadRequest,
  RangeDownloadRequest,
  ListBlobsRequest,
  DeleteRequest,
  CopyRequest,
  PropertiesRequest,
  MetadataRequest,
  SetTierRequest,
  VersionsRequest,
  // Response types
  UploadResponse,
  AppendResponse,
  DownloadResponse,
  RangeDownloadResponse,
  ListBlobsResponse,
  DeleteResponse,
  CopyResponse,
  GetPropertiesResponse,
  SetMetadataResponse,
  SetTierResponse,
  ListVersionsResponse,
  DownloadChunk,
  BlobItem,
} from '../types/index.js';

import type { AuthProvider } from '../auth/index.js';
import { createAuthProvider } from '../auth/index.js';
import type { BlobStorageConfig, NormalizedBlobStorageConfig } from './config.js';
import { normalizeConfig, SIMPLE_UPLOAD_LIMIT } from './config.js';
import { ConfigurationError } from '../errors/index.js';

// Import executors
import { SimpleUploader } from '../upload/simple.js';
import { ChunkedUploader } from '../upload/chunked.js';
import { AppendUploader } from '../upload/append.js';
import { SimpleDownloader } from '../download/simple.js';
import { StreamingDownloader, RangeReader } from '../download/streaming.js';
import { BlobLister } from '../management/list.js';
import { BlobDeleter } from '../management/delete.js';
import { BlobCopier } from '../management/copy.js';
import { PropertiesManager } from '../management/properties.js';

/**
 * Azure Blob Storage Client
 *
 * Provides a unified interface for all blob storage operations including:
 * - Upload (simple, chunked, append)
 * - Download (simple, streaming, range)
 * - Management (list, delete, copy, properties)
 * - Versioning (list versions, get version, delete version)
 *
 * @example
 * ```typescript
 * // Create client from environment variables
 * const client = BlobStorageClient.fromEnv();
 *
 * // Or with explicit configuration
 * const client = new BlobStorageClient({
 *   accountName: 'myaccount',
 *   accountKey: 'mykey',
 *   defaultContainer: 'mycontainer',
 * });
 *
 * // Upload a blob
 * const result = await client.upload({
 *   blobName: 'path/to/blob.txt',
 *   data: 'Hello, World!',
 *   contentType: 'text/plain',
 * });
 *
 * // Download a blob
 * const { data, properties } = await client.download({
 *   blobName: 'path/to/blob.txt',
 * });
 * ```
 */
export class BlobStorageClient {
  private readonly config: NormalizedBlobStorageConfig;
  private readonly authProvider: AuthProvider;

  // Executors
  private readonly simpleUploader: SimpleUploader;
  private readonly chunkedUploader: ChunkedUploader;
  private readonly appendUploader: AppendUploader;
  private readonly simpleDownloader: SimpleDownloader;
  private readonly streamingDownloader: StreamingDownloader;
  private readonly rangeReader: RangeReader;
  private readonly blobLister: BlobLister;
  private readonly blobDeleter: BlobDeleter;
  private readonly blobCopier: BlobCopier;
  private readonly propertiesManager: PropertiesManager;

  /**
   * Create a new BlobStorageClient
   *
   * @param config - Client configuration
   * @throws {ConfigurationError} If configuration is invalid
   */
  constructor(config: BlobStorageConfig) {
    try {
      this.config = normalizeConfig(config);
    } catch (error) {
      throw new ConfigurationError({
        message: error instanceof Error ? error.message : 'Invalid configuration',
        cause: error instanceof Error ? error : undefined,
      });
    }

    try {
      this.authProvider = createAuthProvider({
        connectionString: config.connectionString,
        accountName: config.accountName,
        accountKey: config.accountKey,
        sasToken: config.sasToken,
        azureAdCredentials: config.azureAdCredentials,
      });
    } catch (error) {
      throw new ConfigurationError({
        message: error instanceof Error ? error.message : 'Invalid authentication configuration',
        cause: error instanceof Error ? error : undefined,
      });
    }

    // Initialize executors
    this.simpleUploader = new SimpleUploader(this.config, this.authProvider);
    this.chunkedUploader = new ChunkedUploader(this.config, this.authProvider);
    this.appendUploader = new AppendUploader(this.config, this.authProvider);
    this.simpleDownloader = new SimpleDownloader(this.config, this.authProvider);
    this.streamingDownloader = new StreamingDownloader(this.config, this.authProvider);
    this.rangeReader = new RangeReader(this.config, this.authProvider);
    this.blobLister = new BlobLister(this.config, this.authProvider);
    this.blobDeleter = new BlobDeleter(this.config, this.authProvider);
    this.blobCopier = new BlobCopier(this.config, this.authProvider);
    this.propertiesManager = new PropertiesManager(this.config, this.authProvider);
  }

  /**
   * Create a BlobStorageClient from environment variables
   *
   * Supported environment variables:
   * - AZURE_STORAGE_CONNECTION_STRING: Full connection string
   * - AZURE_STORAGE_ACCOUNT: Storage account name
   * - AZURE_STORAGE_KEY: Storage account key
   * - AZURE_STORAGE_SAS_TOKEN: SAS token
   * - AZURE_STORAGE_CONTAINER: Default container
   * - AZURE_TENANT_ID: Azure AD tenant ID
   * - AZURE_CLIENT_ID: Azure AD client ID
   * - AZURE_CLIENT_SECRET: Azure AD client secret
   * - AZURE_USE_MANAGED_IDENTITY: Use managed identity ('true')
   *
   * @returns BlobStorageClient instance
   * @throws {ConfigurationError} If required environment variables are missing
   */
  static fromEnv(): BlobStorageClient {
    const connectionString = process.env['AZURE_STORAGE_CONNECTION_STRING'];
    const accountName = process.env['AZURE_STORAGE_ACCOUNT'];
    const accountKey = process.env['AZURE_STORAGE_KEY'];
    const sasToken = process.env['AZURE_STORAGE_SAS_TOKEN'];
    const container = process.env['AZURE_STORAGE_CONTAINER'];
    const tenantId = process.env['AZURE_TENANT_ID'];
    const clientId = process.env['AZURE_CLIENT_ID'];
    const clientSecret = process.env['AZURE_CLIENT_SECRET'];
    const useManagedIdentity = process.env['AZURE_USE_MANAGED_IDENTITY'] === 'true';

    const config: BlobStorageConfig = {
      accountName: accountName ?? '',
      connectionString,
      accountKey,
      sasToken,
      defaultContainer: container,
    };

    if (tenantId && clientId) {
      config.azureAdCredentials = {
        tenantId,
        clientId,
        clientSecret,
        useManagedIdentity,
      };
    } else if (useManagedIdentity) {
      config.azureAdCredentials = {
        tenantId: '',
        clientId: clientId ?? '',
        useManagedIdentity: true,
      };
    }

    return new BlobStorageClient(config);
  }

  // ============================================================================
  // Upload Operations
  // ============================================================================

  /**
   * Upload a blob using the appropriate strategy based on size
   *
   * - Small blobs (< 256MB): Single PUT request
   * - Large blobs (>= 256MB): Chunked block upload
   *
   * @param request - Upload request with data
   * @returns Upload response with etag and version info
   */
  async upload(request: UploadRequest): Promise<UploadResponse> {
    // Determine data size
    let dataSize: number;
    if (request.data instanceof Uint8Array) {
      dataSize = request.data.length;
    } else if (request.data instanceof ArrayBuffer) {
      dataSize = request.data.byteLength;
    } else if (typeof request.data === 'string') {
      dataSize = new TextEncoder().encode(request.data).length;
    } else {
      // Blob type
      dataSize = request.data.size;
    }

    // Use simple upload for small blobs
    if (dataSize <= SIMPLE_UPLOAD_LIMIT) {
      return this.simpleUploader.upload(request);
    }

    // Convert to stream for large blobs
    let stream: AsyncIterable<Uint8Array>;
    if (request.data instanceof Uint8Array) {
      stream = (async function* () {
        yield request.data as Uint8Array;
      })();
    } else if (request.data instanceof ArrayBuffer) {
      const data = new Uint8Array(request.data);
      stream = (async function* () {
        yield data;
      })();
    } else if (typeof request.data === 'string') {
      const data = new TextEncoder().encode(request.data);
      stream = (async function* () {
        yield data;
      })();
    } else {
      // Blob - read as stream
      stream = request.data.stream() as unknown as AsyncIterable<Uint8Array>;
    }

    return this.chunkedUploader.uploadStream({
      container: request.container,
      blobName: request.blobName,
      stream,
      contentLength: dataSize,
      contentType: request.contentType,
      metadata: request.metadata,
      accessTier: request.accessTier,
      timeout: request.timeout,
      signal: request.signal,
    });
  }

  /**
   * Upload a blob from a stream using chunked block upload
   *
   * Supports parallel uploads with configurable concurrency.
   *
   * @param request - Stream upload request
   * @returns Upload response with etag and version info
   */
  async uploadStream(request: StreamUploadRequest): Promise<UploadResponse> {
    return this.chunkedUploader.uploadStream(request);
  }

  /**
   * Append data to an append blob
   *
   * Append blobs are optimized for append operations like logging.
   *
   * @param request - Append request with data
   * @returns Append response with offset info
   */
  async append(request: AppendRequest): Promise<AppendResponse> {
    return this.appendUploader.append(request);
  }

  // ============================================================================
  // Download Operations
  // ============================================================================

  /**
   * Download a blob's contents
   *
   * @param request - Download request
   * @returns Downloaded data with properties and metadata
   */
  async download(request: DownloadRequest): Promise<DownloadResponse> {
    return this.simpleDownloader.download(request);
  }

  /**
   * Download a blob as a stream of chunks
   *
   * Supports parallel downloads with configurable concurrency.
   * Chunks are yielded in order regardless of download order.
   *
   * @param request - Stream download request
   * @returns Async generator of download chunks
   */
  async *downloadStream(request: StreamDownloadRequest): AsyncGenerator<DownloadChunk> {
    yield* this.streamingDownloader.downloadStream(request);
  }

  /**
   * Download a specific byte range of a blob
   *
   * @param request - Range download request with offset and count
   * @returns Range download response with data
   */
  async downloadRange(request: RangeDownloadRequest): Promise<RangeDownloadResponse> {
    return this.rangeReader.readRange(request);
  }

  // ============================================================================
  // Management Operations
  // ============================================================================

  /**
   * List blobs in a container
   *
   * Supports prefix filtering, pagination, and hierarchical listing.
   *
   * @param request - List request with optional filters
   * @returns List response with blobs and pagination info
   */
  async listBlobs(request: ListBlobsRequest = {}): Promise<ListBlobsResponse> {
    return this.blobLister.list(request);
  }

  /**
   * List all blobs in a container (auto-pagination)
   *
   * Automatically handles pagination and yields all blobs.
   *
   * @param request - List request with optional filters
   * @returns Async generator of blob items
   */
  async *listAllBlobs(request: ListBlobsRequest = {}): AsyncGenerator<BlobItem> {
    yield* this.blobLister.listAll(request);
  }

  /**
   * Delete a blob
   *
   * @param request - Delete request
   * @returns Delete response confirming deletion
   */
  async delete(request: DeleteRequest): Promise<DeleteResponse> {
    return this.blobDeleter.delete(request);
  }

  /**
   * Delete multiple blobs
   *
   * @param container - Container name
   * @param blobNames - Array of blob names to delete
   * @param options - Optional delete options
   * @returns Map of blob names to results or errors
   */
  async deleteMany(
    container: string,
    blobNames: string[],
    options?: Pick<DeleteRequest, 'deleteSnapshots' | 'signal'>
  ): Promise<Map<string, DeleteResponse | Error>> {
    return this.blobDeleter.deleteMany(container, blobNames, options);
  }

  /**
   * Copy a blob (server-side)
   *
   * Supports same-account and cross-account copies.
   *
   * @param request - Copy request with source and destination
   * @returns Copy response with copy status
   */
  async copy(request: CopyRequest): Promise<CopyResponse> {
    return this.blobCopier.copy(request);
  }

  /**
   * Abort a pending copy operation
   *
   * @param container - Container name
   * @param blobName - Blob name
   * @param copyId - Copy operation ID
   */
  async abortCopy(container: string, blobName: string, copyId: string): Promise<void> {
    return this.blobCopier.abortCopy(container, blobName, copyId);
  }

  /**
   * Get blob properties and metadata
   *
   * @param request - Properties request
   * @returns Properties response with blob properties and metadata
   */
  async getProperties(request: PropertiesRequest): Promise<GetPropertiesResponse> {
    return this.propertiesManager.getProperties(request);
  }

  /**
   * Set blob metadata
   *
   * Replaces all existing metadata with the provided values.
   *
   * @param request - Metadata request with key-value pairs
   * @returns Set metadata response
   */
  async setMetadata(request: MetadataRequest): Promise<SetMetadataResponse> {
    return this.propertiesManager.setMetadata(request);
  }

  /**
   * Set blob access tier
   *
   * @param request - Set tier request
   * @returns Set tier response
   */
  async setTier(request: SetTierRequest): Promise<SetTierResponse> {
    return this.propertiesManager.setTier(request);
  }

  // ============================================================================
  // Versioning Operations
  // ============================================================================

  /**
   * List all versions of a blob
   *
   * @param request - Versions request
   * @returns List of versions sorted by last modified (newest first)
   */
  async listVersions(request: VersionsRequest): Promise<ListVersionsResponse> {
    const container = request.container ?? this.config.defaultContainer;
    if (!container) {
      throw new ConfigurationError({
        message: 'Container name is required',
      });
    }

    // Use list with includeVersions to get all versions
    const response = await this.blobLister.list({
      container,
      prefix: request.blobName,
      includeVersions: true,
      timeout: request.timeout,
      signal: request.signal,
    });

    // Filter to exact blob name matches and extract version info
    const versions = response.blobs
      .filter((blob) => blob.name === request.blobName && blob.versionId)
      .map((blob) => ({
        versionId: blob.versionId!,
        isCurrentVersion: blob.isCurrentVersion,
        lastModified: blob.properties.lastModified,
        contentLength: blob.properties.contentLength,
        accessTier: blob.properties.accessTier,
      }))
      .sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());

    return {
      versions,
      clientRequestId: response.clientRequestId,
      requestId: response.requestId,
    };
  }

  /**
   * Download a specific version of a blob
   *
   * @param container - Container name
   * @param blobName - Blob name
   * @param versionId - Version ID
   * @returns Download response with versioned blob data
   */
  async getVersion(container: string, blobName: string, versionId: string): Promise<DownloadResponse> {
    return this.simpleDownloader.download({
      container,
      blobName,
      versionId,
    });
  }

  /**
   * Delete a specific version of a blob
   *
   * @param container - Container name
   * @param blobName - Blob name
   * @param versionId - Version ID
   * @returns Delete response confirming deletion
   */
  async deleteVersion(container: string, blobName: string, versionId: string): Promise<DeleteResponse> {
    return this.blobDeleter.delete({
      container,
      blobName,
      versionId,
    });
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Get the storage account endpoint URL
   */
  get endpoint(): string {
    return this.config.endpoint;
  }

  /**
   * Get the storage account name
   */
  get accountName(): string {
    return this.config.accountName;
  }

  /**
   * Get the default container name (if set)
   */
  get defaultContainer(): string | undefined {
    return this.config.defaultContainer;
  }

  /**
   * Build a URL for a blob
   *
   * @param container - Container name
   * @param blobName - Blob name
   * @returns Full URL to the blob
   */
  getBlobUrl(container: string, blobName: string): string {
    return `${this.config.endpoint}/${encodeURIComponent(container)}/${encodeURIComponent(blobName)}`;
  }
}

/**
 * Google Drive Client implementation.
 *
 * Main entry point for interacting with the Google Drive API.
 *
 * @packageDocumentation
 */

import { StorageQuota } from '../types';
import {
  FilesService,
  FilesServiceImpl,
  MockFilesService,
  PermissionsService,
  PermissionsServiceImpl,
  MockPermissionsService,
  CommentsService,
  CommentsServiceImpl,
  MockCommentsService,
  RepliesService,
  RepliesServiceImpl,
  MockRepliesService,
  RevisionsService,
  RevisionsServiceImpl,
  MockRevisionsService,
  ChangesService,
  ChangesServiceImpl,
  MockChangesService,
  DrivesService,
  DrivesServiceImpl,
  MockDrivesService,
  AboutService,
  AboutServiceImpl,
  MockAboutService,
  ResumableUploadSessionImpl,
} from '../services';

/**
 * Authentication provider interface.
 */
export interface AuthProvider {
  /**
   * Get an access token for API requests.
   */
  getAccessToken(): Promise<string>;
}

/**
 * Configuration for the Google Drive client.
 */
export interface GoogleDriveClientConfig {
  /** Authentication provider */
  auth: AuthProvider;

  /** Base URL for the API (default: https://www.googleapis.com/drive/v3) */
  baseUrl?: string;

  /** Upload URL for the API (default: https://www.googleapis.com/upload/drive/v3) */
  uploadUrl?: string;

  /** Default timeout in milliseconds (default: 300000 = 5 minutes) */
  timeout?: number;

  /** User agent string */
  userAgent?: string;

  /** Default fields to include in responses */
  defaultFields?: string;
}

/**
 * HTTP transport interface.
 */
export interface HttpTransport {
  request<T>(url: string, options: RequestOptions): Promise<T>;
  download(url: string, options?: RequestOptions): Promise<ArrayBuffer>;
  downloadStream(url: string, options?: RequestOptions): AsyncIterable<Uint8Array>;
  uploadMultipart(url: string, metadata: any, content: ArrayBuffer, contentType: string): Promise<any>;
  initiateResumableUpload(url: string, metadata: any, contentType: string, contentLength: number): Promise<string>;
}

/**
 * Request options.
 */
export interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: any;
  params?: Record<string, any>;
}

/**
 * Main Google Drive client interface.
 */
export interface GoogleDriveClient {
  /** Access the files service */
  readonly files: FilesService;

  /** Access the permissions service */
  readonly permissions: PermissionsService;

  /** Access the comments service */
  readonly comments: CommentsService;

  /** Access the replies service */
  readonly replies: RepliesService;

  /** Access the revisions service */
  readonly revisions: RevisionsService;

  /** Access the changes service */
  readonly changes: ChangesService;

  /** Access the drives service (shared drives) */
  readonly drives: DrivesService;

  /** Access the about service */
  readonly about: AboutService;

  /**
   * Get storage quota information.
   */
  getStorageQuota(): Promise<StorageQuota>;
}

/**
 * Implementation of GoogleDriveClient.
 */
export class GoogleDriveClientImpl implements GoogleDriveClient {
  private _files?: FilesService;
  private _permissions?: PermissionsService;
  private _comments?: CommentsService;
  private _replies?: RepliesService;
  private _revisions?: RevisionsService;
  private _changes?: ChangesService;
  private _drives?: DrivesService;
  private _about?: AboutService;

  private readonly baseUrl: string;
  private readonly uploadUrl: string;

  constructor(
    private config: GoogleDriveClientConfig,
    private transport: HttpTransport
  ) {
    // Merge config with defaults
    const mergedConfig = mergeClientConfig(config);
    this.baseUrl = mergedConfig.baseUrl;
    this.uploadUrl = mergedConfig.uploadUrl;
  }

  /**
   * Execute a request to the Google Drive API.
   * Internal method used by services.
   *
   * @param method - HTTP method
   * @param path - API path (e.g., "/files")
   * @param body - Request body
   * @returns Promise with the response data
   */
  async executeRequest<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = this.buildUrl(path);
    const headers = await this.getAuthHeaders();

    return this.transport.request<T>(url, {
      method: method as any,
      headers,
      body,
    });
  }

  /**
   * Execute a request and receive raw bytes.
   *
   * @param method - HTTP method
   * @param path - API path
   * @param body - Request body
   * @returns Promise with raw ArrayBuffer
   */
  async executeRequestRaw(
    method: string,
    path: string,
    body?: unknown
  ): Promise<ArrayBuffer> {
    const url = this.buildUrl(path);
    const headers = await this.getAuthHeaders();

    return this.transport.download(url, {
      method: method as any,
      headers,
      body,
    });
  }

  /**
   * Build a full URL from a path.
   *
   * @param path - API path (e.g., "/files" or "/files/123")
   * @returns Full URL
   */
  buildUrl(path: string): string {
    const base = path.includes('/upload/') ? this.uploadUrl : this.baseUrl;
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;
    return `${base}/${cleanPath}`;
  }

  /**
   * Get authentication headers.
   *
   * @returns Headers with authorization
   */
  private async getAuthHeaders(): Promise<Record<string, string>> {
    const token = await this.config.auth.getAccessToken();
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${token}`,
    };

    if (this.config.userAgent) {
      headers['User-Agent'] = this.config.userAgent;
    }

    return headers;
  }

  get files(): FilesService {
    if (!this._files) {
      this._files = new FilesServiceImpl(
        this.transport,
        (uri) => new ResumableUploadSessionImpl(uri, this.transport)
      );
    }
    return this._files;
  }

  get permissions(): PermissionsService {
    if (!this._permissions) {
      this._permissions = new PermissionsServiceImpl(this.transport);
    }
    return this._permissions;
  }

  get comments(): CommentsService {
    if (!this._comments) {
      this._comments = new CommentsServiceImpl(this.transport);
    }
    return this._comments;
  }

  get replies(): RepliesService {
    if (!this._replies) {
      this._replies = new RepliesServiceImpl(this.transport);
    }
    return this._replies;
  }

  get revisions(): RevisionsService {
    if (!this._revisions) {
      this._revisions = new RevisionsServiceImpl(this.transport);
    }
    return this._revisions;
  }

  get changes(): ChangesService {
    if (!this._changes) {
      this._changes = new ChangesServiceImpl(this.transport);
    }
    return this._changes;
  }

  get drives(): DrivesService {
    if (!this._drives) {
      this._drives = new DrivesServiceImpl(this.transport);
    }
    return this._drives;
  }

  get about(): AboutService {
    if (!this._about) {
      this._about = new AboutServiceImpl(this.transport);
    }
    return this._about;
  }

  async getStorageQuota(): Promise<StorageQuota> {
    return this.about.getStorageQuota();
  }
}

/**
 * Mock implementation of GoogleDriveClient for testing.
 */
export class MockGoogleDriveClient implements GoogleDriveClient {
  readonly files: FilesService;
  readonly permissions: PermissionsService;
  readonly comments: CommentsService;
  readonly replies: RepliesService;
  readonly revisions: RevisionsService;
  readonly changes: ChangesService;
  readonly drives: DrivesService;
  readonly about: AboutService;

  constructor() {
    this.files = new MockFilesService();
    this.permissions = new MockPermissionsService();
    this.comments = new MockCommentsService();
    this.replies = new MockRepliesService();
    this.revisions = new MockRevisionsService();
    this.changes = new MockChangesService();
    this.drives = new MockDrivesService();
    this.about = new MockAboutService();
  }

  async getStorageQuota(): Promise<StorageQuota> {
    return this.about.getStorageQuota();
  }
}

/**
 * Factory for creating Google Drive clients.
 */
export interface GoogleDriveClientFactory {
  /**
   * Create a new client with the given configuration.
   */
  create(config: GoogleDriveClientConfig): GoogleDriveClient;
}

/**
 * Default client factory implementation.
 */
export class DefaultGoogleDriveClientFactory implements GoogleDriveClientFactory {
  constructor(private createTransport: (config: GoogleDriveClientConfig) => HttpTransport) {}

  create(config: GoogleDriveClientConfig): GoogleDriveClient {
    const transport = this.createTransport(config);
    return new GoogleDriveClientImpl(config, transport);
  }
}

/**
 * Create a Google Drive client.
 *
 * @param config - Client configuration
 * @param createTransport - Optional transport factory
 * @returns A configured GoogleDriveClient instance
 */
export function createGoogleDriveClient(
  config: GoogleDriveClientConfig,
  createTransport?: (config: GoogleDriveClientConfig) => HttpTransport
): GoogleDriveClient {
  if (!createTransport) {
    throw new Error('createTransport is required - must provide an HTTP transport factory');
  }
  const factory = new DefaultGoogleDriveClientFactory(createTransport);
  return factory.create(config);
}

/**
 * Create a mock Google Drive client for testing.
 *
 * @returns A mock GoogleDriveClient instance
 */
export function createMockGoogleDriveClient(): MockGoogleDriveClient {
  return new MockGoogleDriveClient();
}

/**
 * Simple OAuth2 auth provider implementation.
 */
export class OAuth2AuthProvider implements AuthProvider {
  constructor(private accessToken: string) {}

  async getAccessToken(): Promise<string> {
    return this.accessToken;
  }

  /**
   * Update the access token.
   */
  setAccessToken(token: string): void {
    this.accessToken = token;
  }
}

/**
 * Create an OAuth2 auth provider.
 *
 * @param accessToken - The OAuth2 access token
 * @returns An AuthProvider instance
 */
export function createOAuth2AuthProvider(accessToken: string): AuthProvider {
  return new OAuth2AuthProvider(accessToken);
}

/**
 * Service account auth provider implementation.
 *
 * Note: This is a placeholder. Real implementation would use JWT signing
 * with the service account private key to obtain access tokens.
 */
export class ServiceAccountAuthProvider implements AuthProvider {
  private cachedToken?: string;
  private expiresAt?: Date;

  constructor(
    private serviceAccountEmail: string,
    private privateKey: string,
    private scopes: string[],
    private subject?: string
  ) {}

  async getAccessToken(): Promise<string> {
    // Check if cached token is still valid
    if (this.cachedToken && this.expiresAt && this.expiresAt > new Date()) {
      return this.cachedToken;
    }

    // In a real implementation, this would:
    // 1. Create a JWT with the service account credentials
    // 2. Sign it with the private key
    // 3. Exchange it for an access token
    // 4. Cache the token with expiration
    throw new Error('ServiceAccountAuthProvider not fully implemented - use OAuth2 flow or provide custom implementation');
  }
}

/**
 * Create a service account auth provider.
 *
 * @param serviceAccountEmail - Service account email
 * @param privateKey - Private key for signing JWTs
 * @param scopes - OAuth scopes to request
 * @param subject - Optional subject for domain-wide delegation
 * @returns An AuthProvider instance
 */
export function createServiceAccountAuthProvider(
  serviceAccountEmail: string,
  privateKey: string,
  scopes: string[],
  subject?: string
): AuthProvider {
  return new ServiceAccountAuthProvider(serviceAccountEmail, privateKey, scopes, subject);
}

/**
 * Default configuration values.
 */
export const DEFAULT_CLIENT_CONFIG: Partial<GoogleDriveClientConfig> = {
  baseUrl: 'https://www.googleapis.com/drive/v3',
  uploadUrl: 'https://www.googleapis.com/upload/drive/v3',
  timeout: 300000, // 5 minutes
  userAgent: 'google-drive-typescript-client/1.0.0',
};

/**
 * Merge user config with defaults.
 *
 * @param config - User-provided configuration
 * @returns Merged configuration
 */
export function mergeClientConfig(config: GoogleDriveClientConfig): Required<Omit<GoogleDriveClientConfig, 'defaultFields'>> & Pick<GoogleDriveClientConfig, 'defaultFields'> {
  return {
    auth: config.auth,
    baseUrl: config.baseUrl || DEFAULT_CLIENT_CONFIG.baseUrl!,
    uploadUrl: config.uploadUrl || DEFAULT_CLIENT_CONFIG.uploadUrl!,
    timeout: config.timeout || DEFAULT_CLIENT_CONFIG.timeout!,
    userAgent: config.userAgent || DEFAULT_CLIENT_CONFIG.userAgent!,
    defaultFields: config.defaultFields,
  };
}

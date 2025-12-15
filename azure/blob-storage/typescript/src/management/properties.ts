/**
 * Blob Properties Operations
 *
 * Get/set blob metadata and properties, set access tier.
 */

import type {
  PropertiesRequest,
  MetadataRequest,
  SetTierRequest,
  GetPropertiesResponse,
  SetMetadataResponse,
  SetTierResponse,
  BlobProperties,
} from '../types/index.js';
import type { AuthProvider } from '../auth/index.js';
import type { NormalizedBlobStorageConfig } from '../client/config.js';
import { ValidationError, createErrorFromResponse } from '../errors/index.js';
import type { AccessTier, LeaseStatus, LeaseState, BlobType, CopyStatus } from '../types/blob.js';

/** Generate a UUID v4 for request IDs */
function generateUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Parse blob properties from response headers */
function parseProperties(headers: Headers): BlobProperties {
  return {
    etag: headers.get('ETag') ?? '',
    lastModified: new Date(headers.get('Last-Modified') ?? Date.now()),
    contentLength: parseInt(headers.get('Content-Length') ?? '0', 10),
    contentType: headers.get('Content-Type') ?? 'application/octet-stream',
    contentEncoding: headers.get('Content-Encoding') ?? undefined,
    contentMd5: headers.get('Content-MD5') ?? undefined,
    contentLanguage: headers.get('Content-Language') ?? undefined,
    cacheControl: headers.get('Cache-Control') ?? undefined,
    contentDisposition: headers.get('Content-Disposition') ?? undefined,
    accessTier: (headers.get('x-ms-access-tier') as AccessTier) ?? undefined,
    accessTierInferred: headers.get('x-ms-access-tier-inferred') === 'true',
    accessTierChangedOn: headers.get('x-ms-access-tier-change-time')
      ? new Date(headers.get('x-ms-access-tier-change-time')!)
      : undefined,
    leaseStatus: (headers.get('x-ms-lease-status') as LeaseStatus) ?? undefined,
    leaseState: (headers.get('x-ms-lease-state') as LeaseState) ?? undefined,
    leaseDuration: headers.get('x-ms-lease-duration') as 'infinite' | 'fixed' | undefined,
    creationTime: new Date(headers.get('x-ms-creation-time') ?? Date.now()),
    blobType: (headers.get('x-ms-blob-type') as BlobType) ?? 'BlockBlob',
    serverEncrypted: headers.get('x-ms-server-encrypted') === 'true',
    versionId: headers.get('x-ms-version-id') ?? undefined,
    isCurrentVersion: headers.get('x-ms-is-current-version') === 'true',
    copyId: headers.get('x-ms-copy-id') ?? undefined,
    copyStatus: headers.get('x-ms-copy-status') as CopyStatus | undefined,
    copySource: headers.get('x-ms-copy-source') ?? undefined,
    copyProgress: headers.get('x-ms-copy-progress') ?? undefined,
    copyCompletedOn: headers.get('x-ms-copy-completion-time')
      ? new Date(headers.get('x-ms-copy-completion-time')!)
      : undefined,
    copyStatusDescription: headers.get('x-ms-copy-status-description') ?? undefined,
    rehydratePriority: headers.get('x-ms-rehydrate-priority') as 'High' | 'Standard' | undefined,
    archiveStatus: headers.get('x-ms-archive-status') as BlobProperties['archiveStatus'],
    lastAccessedOn: headers.get('x-ms-last-access-time')
      ? new Date(headers.get('x-ms-last-access-time')!)
      : undefined,
  };
}

/** Extract metadata from response headers */
function extractMetadata(headers: Headers): Record<string, string> {
  const metadata: Record<string, string> = {};

  headers.forEach((value, key) => {
    if (key.toLowerCase().startsWith('x-ms-meta-')) {
      const metaKey = key.slice('x-ms-meta-'.length);
      metadata[metaKey] = value;
    }
  });

  return metadata;
}

/**
 * Properties manager
 */
export class PropertiesManager {
  constructor(
    private readonly config: NormalizedBlobStorageConfig,
    private readonly authProvider: AuthProvider
  ) {}

  /**
   * Get blob properties and metadata
   */
  async getProperties(request: PropertiesRequest): Promise<GetPropertiesResponse> {
    // Resolve container
    const container = request.container ?? this.config.defaultContainer;
    if (!container) {
      throw new ValidationError({
        message: 'Container name is required',
        field: 'container',
      });
    }

    // Validate blob name
    if (!request.blobName) {
      throw new ValidationError({
        message: 'Blob name is required',
        field: 'blobName',
      });
    }

    // Build URL
    let url = `${this.config.endpoint}/${encodeURIComponent(container)}/${encodeURIComponent(request.blobName)}`;

    // Add version or snapshot query params
    const params = new URLSearchParams();
    if (request.versionId) {
      params.set('versionId', request.versionId);
    }
    if (request.snapshot) {
      params.set('snapshot', request.snapshot);
    }
    if (params.toString()) {
      url += `?${params.toString()}`;
    }

    // Build headers
    const headers: Record<string, string> = {
      'x-ms-version': '2023-11-03',
      'x-ms-client-request-id': generateUuid(),
    };

    // Add authentication
    const [authHeader, authValue] = await this.authProvider.getAuthHeader();
    if (authHeader) {
      headers[authHeader] = authValue;
    }

    // Handle SAS token
    let finalUrl = url;
    if (this.authProvider.getAuthUrl) {
      finalUrl = await this.authProvider.getAuthUrl(url);
    }

    const response = await fetch(finalUrl, {
      method: 'HEAD',
      headers,
      signal: request.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw createErrorFromResponse(
        response.status,
        errorBody,
        Object.fromEntries(response.headers.entries()),
        container,
        request.blobName
      );
    }

    return {
      properties: parseProperties(response.headers),
      metadata: extractMetadata(response.headers),
      clientRequestId: headers['x-ms-client-request-id'],
      requestId: response.headers.get('x-ms-request-id') ?? undefined,
    };
  }

  /**
   * Set blob metadata
   */
  async setMetadata(request: MetadataRequest): Promise<SetMetadataResponse> {
    // Resolve container
    const container = request.container ?? this.config.defaultContainer;
    if (!container) {
      throw new ValidationError({
        message: 'Container name is required',
        field: 'container',
      });
    }

    // Validate blob name
    if (!request.blobName) {
      throw new ValidationError({
        message: 'Blob name is required',
        field: 'blobName',
      });
    }

    // Build URL
    const url = `${this.config.endpoint}/${encodeURIComponent(container)}/${encodeURIComponent(request.blobName)}?comp=metadata`;

    // Build headers
    const headers: Record<string, string> = {
      'x-ms-version': '2023-11-03',
      'x-ms-client-request-id': generateUuid(),
    };

    // Add metadata headers
    for (const [key, value] of Object.entries(request.metadata)) {
      headers[`x-ms-meta-${key}`] = value;
    }

    // Conditional update
    if (request.ifMatch) {
      headers['If-Match'] = request.ifMatch;
    }

    // Add authentication
    const [authHeader, authValue] = await this.authProvider.getAuthHeader();
    if (authHeader) {
      headers[authHeader] = authValue;
    }

    // Handle SAS token
    let finalUrl = url;
    if (this.authProvider.getAuthUrl) {
      finalUrl = await this.authProvider.getAuthUrl(url);
    }

    const response = await fetch(finalUrl, {
      method: 'PUT',
      headers,
      signal: request.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw createErrorFromResponse(
        response.status,
        errorBody,
        Object.fromEntries(response.headers.entries()),
        container,
        request.blobName
      );
    }

    return {
      etag: response.headers.get('ETag') ?? '',
      lastModified: new Date(response.headers.get('Last-Modified') ?? Date.now()),
      clientRequestId: headers['x-ms-client-request-id'],
      requestId: response.headers.get('x-ms-request-id') ?? undefined,
    };
  }

  /**
   * Set blob access tier
   */
  async setTier(request: SetTierRequest): Promise<SetTierResponse> {
    // Resolve container
    const container = request.container ?? this.config.defaultContainer;
    if (!container) {
      throw new ValidationError({
        message: 'Container name is required',
        field: 'container',
      });
    }

    // Validate blob name
    if (!request.blobName) {
      throw new ValidationError({
        message: 'Blob name is required',
        field: 'blobName',
      });
    }

    // Build URL
    const url = `${this.config.endpoint}/${encodeURIComponent(container)}/${encodeURIComponent(request.blobName)}?comp=tier`;

    // Build headers
    const headers: Record<string, string> = {
      'x-ms-version': '2023-11-03',
      'x-ms-client-request-id': generateUuid(),
      'x-ms-access-tier': request.tier,
    };

    // Rehydrate priority for archive tier
    if (request.rehydratePriority) {
      headers['x-ms-rehydrate-priority'] = request.rehydratePriority;
    }

    // Add authentication
    const [authHeader, authValue] = await this.authProvider.getAuthHeader();
    if (authHeader) {
      headers[authHeader] = authValue;
    }

    // Handle SAS token
    let finalUrl = url;
    if (this.authProvider.getAuthUrl) {
      finalUrl = await this.authProvider.getAuthUrl(url);
    }

    const response = await fetch(finalUrl, {
      method: 'PUT',
      headers,
      signal: request.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw createErrorFromResponse(
        response.status,
        errorBody,
        Object.fromEntries(response.headers.entries()),
        container,
        request.blobName
      );
    }

    return {
      success: true,
      clientRequestId: headers['x-ms-client-request-id'],
      requestId: response.headers.get('x-ms-request-id') ?? undefined,
    };
  }
}

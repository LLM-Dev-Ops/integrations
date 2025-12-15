/**
 * Blob Versioning Operations
 *
 * Manage blob versions including listing, retrieving, and deleting specific versions.
 */

import type {
  VersionsRequest,
  ListVersionsResponse,
  DownloadResponse,
  DeleteResponse,
  BlobVersion,
  BlobProperties,
  AccessTier,
  LeaseStatus,
  LeaseState,
  BlobType,
} from '../types/index.js';
import type { AuthProvider } from '../auth/index.js';
import type { NormalizedBlobStorageConfig } from '../client/config.js';
import { ValidationError, createErrorFromResponse } from '../errors/index.js';

/** Generate a UUID v4 for request IDs */
function generateUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Parse XML blob list response for versions
 */
function parseVersionsXml(xml: string, blobName: string): BlobVersion[] {
  const versions: BlobVersion[] = [];

  // Parse blobs from the list response
  const blobRegex = /<Blob>([\s\S]*?)<\/Blob>/g;
  let blobMatch;

  while ((blobMatch = blobRegex.exec(xml)) !== null) {
    const blobXml = blobMatch[1]!;

    // Extract blob name to filter for exact matches only
    const nameMatch = blobXml.match(/<Name>([^<]+)<\/Name>/);
    if (!nameMatch || nameMatch[1] !== blobName) {
      continue; // Skip blobs that don't match the exact name
    }

    const version = parseVersionXml(blobXml);
    if (version) {
      versions.push(version);
    }
  }

  return versions;
}

/**
 * Parse a single version from XML
 */
function parseVersionXml(xml: string): BlobVersion | null {
  // Extract version ID (required for versions)
  const versionIdMatch = xml.match(/<VersionId>([^<]+)<\/VersionId>/);
  if (!versionIdMatch) return null;

  const versionId = versionIdMatch[1]!;

  // Parse properties section
  const propsMatch = xml.match(/<Properties>([\s\S]*?)<\/Properties>/);
  const propsXml = propsMatch?.[1] ?? '';

  const lastModified = extractXmlValue(propsXml, 'Last-Modified');
  const contentLength = extractXmlValue(propsXml, 'Content-Length');
  const accessTier = extractXmlValue(propsXml, 'AccessTier');
  const isCurrentVersion = extractXmlValue(xml, 'IsCurrentVersion') === 'true';

  return {
    versionId,
    isCurrentVersion,
    lastModified: new Date(lastModified ?? Date.now()),
    contentLength: parseInt(contentLength ?? '0', 10),
    accessTier: accessTier as AccessTier | undefined,
  };
}

/**
 * Extract value from XML element
 */
function extractXmlValue(xml: string, tagName: string): string | undefined {
  const regex = new RegExp(`<${tagName}>([^<]*)</${tagName}>`);
  const match = xml.match(regex);
  return match?.[1] || undefined;
}

/**
 * Parse blob properties from response headers
 */
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
    copyStatus: headers.get('x-ms-copy-status') as BlobProperties['copyStatus'],
    copySource: headers.get('x-ms-copy-source') ?? undefined,
    copyProgress: headers.get('x-ms-copy-progress') ?? undefined,
    copyCompletedOn: headers.get('x-ms-copy-completion-time')
      ? new Date(headers.get('x-ms-copy-completion-time')!)
      : undefined,
    copyStatusDescription: headers.get('x-ms-copy-status-description') ?? undefined,
    lastAccessedOn: headers.get('x-ms-last-access-time')
      ? new Date(headers.get('x-ms-last-access-time')!)
      : undefined,
  };
}

/**
 * Extract metadata from response headers
 */
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
 * Version manager for blob versioning operations
 */
export class VersionManager {
  constructor(
    private readonly config: NormalizedBlobStorageConfig,
    private readonly authProvider: AuthProvider
  ) {}

  /**
   * List all versions of a blob
   *
   * Uses the list blobs operation with includeVersions=true and filters
   * to exact blob name matches to get all versions of a specific blob.
   *
   * @param request - Version listing request
   * @returns List of all versions for the blob
   */
  async listVersions(request: VersionsRequest): Promise<ListVersionsResponse> {
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

    // Build query parameters for list operation
    const params = new URLSearchParams();
    params.set('restype', 'container');
    params.set('comp', 'list');
    params.set('prefix', request.blobName); // Use prefix to narrow down results
    params.set('include', 'versions'); // Include versions in the listing

    const url = `${this.config.endpoint}/${encodeURIComponent(container)}?${params.toString()}`;

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
      method: 'GET',
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

    const xml = await response.text();
    const versions = parseVersionsXml(xml, request.blobName);

    return {
      versions,
      clientRequestId: headers['x-ms-client-request-id'],
      requestId: response.headers.get('x-ms-request-id') ?? undefined,
    };
  }

  /**
   * Download a specific version of a blob
   *
   * @param container - Container name
   * @param blobName - Blob name (path)
   * @param versionId - Version ID to download
   * @returns Downloaded version data and properties
   */
  async getVersion(container: string, blobName: string, versionId: string): Promise<DownloadResponse> {
    // Validate inputs
    if (!container) {
      throw new ValidationError({
        message: 'Container name is required',
        field: 'container',
      });
    }

    if (!blobName) {
      throw new ValidationError({
        message: 'Blob name is required',
        field: 'blobName',
      });
    }

    if (!versionId) {
      throw new ValidationError({
        message: 'Version ID is required',
        field: 'versionId',
      });
    }

    // Build URL with version query parameter
    const params = new URLSearchParams();
    params.set('versionId', versionId);

    const url = `${this.config.endpoint}/${encodeURIComponent(container)}/${encodeURIComponent(blobName)}?${params.toString()}`;

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
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw createErrorFromResponse(
        response.status,
        errorBody,
        Object.fromEntries(response.headers.entries()),
        container,
        blobName
      );
    }

    // Read body
    const arrayBuffer = await response.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);

    return {
      data,
      properties: parseProperties(response.headers),
      metadata: extractMetadata(response.headers),
      clientRequestId: headers['x-ms-client-request-id'],
      requestId: response.headers.get('x-ms-request-id') ?? undefined,
    };
  }

  /**
   * Delete a specific version of a blob
   *
   * Note: Deleting a version is permanent. To delete the current version
   * while keeping version history, use the regular delete operation which
   * will create a delete marker instead.
   *
   * @param container - Container name
   * @param blobName - Blob name (path)
   * @param versionId - Version ID to delete
   * @returns Deletion result
   */
  async deleteVersion(container: string, blobName: string, versionId: string): Promise<DeleteResponse> {
    // Validate inputs
    if (!container) {
      throw new ValidationError({
        message: 'Container name is required',
        field: 'container',
      });
    }

    if (!blobName) {
      throw new ValidationError({
        message: 'Blob name is required',
        field: 'blobName',
      });
    }

    if (!versionId) {
      throw new ValidationError({
        message: 'Version ID is required',
        field: 'versionId',
      });
    }

    // Build URL with version query parameter
    const params = new URLSearchParams();
    params.set('versionId', versionId);

    const url = `${this.config.endpoint}/${encodeURIComponent(container)}/${encodeURIComponent(blobName)}?${params.toString()}`;

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
      method: 'DELETE',
      headers,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw createErrorFromResponse(
        response.status,
        errorBody,
        Object.fromEntries(response.headers.entries()),
        container,
        blobName
      );
    }

    return {
      deleted: true,
      clientRequestId: headers['x-ms-client-request-id'],
      requestId: response.headers.get('x-ms-request-id') ?? undefined,
    };
  }
}

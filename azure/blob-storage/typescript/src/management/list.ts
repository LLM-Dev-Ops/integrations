/**
 * List Blobs Operation
 *
 * List blobs with pagination, prefix filtering, and version support.
 */

import type { ListBlobsRequest, ListBlobsResponse, BlobItem, BlobProperties } from '../types/index.js';
import type { AuthProvider } from '../auth/index.js';
import type { NormalizedBlobStorageConfig } from '../client/config.js';
import { ValidationError, createErrorFromResponse } from '../errors/index.js';
import type { AccessTier, LeaseStatus, LeaseState, BlobType } from '../types/blob.js';

/** Generate a UUID v4 for request IDs */
function generateUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Parse XML blob list response */
function parseListBlobsXml(
  xml: string,
  container: string
): { blobs: BlobItem[]; prefixes: string[]; nextMarker?: string } {
  const blobs: BlobItem[] = [];
  const prefixes: string[] = [];

  // Parse next marker
  const nextMarkerMatch = xml.match(/<NextMarker>([^<]*)<\/NextMarker>/);
  const nextMarker = nextMarkerMatch?.[1] || undefined;

  // Parse blob prefixes (virtual directories)
  const prefixRegex = /<BlobPrefix><Name>([^<]+)<\/Name><\/BlobPrefix>/g;
  let prefixMatch;
  while ((prefixMatch = prefixRegex.exec(xml)) !== null) {
    prefixes.push(prefixMatch[1]!);
  }

  // Parse blobs
  const blobRegex = /<Blob>([\s\S]*?)<\/Blob>/g;
  let blobMatch;
  while ((blobMatch = blobRegex.exec(xml)) !== null) {
    const blobXml = blobMatch[1]!;
    const blob = parseBlobXml(blobXml, container);
    if (blob) {
      blobs.push(blob);
    }
  }

  return { blobs, prefixes, nextMarker };
}

/** Parse a single blob from XML */
function parseBlobXml(xml: string, container: string): BlobItem | null {
  const nameMatch = xml.match(/<Name>([^<]+)<\/Name>/);
  if (!nameMatch) return null;

  const name = nameMatch[1]!;

  // Parse properties
  const propsMatch = xml.match(/<Properties>([\s\S]*?)<\/Properties>/);
  const propsXml = propsMatch?.[1] ?? '';

  const properties: BlobProperties = {
    etag: extractXmlValue(propsXml, 'Etag') ?? '',
    lastModified: new Date(extractXmlValue(propsXml, 'Last-Modified') ?? Date.now()),
    contentLength: parseInt(extractXmlValue(propsXml, 'Content-Length') ?? '0', 10),
    contentType: extractXmlValue(propsXml, 'Content-Type') ?? 'application/octet-stream',
    contentEncoding: extractXmlValue(propsXml, 'Content-Encoding'),
    contentMd5: extractXmlValue(propsXml, 'Content-MD5'),
    contentLanguage: extractXmlValue(propsXml, 'Content-Language'),
    cacheControl: extractXmlValue(propsXml, 'Cache-Control'),
    contentDisposition: extractXmlValue(propsXml, 'Content-Disposition'),
    accessTier: extractXmlValue(propsXml, 'AccessTier') as AccessTier | undefined,
    accessTierInferred: extractXmlValue(propsXml, 'AccessTierInferred') === 'true',
    leaseStatus: extractXmlValue(propsXml, 'LeaseStatus') as LeaseStatus | undefined,
    leaseState: extractXmlValue(propsXml, 'LeaseState') as LeaseState | undefined,
    creationTime: new Date(extractXmlValue(propsXml, 'Creation-Time') ?? Date.now()),
    blobType: (extractXmlValue(propsXml, 'BlobType') as BlobType) ?? 'BlockBlob',
    serverEncrypted: extractXmlValue(propsXml, 'ServerEncrypted') === 'true',
  };

  // Parse metadata
  const metadata: Record<string, string> = {};
  const metadataMatch = xml.match(/<Metadata>([\s\S]*?)<\/Metadata>/);
  if (metadataMatch) {
    const metaRegex = /<([^>]+)>([^<]*)<\/\1>/g;
    let metaMatch;
    while ((metaMatch = metaRegex.exec(metadataMatch[1]!)) !== null) {
      metadata[metaMatch[1]!] = metaMatch[2]!;
    }
  }

  // Parse version info
  const versionId = extractXmlValue(xml, 'VersionId');
  const isCurrentVersion = extractXmlValue(xml, 'IsCurrentVersion') === 'true';
  const snapshot = extractXmlValue(xml, 'Snapshot');
  const deleted = extractXmlValue(xml, 'Deleted') === 'true';

  return {
    name,
    container,
    properties,
    metadata,
    versionId,
    isCurrentVersion: versionId ? isCurrentVersion : true,
    snapshot,
    deleted,
  };
}

/** Extract value from XML element */
function extractXmlValue(xml: string, tagName: string): string | undefined {
  const regex = new RegExp(`<${tagName}>([^<]*)</${tagName}>`);
  const match = xml.match(regex);
  return match?.[1] || undefined;
}

/**
 * List blobs executor
 */
export class BlobLister {
  constructor(
    private readonly config: NormalizedBlobStorageConfig,
    private readonly authProvider: AuthProvider
  ) {}

  /**
   * List blobs in a container
   */
  async list(request: ListBlobsRequest): Promise<ListBlobsResponse> {
    // Resolve container
    const container = request.container ?? this.config.defaultContainer;
    if (!container) {
      throw new ValidationError({
        message: 'Container name is required',
        field: 'container',
      });
    }

    // Build query parameters
    const params = new URLSearchParams();
    params.set('restype', 'container');
    params.set('comp', 'list');

    if (request.prefix) {
      params.set('prefix', request.prefix);
    }
    if (request.delimiter) {
      params.set('delimiter', request.delimiter);
    }
    if (request.continuationToken) {
      params.set('marker', request.continuationToken);
    }
    if (request.maxResults) {
      params.set('maxresults', String(request.maxResults));
    }

    // Build include options
    const include: string[] = [];
    if (request.includeMetadata) include.push('metadata');
    if (request.includeVersions) include.push('versions');
    if (request.includeSnapshots) include.push('snapshots');
    if (request.includeDeleted) include.push('deleted');
    if (request.includeCopy) include.push('copy');
    if (request.includeUncommittedBlobs) include.push('uncommittedblobs');

    if (include.length > 0) {
      params.set('include', include.join(','));
    }

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
        container
      );
    }

    const xml = await response.text();
    const parsed = parseListBlobsXml(xml, container);

    return {
      blobs: parsed.blobs,
      prefixes: parsed.prefixes,
      continuationToken: parsed.nextMarker,
      hasMore: !!parsed.nextMarker,
      clientRequestId: headers['x-ms-client-request-id'],
      requestId: response.headers.get('x-ms-request-id') ?? undefined,
    };
  }

  /**
   * List all blobs (paginated iterator)
   */
  async *listAll(request: ListBlobsRequest): AsyncGenerator<BlobItem> {
    let continuationToken: string | undefined;

    do {
      const response = await this.list({
        ...request,
        continuationToken,
      });

      for (const blob of response.blobs) {
        yield blob;
      }

      continuationToken = response.continuationToken;
    } while (continuationToken);
  }
}

/**
 * Simple Upload Operations
 *
 * Single-request upload for blobs < 256MB.
 */

import type { UploadRequest, UploadResponse } from '../types/index.js';
import type { AuthProvider } from '../auth/index.js';
import type { NormalizedBlobStorageConfig } from '../client/config.js';
import { SIMPLE_UPLOAD_LIMIT, MAX_BLOB_NAME_LENGTH } from '../client/config.js';
import {
  ValidationError,
  createErrorFromResponse,
  NetworkError,
  TimeoutError,
} from '../errors/index.js';

/** Generate a UUID v4 for request IDs */
function generateUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Convert data to Uint8Array */
function toUint8Array(data: Uint8Array | ArrayBuffer | Blob | string): Uint8Array | Promise<Uint8Array> {
  if (data instanceof Uint8Array) {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  if (typeof data === 'string') {
    return new TextEncoder().encode(data);
  }
  // Blob
  return data.arrayBuffer().then((buf) => new Uint8Array(buf));
}

/** Compute base64-encoded MD5 hash */
async function computeMd5(data: Uint8Array): Promise<string> {
  // Use Web Crypto API for MD5 (note: MD5 is deprecated, but Azure requires it)
  // In Node.js, we'd use crypto module
  // This is a placeholder - actual implementation would use a proper MD5 library
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  return btoa(String.fromCharCode(...hashArray)).slice(0, 24);
}

/**
 * Upload executor for simple uploads
 */
export class SimpleUploader {
  constructor(
    private readonly config: NormalizedBlobStorageConfig,
    private readonly authProvider: AuthProvider
  ) {}

  /**
   * Execute a simple upload
   */
  async upload(request: UploadRequest): Promise<UploadResponse> {
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
    if (request.blobName.length > MAX_BLOB_NAME_LENGTH) {
      throw new ValidationError({
        message: `Blob name exceeds maximum length of ${MAX_BLOB_NAME_LENGTH}`,
        field: 'blobName',
      });
    }

    // Convert data to Uint8Array
    let dataArray = toUint8Array(request.data);
    if (dataArray instanceof Promise) {
      dataArray = await dataArray;
    }

    // Check size limit
    if (dataArray.length > SIMPLE_UPLOAD_LIMIT) {
      throw new ValidationError({
        message: `Data size ${dataArray.length} exceeds simple upload limit of ${SIMPLE_UPLOAD_LIMIT}. Use chunked upload for large files.`,
        field: 'data',
      });
    }

    // Build URL
    const url = `${this.config.endpoint}/${encodeURIComponent(container)}/${encodeURIComponent(request.blobName)}`;

    // Build headers
    const headers: Record<string, string> = {
      'x-ms-blob-type': 'BlockBlob',
      'Content-Length': String(dataArray.length),
      'x-ms-version': '2023-11-03',
      'x-ms-client-request-id': generateUuid(),
    };

    // Content type
    if (request.contentType) {
      headers['Content-Type'] = request.contentType;
    }

    // Content encoding
    if (request.contentEncoding) {
      headers['Content-Encoding'] = request.contentEncoding;
    }

    // Content language
    if (request.contentLanguage) {
      headers['Content-Language'] = request.contentLanguage;
    }

    // Cache control
    if (request.cacheControl) {
      headers['Cache-Control'] = request.cacheControl;
    }

    // Content disposition
    if (request.contentDisposition) {
      headers['Content-Disposition'] = request.contentDisposition;
    }

    // Access tier
    if (request.accessTier) {
      headers['x-ms-access-tier'] = request.accessTier;
    }

    // Metadata
    if (request.metadata) {
      for (const [key, value] of Object.entries(request.metadata)) {
        headers[`x-ms-meta-${key}`] = value;
      }
    }

    // Compute MD5 for validation
    const contentMd5 = request.contentMd5 ?? (await computeMd5(dataArray));
    headers['Content-MD5'] = contentMd5;

    // Conditional upload
    if (!request.overwrite) {
      headers['If-None-Match'] = '*';
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

    // Execute request
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      request.timeout ?? this.config.timeout
    );

    try {
      const response = await fetch(finalUrl, {
        method: 'PUT',
        headers,
        body: dataArray,
        signal: request.signal ?? controller.signal,
      });

      clearTimeout(timeoutId);

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
        versionId: response.headers.get('x-ms-version-id') ?? undefined,
        lastModified: new Date(response.headers.get('Last-Modified') ?? Date.now()),
        contentMd5,
        clientRequestId: headers['x-ms-client-request-id'],
        requestId: response.headers.get('x-ms-request-id') ?? undefined,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new TimeoutError({
            message: `Upload timed out after ${request.timeout ?? this.config.timeout}ms`,
            operation: 'upload',
            blobName: request.blobName,
            container,
          });
        }
        if ('code' in error && (error as NodeJS.ErrnoException).code === 'ECONNREFUSED') {
          throw new NetworkError({
            message: `Network error: ${error.message}`,
            cause: error,
            blobName: request.blobName,
            container,
          });
        }
      }
      throw error;
    }
  }
}

/**
 * Append Blob Operations
 *
 * Append data to append blobs (for logs and streaming writes).
 */

import type { AppendRequest, AppendResponse } from '../types/index.js';
import type { AuthProvider } from '../auth/index.js';
import type { NormalizedBlobStorageConfig } from '../client/config.js';
import { MAX_BLOB_NAME_LENGTH } from '../client/config.js';
import {
  ValidationError,
  createErrorFromResponse,
  BlobNotFoundError,
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
function toUint8Array(data: Uint8Array | ArrayBuffer | string): Uint8Array {
  if (data instanceof Uint8Array) {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  return new TextEncoder().encode(data);
}

/**
 * Upload executor for append blobs
 */
export class AppendUploader {
  constructor(
    private readonly config: NormalizedBlobStorageConfig,
    private readonly authProvider: AuthProvider
  ) {}

  /**
   * Append data to an append blob
   */
  async append(request: AppendRequest): Promise<AppendResponse> {
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

    // Convert data
    const dataArray = toUint8Array(request.data);

    // Check if blob exists and create if needed
    if (request.createIfNotExists) {
      const exists = await this.blobExists(container, request.blobName);
      if (!exists) {
        await this.createAppendBlob(container, request.blobName);
      }
    }

    // Append block
    return this.appendBlock(container, request.blobName, dataArray, request);
  }

  /**
   * Check if blob exists
   */
  private async blobExists(container: string, blobName: string): Promise<boolean> {
    const url = `${this.config.endpoint}/${encodeURIComponent(container)}/${encodeURIComponent(blobName)}`;

    const headers: Record<string, string> = {
      'x-ms-version': '2023-11-03',
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

    try {
      const response = await fetch(finalUrl, {
        method: 'HEAD',
        headers,
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Create a new append blob
   */
  private async createAppendBlob(container: string, blobName: string): Promise<void> {
    const url = `${this.config.endpoint}/${encodeURIComponent(container)}/${encodeURIComponent(blobName)}`;

    const headers: Record<string, string> = {
      'x-ms-blob-type': 'AppendBlob',
      'Content-Length': '0',
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
      method: 'PUT',
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
  }

  /**
   * Append a block to the append blob
   */
  private async appendBlock(
    container: string,
    blobName: string,
    data: Uint8Array,
    request: AppendRequest
  ): Promise<AppendResponse> {
    const url = `${this.config.endpoint}/${encodeURIComponent(container)}/${encodeURIComponent(blobName)}?comp=appendblock`;

    const headers: Record<string, string> = {
      'Content-Length': String(data.length),
      'x-ms-version': '2023-11-03',
      'x-ms-client-request-id': generateUuid(),
    };

    // Conditional append position
    if (request.appendPosition !== undefined) {
      headers['x-ms-blob-condition-appendpos'] = String(request.appendPosition);
    }

    // Max size condition
    if (request.maxSize !== undefined) {
      headers['x-ms-blob-condition-maxsize'] = String(request.maxSize);
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
      body: data,
      signal: request.signal,
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
      etag: response.headers.get('ETag') ?? '',
      appendOffset: parseInt(response.headers.get('x-ms-blob-append-offset') ?? '0', 10),
      committedBlockCount: parseInt(
        response.headers.get('x-ms-blob-committed-block-count') ?? '0',
        10
      ),
      lastModified: new Date(response.headers.get('Last-Modified') ?? Date.now()),
      clientRequestId: headers['x-ms-client-request-id'],
      requestId: response.headers.get('x-ms-request-id') ?? undefined,
    };
  }
}

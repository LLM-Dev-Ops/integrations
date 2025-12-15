/**
 * Chunked Upload Operations
 *
 * Block blob upload with parallel blocks for large files.
 */

import type { StreamUploadRequest, UploadResponse } from '../types/index.js';
import type { AuthProvider } from '../auth/index.js';
import type { NormalizedBlobStorageConfig } from '../client/config.js';
import { MAX_BLOB_NAME_LENGTH } from '../client/config.js';
import {
  ValidationError,
  UploadFailedError,
  createErrorFromResponse,
  NetworkError,
} from '../errors/index.js';

/** Generate a UUID v4 for request IDs */
function generateUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Generate a block ID with consistent length */
function generateBlockId(index: number): string {
  const blockIdStr = `block-${String(index).padStart(10, '0')}`;
  return btoa(blockIdStr);
}

/** Collect chunks from async iterable */
async function* chunkedStream(
  stream: AsyncIterable<Uint8Array> | ReadableStream<Uint8Array>,
  chunkSize: number
): AsyncGenerator<{ data: Uint8Array; index: number }> {
  let buffer = new Uint8Array(0);
  let index = 0;

  // Convert ReadableStream to async iterable if needed
  const asyncIterable =
    stream instanceof ReadableStream
      ? (async function* () {
          const reader = stream.getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              if (value) yield value;
            }
          } finally {
            reader.releaseLock();
          }
        })()
      : stream;

  for await (const chunk of asyncIterable) {
    // Append chunk to buffer
    const newBuffer = new Uint8Array(buffer.length + chunk.length);
    newBuffer.set(buffer);
    newBuffer.set(chunk, buffer.length);
    buffer = newBuffer;

    // Yield complete chunks
    while (buffer.length >= chunkSize) {
      yield { data: buffer.slice(0, chunkSize), index };
      buffer = buffer.slice(chunkSize);
      index++;
    }
  }

  // Yield remaining data
  if (buffer.length > 0) {
    yield { data: buffer, index };
  }
}

/**
 * Upload executor for chunked uploads
 */
export class ChunkedUploader {
  constructor(
    private readonly config: NormalizedBlobStorageConfig,
    private readonly authProvider: AuthProvider
  ) {}

  /**
   * Execute a chunked upload using block blob pattern
   */
  async uploadStream(request: StreamUploadRequest): Promise<UploadResponse> {
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

    const chunkSize = request.chunkSize ?? this.config.chunkSize;
    const concurrency = request.concurrency ?? this.config.maxConcurrency;
    const blockIds: string[] = [];
    let totalBytes = 0;

    // Semaphore for concurrency control
    const inFlight: Promise<void>[] = [];
    const errors: Error[] = [];

    // Process chunks
    for await (const { data, index } of chunkedStream(request.stream, chunkSize)) {
      const blockId = generateBlockId(index);
      blockIds[index] = blockId;

      // Check for errors from previous uploads
      if (errors.length > 0) {
        throw errors[0];
      }

      // Wait if too many in flight
      while (inFlight.length >= concurrency) {
        await Promise.race(inFlight);
      }

      // Upload block
      const uploadPromise = this.uploadBlock(
        container,
        request.blobName,
        blockId,
        data,
        request
      )
        .then(() => {
          totalBytes += data.length;
          request.onProgress?.(totalBytes, request.contentLength);
        })
        .catch((err) => {
          errors.push(err instanceof Error ? err : new Error(String(err)));
        })
        .finally(() => {
          const idx = inFlight.indexOf(uploadPromise);
          if (idx !== -1) inFlight.splice(idx, 1);
        });

      inFlight.push(uploadPromise);
    }

    // Wait for all uploads to complete
    await Promise.all(inFlight);

    // Check for errors
    if (errors.length > 0) {
      throw new UploadFailedError({
        message: `Chunked upload failed: ${errors[0]?.message}`,
        reason: errors[0]?.message ?? 'Unknown error',
        blobName: request.blobName,
        container,
        cause: errors[0],
      });
    }

    // Commit block list
    return this.commitBlockList(container, request.blobName, blockIds, request);
  }

  /**
   * Upload a single block
   */
  private async uploadBlock(
    container: string,
    blobName: string,
    blockId: string,
    data: Uint8Array,
    request: StreamUploadRequest
  ): Promise<void> {
    const url = `${this.config.endpoint}/${encodeURIComponent(container)}/${encodeURIComponent(blobName)}?comp=block&blockid=${encodeURIComponent(blockId)}`;

    const headers: Record<string, string> = {
      'Content-Length': String(data.length),
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
  }

  /**
   * Commit the block list to finalize the blob
   */
  private async commitBlockList(
    container: string,
    blobName: string,
    blockIds: string[],
    request: StreamUploadRequest
  ): Promise<UploadResponse> {
    const url = `${this.config.endpoint}/${encodeURIComponent(container)}/${encodeURIComponent(blobName)}?comp=blocklist`;

    // Build block list XML
    const blockListXml = this.buildBlockListXml(blockIds);

    const headers: Record<string, string> = {
      'Content-Type': 'application/xml',
      'Content-Length': String(new TextEncoder().encode(blockListXml).length),
      'x-ms-version': '2023-11-03',
      'x-ms-client-request-id': generateUuid(),
    };

    // Content type for the blob
    if (request.contentType) {
      headers['x-ms-blob-content-type'] = request.contentType;
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
      body: blockListXml,
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
      versionId: response.headers.get('x-ms-version-id') ?? undefined,
      lastModified: new Date(response.headers.get('Last-Modified') ?? Date.now()),
      clientRequestId: headers['x-ms-client-request-id'],
      requestId: response.headers.get('x-ms-request-id') ?? undefined,
    };
  }

  /**
   * Build XML for block list commit
   */
  private buildBlockListXml(blockIds: string[]): string {
    const blocks = blockIds
      .filter((id) => id !== undefined)
      .map((id) => `<Latest>${id}</Latest>`)
      .join('\n    ');

    return `<?xml version="1.0" encoding="utf-8"?>
<BlockList>
    ${blocks}
</BlockList>`;
  }
}

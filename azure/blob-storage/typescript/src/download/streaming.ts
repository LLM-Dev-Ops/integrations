/**
 * Streaming Download Operations
 *
 * Parallel range downloads for large files with ordered reassembly.
 */

import type { StreamDownloadRequest, RangeDownloadRequest, RangeDownloadResponse, DownloadChunk, BlobProperties } from '../types/index.js';
import type { AuthProvider } from '../auth/index.js';
import type { NormalizedBlobStorageConfig } from '../client/config.js';
import {
  ValidationError,
  DownloadFailedError,
  createErrorFromResponse,
} from '../errors/index.js';

/** Generate a UUID v4 for request IDs */
function generateUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Range to download */
interface Range {
  start: number;
  end: number;
}

/** Calculate ranges for parallel download */
function calculateRanges(totalSize: number, chunkSize: number): Range[] {
  const ranges: Range[] = [];
  let start = 0;

  while (start < totalSize) {
    const end = Math.min(start + chunkSize - 1, totalSize - 1);
    ranges.push({ start, end });
    start = end + 1;
  }

  return ranges;
}

/**
 * Download executor for streaming downloads
 */
export class StreamingDownloader {
  constructor(
    private readonly config: NormalizedBlobStorageConfig,
    private readonly authProvider: AuthProvider
  ) {}

  /**
   * Get blob properties to determine size
   */
  async getSize(container: string, blobName: string, versionId?: string): Promise<number> {
    let url = `${this.config.endpoint}/${encodeURIComponent(container)}/${encodeURIComponent(blobName)}`;

    if (versionId) {
      url += `?versionId=${encodeURIComponent(versionId)}`;
    }

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

    const response = await fetch(finalUrl, {
      method: 'HEAD',
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

    return parseInt(response.headers.get('Content-Length') ?? '0', 10);
  }

  /**
   * Download a stream of chunks
   */
  async *downloadStream(request: StreamDownloadRequest): AsyncGenerator<DownloadChunk> {
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

    // Get total size
    const totalSize = await this.getSize(container, request.blobName, request.versionId);
    if (totalSize === 0) {
      return;
    }

    const chunkSize = request.chunkSize ?? this.config.chunkSize;
    const concurrency = request.concurrency ?? this.config.maxConcurrency;
    const ranges = calculateRanges(totalSize, chunkSize);

    // Download chunks with ordered output
    const chunks = new Map<number, Uint8Array>();
    let nextChunkIndex = 0;
    let bytesTransferred = 0;

    // Process ranges with concurrency control
    const inFlight: Promise<{ index: number; data: Uint8Array }>[] = [];
    const errors: Error[] = [];

    for (let i = 0; i < ranges.length; i++) {
      // Check for errors
      if (errors.length > 0) {
        throw errors[0];
      }

      // Wait if too many in flight
      while (inFlight.length >= concurrency) {
        const result = await Promise.race(inFlight);
        chunks.set(result.index, result.data);
        inFlight.splice(
          inFlight.findIndex((p) => p === Promise.resolve(result)),
          1
        );

        // Yield chunks in order
        while (chunks.has(nextChunkIndex)) {
          const data = chunks.get(nextChunkIndex)!;
          chunks.delete(nextChunkIndex);
          bytesTransferred += data.length;
          request.onProgress?.(bytesTransferred, totalSize);

          yield {
            data,
            offset: ranges[nextChunkIndex]!.start,
            totalSize,
          };
          nextChunkIndex++;
        }
      }

      const range = ranges[i]!;
      const downloadPromise = this.downloadRange(
        container,
        request.blobName,
        range.start,
        range.end - range.start + 1,
        request.versionId,
        request.signal
      )
        .then((response) => ({ index: i, data: response.data }))
        .catch((err) => {
          errors.push(err instanceof Error ? err : new Error(String(err)));
          return { index: i, data: new Uint8Array(0) };
        });

      inFlight.push(downloadPromise);
    }

    // Wait for remaining downloads
    while (inFlight.length > 0) {
      const result = await Promise.race(inFlight);
      chunks.set(result.index, result.data);
      inFlight.splice(
        inFlight.findIndex((p) => p === Promise.resolve(result)),
        1
      );

      // Yield chunks in order
      while (chunks.has(nextChunkIndex)) {
        const data = chunks.get(nextChunkIndex)!;
        chunks.delete(nextChunkIndex);
        bytesTransferred += data.length;
        request.onProgress?.(bytesTransferred, totalSize);

        yield {
          data,
          offset: ranges[nextChunkIndex]!.start,
          totalSize,
        };
        nextChunkIndex++;
      }
    }

    // Check for errors
    if (errors.length > 0) {
      throw new DownloadFailedError({
        message: `Streaming download failed: ${errors[0]?.message}`,
        reason: errors[0]?.message ?? 'Unknown error',
        blobName: request.blobName,
        container,
        cause: errors[0],
      });
    }
  }

  /**
   * Download a specific range
   */
  async downloadRange(
    container: string,
    blobName: string,
    offset: number,
    count: number,
    versionId?: string,
    signal?: AbortSignal
  ): Promise<RangeDownloadResponse> {
    let url = `${this.config.endpoint}/${encodeURIComponent(container)}/${encodeURIComponent(blobName)}`;

    if (versionId) {
      url += `?versionId=${encodeURIComponent(versionId)}`;
    }

    const headers: Record<string, string> = {
      'x-ms-version': '2023-11-03',
      'x-ms-client-request-id': generateUuid(),
      Range: `bytes=${offset}-${offset + count - 1}`,
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
      signal,
    });

    if (!response.ok && response.status !== 206) {
      const errorBody = await response.text();
      throw createErrorFromResponse(
        response.status,
        errorBody,
        Object.fromEntries(response.headers.entries()),
        container,
        blobName
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);

    return {
      data,
      contentRange: response.headers.get('Content-Range') ?? '',
      etag: response.headers.get('ETag') ?? '',
      clientRequestId: headers['x-ms-client-request-id'],
      requestId: response.headers.get('x-ms-request-id') ?? undefined,
    };
  }
}

/**
 * Range reader for specific byte ranges
 */
export class RangeReader {
  constructor(
    private readonly config: NormalizedBlobStorageConfig,
    private readonly authProvider: AuthProvider
  ) {}

  /**
   * Read a specific byte range
   */
  async readRange(request: RangeDownloadRequest): Promise<RangeDownloadResponse> {
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

    const downloader = new StreamingDownloader(this.config, this.authProvider);
    return downloader.downloadRange(
      container,
      request.blobName,
      request.offset,
      request.count,
      request.versionId,
      request.signal
    );
  }
}

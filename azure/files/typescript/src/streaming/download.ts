/**
 * Azure Files - Streaming Download
 *
 * Streaming download service for large files.
 * Following the SPARC specification.
 */

import {
  AzureFilesConfig,
  resolveEndpoint,
  encodePath,
  validateShareName,
  validatePath,
  getTimeout,
} from "../config/index.js";
import { parseAzureFilesError } from "../errors.js";
import { AzureAuthProvider } from "../auth/index.js";
import { HttpTransport, isSuccess, getRequestId, getHeader } from "../transport/index.js";
import { DownloadStreamRequest, DownloadRangeRequest } from "../types/requests.js";
import { FileProperties, parseFileProperties } from "../types/common.js";

/**
 * Download progress event.
 */
export interface DownloadProgress {
  /** Bytes downloaded so far. */
  bytesDownloaded: number;
  /** Total bytes to download. */
  totalBytes: number;
  /** Progress percentage (0-100). */
  percentage: number;
}

/**
 * Download progress callback.
 */
export type DownloadProgressCallback = (progress: DownloadProgress) => void;

/**
 * Streaming download service.
 */
export class StreamingDownloadService {
  private config: AzureFilesConfig;
  private transport: HttpTransport;
  private authProvider: AzureAuthProvider;

  constructor(
    config: AzureFilesConfig,
    transport: HttpTransport,
    authProvider: AzureAuthProvider
  ) {
    this.config = config;
    this.transport = transport;
    this.authProvider = authProvider;
  }

  /**
   * Download a file as an async iterable of chunks.
   */
  async *downloadStream(
    request: DownloadStreamRequest,
    onProgress?: DownloadProgressCallback
  ): AsyncIterable<Buffer> {
    validateShareName(request.share);
    validatePath(request.path);

    // Get file size first
    const props = await this.getProperties(request.share, request.path, request.leaseId);
    const fileSize = props.size;

    if (fileSize === 0) {
      return;
    }

    const rangeSize = request.bufferSize ?? this.config.rangeSize;
    let offset = 0;

    while (offset < fileSize) {
      const rangeEnd = Math.min(offset + rangeSize - 1, fileSize - 1);

      const chunk = await this.downloadRange({
        share: request.share,
        path: request.path,
        start: offset,
        end: rangeEnd,
        leaseId: request.leaseId,
      });

      yield chunk;

      offset = rangeEnd + 1;

      if (onProgress) {
        onProgress({
          bytesDownloaded: offset,
          totalBytes: fileSize,
          percentage: Math.round((offset / fileSize) * 100),
        });
      }
    }
  }

  /**
   * Download a specific byte range.
   */
  async downloadRange(request: DownloadRangeRequest): Promise<Buffer> {
    validateShareName(request.share);
    validatePath(request.path);

    const endpoint = resolveEndpoint(this.config);
    const url = `${endpoint}/${request.share}/${encodePath(request.path)}`;

    const headers: Record<string, string> = {
      Range: `bytes=${request.start}-${request.end}`,
    };

    if (request.leaseId) {
      headers["x-ms-lease-id"] = request.leaseId;
    }

    const signed = this.authProvider.signRequest("GET", url, headers);

    const response = await this.transport.send({
      method: "GET",
      url: signed.url,
      headers: signed.headers,
      timeout: getTimeout(this.config, "read", request.end - request.start),
    });

    if (!isSuccess(response)) {
      throw parseAzureFilesError(
        response.status,
        response.body.toString(),
        response.headers,
        getRequestId(response)
      );
    }

    return response.body;
  }

  /**
   * Download entire file to buffer with progress.
   */
  async downloadToBuffer(
    request: DownloadStreamRequest,
    onProgress?: DownloadProgressCallback
  ): Promise<Buffer> {
    const chunks: Buffer[] = [];

    for await (const chunk of this.downloadStream(request, onProgress)) {
      chunks.push(chunk);
    }

    return Buffer.concat(chunks);
  }

  /**
   * Get file properties.
   */
  private async getProperties(
    share: string,
    path: string,
    leaseId?: string
  ): Promise<FileProperties> {
    const endpoint = resolveEndpoint(this.config);
    const url = `${endpoint}/${share}/${encodePath(path)}`;

    const headers: Record<string, string> = {};

    if (leaseId) {
      headers["x-ms-lease-id"] = leaseId;
    }

    const signed = this.authProvider.signRequest("HEAD", url, headers);

    const response = await this.transport.send({
      method: "HEAD",
      url: signed.url,
      headers: signed.headers,
      timeout: getTimeout(this.config, "read"),
    });

    if (!isSuccess(response)) {
      throw parseAzureFilesError(
        response.status,
        response.body.toString(),
        response.headers,
        getRequestId(response)
      );
    }

    return parseFileProperties(response.headers);
  }
}

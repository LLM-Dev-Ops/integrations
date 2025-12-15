/**
 * Azure Files - Streaming Upload
 *
 * Streaming upload service for large files.
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
import { HttpTransport, isSuccess, getRequestId } from "../transport/index.js";
import { UploadStreamRequest } from "../types/requests.js";
import { FileInfo, parseFileInfo } from "../types/common.js";

/**
 * Upload progress event.
 */
export interface UploadProgress {
  /** Bytes uploaded so far. */
  bytesUploaded: number;
  /** Total bytes to upload. */
  totalBytes: number;
  /** Progress percentage (0-100). */
  percentage: number;
}

/**
 * Upload progress callback.
 */
export type UploadProgressCallback = (progress: UploadProgress) => void;

/**
 * Streaming upload service.
 */
export class StreamingUploadService {
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
   * Upload a stream to a file.
   */
  async uploadStream(
    request: UploadStreamRequest,
    stream: AsyncIterable<Buffer>,
    onProgress?: UploadProgressCallback
  ): Promise<FileInfo> {
    validateShareName(request.share);
    validatePath(request.path);

    // Create the file with specified size
    await this.createFile(request);

    // Upload in ranges
    const rangeSize = this.config.rangeSize;
    let offset = 0;
    let buffer = Buffer.alloc(0);

    for await (const chunk of stream) {
      buffer = Buffer.concat([buffer, chunk]);

      // Upload complete ranges
      while (buffer.length >= rangeSize) {
        const rangeData = buffer.subarray(0, rangeSize);
        await this.putRange(
          request.share,
          request.path,
          offset,
          rangeData,
          request.leaseId
        );

        offset += rangeSize;
        buffer = buffer.subarray(rangeSize);

        if (onProgress) {
          onProgress({
            bytesUploaded: offset,
            totalBytes: request.totalSize,
            percentage: Math.round((offset / request.totalSize) * 100),
          });
        }
      }
    }

    // Flush remaining data
    if (buffer.length > 0) {
      await this.putRange(
        request.share,
        request.path,
        offset,
        buffer,
        request.leaseId
      );

      offset += buffer.length;

      if (onProgress) {
        onProgress({
          bytesUploaded: offset,
          totalBytes: request.totalSize,
          percentage: 100,
        });
      }
    }

    // Get and return final file info
    return this.getFileInfo(request.share, request.path);
  }

  /**
   * Upload a buffer in chunks with progress.
   */
  async uploadBuffer(
    request: UploadStreamRequest,
    data: Buffer,
    onProgress?: UploadProgressCallback
  ): Promise<FileInfo> {
    async function* bufferToStream(buf: Buffer, chunkSize: number): AsyncIterable<Buffer> {
      let offset = 0;
      while (offset < buf.length) {
        const end = Math.min(offset + chunkSize, buf.length);
        yield buf.subarray(offset, end);
        offset = end;
      }
    }

    const chunkSize = this.config.rangeSize;
    return this.uploadStream(request, bufferToStream(data, chunkSize), onProgress);
  }

  /**
   * Create a zero-length file with specified size.
   */
  private async createFile(request: UploadStreamRequest): Promise<void> {
    const endpoint = resolveEndpoint(this.config);
    const url = `${endpoint}/${request.share}/${encodePath(request.path)}`;

    const headers: Record<string, string> = {
      "x-ms-type": "file",
      "x-ms-content-length": request.totalSize.toString(),
      "x-ms-file-attributes": "None",
      "x-ms-file-creation-time": "now",
      "x-ms-file-last-write-time": "now",
    };

    if (request.contentType) {
      headers["x-ms-content-type"] = request.contentType;
    }

    if (request.metadata) {
      for (const [key, value] of Object.entries(request.metadata)) {
        headers[`x-ms-meta-${key}`] = value;
      }
    }

    if (request.leaseId) {
      headers["x-ms-lease-id"] = request.leaseId;
    }

    const signed = this.authProvider.signRequest("PUT", url, headers, 0);

    const response = await this.transport.send({
      method: "PUT",
      url: signed.url,
      headers: signed.headers,
      timeout: getTimeout(this.config, "write"),
    });

    if (!isSuccess(response)) {
      throw parseAzureFilesError(
        response.status,
        response.body.toString(),
        response.headers,
        getRequestId(response)
      );
    }
  }

  /**
   * Put a range of data to a file.
   */
  private async putRange(
    share: string,
    path: string,
    offset: number,
    data: Buffer,
    leaseId?: string
  ): Promise<void> {
    const endpoint = resolveEndpoint(this.config);
    const url = `${endpoint}/${share}/${encodePath(path)}?comp=range`;

    const endOffset = offset + data.length - 1;

    const headers: Record<string, string> = {
      "x-ms-range": `bytes=${offset}-${endOffset}`,
      "x-ms-write": "update",
      "Content-Length": data.length.toString(),
    };

    if (leaseId) {
      headers["x-ms-lease-id"] = leaseId;
    }

    const signed = this.authProvider.signRequest("PUT", url, headers, data.length);

    const response = await this.transport.send({
      method: "PUT",
      url: signed.url,
      headers: signed.headers,
      body: data,
      timeout: getTimeout(this.config, "write"),
    });

    if (!isSuccess(response)) {
      throw parseAzureFilesError(
        response.status,
        response.body.toString(),
        response.headers,
        getRequestId(response)
      );
    }
  }

  /**
   * Get file info after upload.
   */
  private async getFileInfo(share: string, path: string): Promise<FileInfo> {
    const endpoint = resolveEndpoint(this.config);
    const url = `${endpoint}/${share}/${encodePath(path)}`;

    const headers: Record<string, string> = {};
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

    return parseFileInfo(share, path, response.headers);
  }
}

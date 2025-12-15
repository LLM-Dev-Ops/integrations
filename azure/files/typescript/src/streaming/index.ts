/**
 * Azure Files Streaming Module
 *
 * Re-exports streaming upload and download services.
 */

export {
  StreamingUploadService,
  type UploadProgress,
  type UploadProgressCallback,
} from "./upload.js";

export {
  StreamingDownloadService,
  type DownloadProgress,
  type DownloadProgressCallback,
} from "./download.js";

import { AzureFilesConfig } from "../config/index.js";
import { AzureAuthProvider } from "../auth/index.js";
import { HttpTransport } from "../transport/index.js";
import { StreamingUploadService } from "./upload.js";
import { StreamingDownloadService } from "./download.js";
import { UploadStreamRequest, DownloadStreamRequest, DownloadRangeRequest } from "../types/requests.js";
import { FileInfo } from "../types/common.js";
import { UploadProgressCallback } from "./upload.js";
import { DownloadProgressCallback } from "./download.js";

/**
 * Combined streaming service for Azure Files.
 */
export class StreamingService {
  private uploadService: StreamingUploadService;
  private downloadService: StreamingDownloadService;

  constructor(
    config: AzureFilesConfig,
    transport: HttpTransport,
    authProvider: AzureAuthProvider
  ) {
    this.uploadService = new StreamingUploadService(config, transport, authProvider);
    this.downloadService = new StreamingDownloadService(config, transport, authProvider);
  }

  /**
   * Upload a stream to a file.
   */
  async uploadStream(
    request: UploadStreamRequest,
    stream: AsyncIterable<Buffer>,
    onProgress?: UploadProgressCallback
  ): Promise<FileInfo> {
    return this.uploadService.uploadStream(request, stream, onProgress);
  }

  /**
   * Upload a buffer with progress.
   */
  async uploadBuffer(
    request: UploadStreamRequest,
    data: Buffer,
    onProgress?: UploadProgressCallback
  ): Promise<FileInfo> {
    return this.uploadService.uploadBuffer(request, data, onProgress);
  }

  /**
   * Download a file as an async iterable of chunks.
   */
  async *downloadStream(
    request: DownloadStreamRequest,
    onProgress?: DownloadProgressCallback
  ): AsyncIterable<Buffer> {
    yield* this.downloadService.downloadStream(request, onProgress);
  }

  /**
   * Download a specific byte range.
   */
  async downloadRange(request: DownloadRangeRequest): Promise<Buffer> {
    return this.downloadService.downloadRange(request);
  }

  /**
   * Download entire file to buffer with progress.
   */
  async downloadToBuffer(
    request: DownloadStreamRequest,
    onProgress?: DownloadProgressCallback
  ): Promise<Buffer> {
    return this.downloadService.downloadToBuffer(request, onProgress);
  }
}

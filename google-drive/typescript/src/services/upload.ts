/**
 * Resumable upload service for Google Drive.
 *
 * Handles large file uploads using the resumable upload protocol.
 */

import { DriveFile } from '../types';

/**
 * Result of uploading a chunk.
 */
export type UploadChunkResult =
  | { status: 'in_progress'; bytesReceived: number }
  | { status: 'complete'; file: DriveFile };

/**
 * Status of a resumable upload.
 */
export interface UploadStatus {
  bytesReceived: number;
  totalSize: number;
  isComplete: boolean;
}

/**
 * Resumable upload session for large files.
 */
export interface ResumableUploadSession {
  /** Get the resumable upload URI */
  readonly uploadUri: string;

  /**
   * Upload a chunk of data.
   *
   * @param chunk - The data chunk to upload
   * @param offset - Byte offset where this chunk starts
   * @param totalSize - Total size of the file
   * @returns Upload result indicating progress or completion
   */
  uploadChunk(
    chunk: ArrayBuffer,
    offset: number,
    totalSize: number
  ): Promise<UploadChunkResult>;

  /**
   * Upload the entire content from a stream.
   *
   * @param stream - Async iterable of data chunks
   * @param totalSize - Total size of the file
   * @param chunkSize - Size of each chunk (default: 8MB)
   * @returns The uploaded file
   */
  uploadStream(
    stream: AsyncIterable<Uint8Array>,
    totalSize: number,
    chunkSize?: number
  ): Promise<DriveFile>;

  /**
   * Query the current upload status.
   *
   * @returns Current upload status
   */
  queryStatus(): Promise<UploadStatus>;

  /**
   * Resume an interrupted upload.
   *
   * @returns Current upload status after resume
   */
  resume(): Promise<UploadStatus>;

  /**
   * Cancel the upload.
   */
  cancel(): Promise<void>;
}

/**
 * HTTP transport interface for upload operations.
 */
export interface UploadTransport {
  /**
   * Upload a chunk to the resumable URI.
   */
  uploadChunk(
    uri: string,
    chunk: ArrayBuffer,
    offset: number,
    totalSize: number
  ): Promise<{ status: number; body?: any; range?: string }>;

  /**
   * Query the status of an upload.
   */
  queryUploadStatus(uri: string, totalSize: number): Promise<{ status: number; range?: string }>;

  /**
   * Delete/cancel an upload session.
   */
  cancelUpload(uri: string): Promise<void>;
}

/**
 * Implementation of ResumableUploadSession.
 */
export class ResumableUploadSessionImpl implements ResumableUploadSession {
  constructor(
    public readonly uploadUri: string,
    private transport: UploadTransport
  ) {}

  async uploadChunk(
    chunk: ArrayBuffer,
    offset: number,
    totalSize: number
  ): Promise<UploadChunkResult> {
    const response = await this.transport.uploadChunk(this.uploadUri, chunk, offset, totalSize);

    // 308 Resume Incomplete - more chunks needed
    if (response.status === 308) {
      const range = response.range;
      const bytesReceived = range
        ? parseInt(range.split('-')[1], 10) + 1
        : offset + chunk.byteLength;

      return {
        status: 'in_progress',
        bytesReceived,
      };
    }

    // 200 or 201 - upload complete
    if (response.status === 200 || response.status === 201) {
      return {
        status: 'complete',
        file: response.body as DriveFile,
      };
    }

    throw new Error(`Unexpected upload response: ${response.status}`);
  }

  async uploadStream(
    stream: AsyncIterable<Uint8Array>,
    totalSize: number,
    chunkSize: number = 8 * 1024 * 1024 // 8MB default
  ): Promise<DriveFile> {
    let offset = 0;
    let buffer: Uint8Array[] = [];
    let bufferSize = 0;

    for await (const chunk of stream) {
      buffer.push(chunk);
      bufferSize += chunk.byteLength;

      // Upload when we have enough data
      if (bufferSize >= chunkSize) {
        const uploadChunk = this.concatenateChunks(buffer, bufferSize);
        const result = await this.uploadChunk(uploadChunk, offset, totalSize);

        if (result.status === 'complete') {
          return result.file;
        }

        offset = result.bytesReceived;
        buffer = [];
        bufferSize = 0;
      }
    }

    // Upload remaining data
    if (bufferSize > 0) {
      const uploadChunk = this.concatenateChunks(buffer, bufferSize);
      const result = await this.uploadChunk(uploadChunk, offset, totalSize);

      if (result.status === 'complete') {
        return result.file;
      }
    }

    throw new Error('Upload stream ended without completion');
  }

  async queryStatus(): Promise<UploadStatus> {
    const response = await this.transport.queryUploadStatus(this.uploadUri, 0);

    if (response.status === 200 || response.status === 201) {
      // Upload is complete
      return {
        bytesReceived: 0,
        totalSize: 0,
        isComplete: true,
      };
    }

    if (response.status === 308) {
      const range = response.range;
      const bytesReceived = range ? parseInt(range.split('-')[1], 10) + 1 : 0;

      return {
        bytesReceived,
        totalSize: 0,
        isComplete: false,
      };
    }

    return {
      bytesReceived: 0,
      totalSize: 0,
      isComplete: false,
    };
  }

  async resume(): Promise<UploadStatus> {
    return this.queryStatus();
  }

  async cancel(): Promise<void> {
    await this.transport.cancelUpload(this.uploadUri);
  }

  /**
   * Concatenate multiple chunks into a single ArrayBuffer.
   */
  private concatenateChunks(chunks: Uint8Array[], totalSize: number): ArrayBuffer {
    const result = new Uint8Array(totalSize);
    let offset = 0;

    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return result.buffer;
  }
}

/**
 * Mock implementation for testing.
 */
export class MockResumableUploadSession implements ResumableUploadSession {
  public readonly uploadUri: string;
  private bytesUploaded = 0;
  private cancelled = false;

  constructor(uploadUri: string = 'https://example.com/upload') {
    this.uploadUri = uploadUri;
  }

  async uploadChunk(
    chunk: ArrayBuffer,
    offset: number,
    totalSize: number
  ): Promise<UploadChunkResult> {
    if (this.cancelled) {
      throw new Error('Upload cancelled');
    }

    this.bytesUploaded = offset + chunk.byteLength;

    if (this.bytesUploaded >= totalSize) {
      return {
        status: 'complete',
        file: {
          kind: 'drive#file',
          id: 'mock-file-id',
          name: 'mock-file.txt',
          mimeType: 'text/plain',
          size: totalSize.toString(),
        } as DriveFile,
      };
    }

    return {
      status: 'in_progress',
      bytesReceived: this.bytesUploaded,
    };
  }

  async uploadStream(
    stream: AsyncIterable<Uint8Array>,
    totalSize: number,
    chunkSize?: number
  ): Promise<DriveFile> {
    let offset = 0;

    for await (const chunk of stream) {
      const result = await this.uploadChunk(chunk.buffer, offset, totalSize);
      if (result.status === 'complete') {
        return result.file;
      }
      offset = result.bytesReceived;
    }

    throw new Error('Stream ended without completion');
  }

  async queryStatus(): Promise<UploadStatus> {
    return {
      bytesReceived: this.bytesUploaded,
      totalSize: 0,
      isComplete: false,
    };
  }

  async resume(): Promise<UploadStatus> {
    return this.queryStatus();
  }

  async cancel(): Promise<void> {
    this.cancelled = true;
  }
}

/**
 * Create a mock resumable upload session.
 */
export function createMockUploadSession(uploadUri?: string): ResumableUploadSession {
  return new MockResumableUploadSession(uploadUri);
}

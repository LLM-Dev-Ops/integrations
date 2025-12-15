/**
 * Streaming Service
 *
 * GCS streaming operations: resumable upload, streaming download.
 * Following the SPARC specification.
 */

import { GcsConfig, resolveEndpoint, encodeObjectName, validateBucketName, validateObjectName } from "../config/index.js";
import { UploadError, DownloadError, parseGcsError } from "../error/index.js";
import { GcpAuthProvider } from "../credentials/index.js";
import { HttpTransport, isSuccess, getHeader, getRequestId, getContentLength, getContentType } from "../transport/index.js";
import {
  UploadStreamRequest,
  DownloadStreamRequest,
  DownloadRangeRequest,
  CreateResumableUploadRequest,
} from "../types/requests.js";
import {
  ObjectMetadata,
  ChunkResult,
  parseObjectMetadata,
} from "../types/common.js";
import {
  DownloadStreamResponse,
  DownloadRangeResponse,
  ResumableUploadSession,
  ResumableUploadStatus,
} from "../types/responses.js";

/**
 * Streaming service for GCS streaming operations.
 */
export class StreamingService {
  private config: GcsConfig;
  private transport: HttpTransport;
  private authProvider: GcpAuthProvider;

  constructor(config: GcsConfig, transport: HttpTransport, authProvider: GcpAuthProvider) {
    this.config = config;
    this.transport = transport;
    this.authProvider = authProvider;
  }

  /**
   * Upload from an async stream.
   */
  async uploadStream(
    request: UploadStreamRequest,
    stream: AsyncIterable<Buffer>
  ): Promise<ObjectMetadata> {
    validateBucketName(request.bucket);
    validateObjectName(request.name);

    // Collect all data from stream
    const chunks: Buffer[] = [];
    let totalSize = 0;
    for await (const chunk of stream) {
      chunks.push(chunk);
      totalSize += chunk.length;
    }
    const data = Buffer.concat(chunks);

    // Determine upload strategy based on size
    if (data.length <= this.config.simpleUploadThreshold) {
      return this.simpleUpload(request, data);
    }

    // Use resumable upload for larger files
    const session = await this.createResumableUpload({
      bucket: request.bucket,
      name: request.name,
      totalSize: data.length,
      contentType: request.contentType,
      metadata: request.metadata,
    });

    const chunkSize = request.chunkSize ?? this.config.uploadChunkSize;
    let offset = 0;

    while (offset < data.length) {
      const end = Math.min(offset + chunkSize, data.length);
      const chunk = data.subarray(offset, end);

      const result = await this.uploadChunk(session, chunk, offset, data.length);

      if (result.type === "complete") {
        return result.metadata;
      }

      offset = result.bytesUploaded;
    }

    throw new UploadError("Upload did not complete as expected", "ChunkFailed");
  }

  /**
   * Simple upload for small files.
   */
  private async simpleUpload(request: UploadStreamRequest, data: Buffer): Promise<ObjectMetadata> {
    const endpoint = resolveEndpoint(this.config);
    const token = await this.authProvider.getAccessToken();

    const params = new URLSearchParams({
      uploadType: "media",
      name: request.name,
    });

    const url = `${endpoint}/upload/storage/v1/b/${request.bucket}/o?${params.toString()}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "Content-Type": request.contentType ?? "application/octet-stream",
      "Content-Length": String(data.length),
    };

    if (request.metadata) {
      for (const [key, value] of Object.entries(request.metadata)) {
        headers[`x-goog-meta-${key}`] = value;
      }
    }

    const response = await this.transport.send({
      method: "POST",
      url,
      headers,
      body: data,
      timeout: this.config.timeout,
    });

    if (!isSuccess(response)) {
      throw parseGcsError(response.status, response.body.toString(), getRequestId(response));
    }

    const json = JSON.parse(response.body.toString());
    return parseObjectMetadata(json);
  }

  /**
   * Create a resumable upload session.
   */
  async createResumableUpload(request: CreateResumableUploadRequest): Promise<ResumableUploadSession> {
    validateBucketName(request.bucket);
    validateObjectName(request.name);

    const endpoint = resolveEndpoint(this.config);
    const token = await this.authProvider.getAccessToken();

    const params = new URLSearchParams({
      uploadType: "resumable",
      name: request.name,
    });

    const url = `${endpoint}/upload/storage/v1/b/${request.bucket}/o?${params.toString()}`;

    const body: Record<string, unknown> = {
      name: request.name,
    };
    if (request.metadata) {
      body.metadata = request.metadata;
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Upload-Content-Type": request.contentType ?? "application/octet-stream",
      "X-Upload-Content-Length": String(request.totalSize),
    };

    const response = await this.transport.send({
      method: "POST",
      url,
      headers,
      body: JSON.stringify(body),
      timeout: this.config.timeout,
    });

    if (!isSuccess(response)) {
      throw parseGcsError(response.status, response.body.toString(), getRequestId(response));
    }

    const resumableUri = getHeader(response, "location");
    if (!resumableUri) {
      throw new UploadError("No Location header in resumable upload response", "InitiationFailed");
    }

    return {
      uri: resumableUri,
      bucket: request.bucket,
      objectName: request.name,
      totalSize: request.totalSize,
      bytesUploaded: 0,
    };
  }

  /**
   * Upload a chunk to a resumable upload session.
   */
  async uploadChunk(
    session: ResumableUploadSession,
    chunk: Buffer,
    offset: number,
    totalSize: number
  ): Promise<ChunkResult> {
    const startByte = offset;
    const endByte = offset + chunk.length - 1;

    const headers: Record<string, string> = {
      "Content-Length": String(chunk.length),
      "Content-Range": `bytes ${startByte}-${endByte}/${totalSize}`,
    };

    const response = await this.transport.send({
      method: "PUT",
      url: session.uri,
      headers,
      body: chunk,
      timeout: this.config.timeout,
    });

    if (response.status === 308) {
      // Incomplete, more chunks needed
      const rangeHeader = getHeader(response, "range");
      let bytesUploaded = offset + chunk.length;

      if (rangeHeader) {
        const match = rangeHeader.match(/bytes=0-(\d+)/);
        if (match) {
          bytesUploaded = parseInt(match[1], 10) + 1;
        }
      }

      return { type: "incomplete", bytesUploaded };
    }

    if (response.status === 200 || response.status === 201) {
      // Upload complete
      const json = JSON.parse(response.body.toString());
      return { type: "complete", metadata: parseObjectMetadata(json) };
    }

    throw parseGcsError(response.status, response.body.toString(), getRequestId(response));
  }

  /**
   * Query the status of a resumable upload.
   */
  async queryUploadStatus(session: ResumableUploadSession): Promise<ResumableUploadStatus> {
    const headers: Record<string, string> = {
      "Content-Length": "0",
      "Content-Range": `bytes */${session.totalSize}`,
    };

    const response = await this.transport.send({
      method: "PUT",
      url: session.uri,
      headers,
      timeout: this.config.timeout,
    });

    if (response.status === 308) {
      // Upload incomplete
      const rangeHeader = getHeader(response, "range");
      let bytesUploaded = 0;

      if (rangeHeader) {
        const match = rangeHeader.match(/bytes=0-(\d+)/);
        if (match) {
          bytesUploaded = parseInt(match[1], 10) + 1;
        }
      }

      return { complete: false, bytesUploaded };
    }

    if (response.status === 200 || response.status === 201) {
      const json = JSON.parse(response.body.toString());
      return {
        complete: true,
        bytesUploaded: session.totalSize,
        metadata: parseObjectMetadata(json),
      };
    }

    if (response.status === 404) {
      throw new UploadError("Upload session expired or not found", "SessionExpired");
    }

    throw parseGcsError(response.status, response.body.toString(), getRequestId(response));
  }

  /**
   * Abort a resumable upload.
   */
  async abortUpload(session: ResumableUploadSession): Promise<void> {
    try {
      await this.transport.send({
        method: "DELETE",
        url: session.uri,
        headers: {},
        timeout: this.config.timeout,
      });
    } catch {
      // Ignore errors on abort
    }
  }

  /**
   * Download as an async stream.
   */
  async downloadStream(request: DownloadStreamRequest): Promise<DownloadStreamResponse> {
    validateBucketName(request.bucket);
    validateObjectName(request.object);

    const endpoint = resolveEndpoint(this.config);
    const token = await this.authProvider.getAccessToken();
    const encodedName = encodeObjectName(request.object);

    const params = new URLSearchParams({
      alt: "media",
    });
    if (request.generation) {
      params.set("generation", request.generation);
    }

    const url = `${endpoint}/storage/v1/b/${request.bucket}/o/${encodedName}?${params.toString()}`;

    // Check if transport supports streaming
    if (!this.transport.sendStreaming) {
      throw new DownloadError(
        "Transport does not support streaming downloads",
        "StreamInterrupted"
      );
    }

    const response = await this.transport.sendStreaming({
      method: "GET",
      url,
      headers: {
        Authorization: `Bearer ${token}`,
      },
      timeout: this.config.timeout,
    });

    if (response.status !== 200) {
      // Collect error body
      const chunks: Buffer[] = [];
      for await (const chunk of response.stream) {
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks).toString();
      throw parseGcsError(response.status, body, getHeader(response, "x-goog-request-id"));
    }

    return {
      stream: response.stream,
      contentLength: getContentLength(response),
      contentType: getContentType(response),
      generation: getHeader(response, "x-goog-generation"),
    };
  }

  /**
   * Download a byte range.
   */
  async downloadRange(request: DownloadRangeRequest): Promise<DownloadRangeResponse> {
    validateBucketName(request.bucket);
    validateObjectName(request.object);

    const endpoint = resolveEndpoint(this.config);
    const token = await this.authProvider.getAccessToken();
    const encodedName = encodeObjectName(request.object);

    const params = new URLSearchParams({
      alt: "media",
    });
    if (request.generation) {
      params.set("generation", request.generation);
    }

    const url = `${endpoint}/storage/v1/b/${request.bucket}/o/${encodedName}?${params.toString()}`;

    const response = await this.transport.send({
      method: "GET",
      url,
      headers: {
        Authorization: `Bearer ${token}`,
        Range: `bytes=${request.start}-${request.end}`,
      },
      timeout: this.config.timeout,
    });

    if (response.status === 416) {
      throw new DownloadError(
        `Range ${request.start}-${request.end} not satisfiable`,
        "RangeNotSatisfiable"
      );
    }

    if (response.status !== 206 && response.status !== 200) {
      throw parseGcsError(response.status, response.body.toString(), getRequestId(response));
    }

    const contentRange = getHeader(response, "content-range") ?? "";
    const totalLengthMatch = contentRange.match(/\/(\d+)$/);
    const totalLength = totalLengthMatch ? parseInt(totalLengthMatch[1], 10) : response.body.length;

    return {
      data: response.body,
      contentRange,
      totalLength,
    };
  }
}

/**
 * Determine chunk size based on total file size.
 */
export function determineChunkSize(totalSize: number): number {
  // Chunk size must be multiple of 256KB for GCS
  const MB = 1024 * 1024;

  if (totalSize < 5 * MB) {
    return totalSize; // Use simple upload instead
  } else if (totalSize < 100 * MB) {
    return 8 * MB;
  } else if (totalSize < 1024 * MB) {
    return 16 * MB;
  } else {
    return 32 * MB;
  }
}

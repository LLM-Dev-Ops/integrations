/**
 * Mock service implementations for testing
 * @module @studiorack/cloudflare-r2/simulation
 */

import type {
  PutObjectRequest,
  GetObjectRequest,
  DeleteObjectRequest,
  DeleteObjectsRequest,
  HeadObjectRequest,
  CopyObjectRequest,
  ListObjectsRequest,
  CreateMultipartRequest,
  UploadPartRequest,
  CompleteMultipartRequest,
  AbortMultipartRequest,
  ListPartsRequest,
  ListMultipartUploadsRequest,
  PresignGetRequest,
  PresignPutRequest,
} from '../types/requests.js';
import type {
  PutObjectOutput,
  GetObjectOutput,
  GetObjectStreamOutput,
  DeleteObjectOutput,
  DeleteObjectsOutput,
  HeadObjectOutput,
  CopyObjectOutput,
  ListObjectsOutput,
  CreateMultipartOutput,
  UploadPartOutput,
  CompleteMultipartOutput,
  AbortMultipartOutput,
  ListPartsOutput,
  ListMultipartUploadsOutput,
  PresignedUrl,
} from '../types/responses.js';
import type { R2Object, CommonPrefix, Part } from '../types/common.js';
import type { MultipartUpload } from '../types/responses.js';
import type { StoredObject, MultipartUpload as InternalMultipartUpload, MockClientOptions } from './types.js';
import { ObjectError, MultipartError } from '../errors/index.js';
import {
  generateETag,
  generateUploadId,
  generateRequestId,
  concatenateArrays,
  matchesPrefix,
  extractCommonPrefixes,
} from './utils.js';

/**
 * Mock implementation of R2ObjectsService
 *
 * Provides in-memory simulation of R2 object operations for testing.
 */
export class MockObjectsService {
  constructor(
    private readonly store: Map<string, StoredObject>,
    private readonly options: MockClientOptions = {}
  ) {}

  /**
   * Upload an object
   */
  async putObject(request: PutObjectRequest): Promise<PutObjectOutput> {
    await this.simulateLatency();
    this.simulateError();

    const key = this.makeKey(request.bucket, request.key);
    const data = await this.bodyToUint8Array(request.body);
    const eTag = generateETag(data);

    const stored: StoredObject = {
      data,
      contentType: request.contentType,
      metadata: request.metadata || {},
      eTag,
      lastModified: new Date(),
      contentEncoding: request.contentEncoding,
      contentLanguage: request.contentLanguage,
      contentDisposition: request.contentDisposition,
      cacheControl: request.cacheControl,
    };

    this.store.set(key, stored);

    return {
      eTag,
      requestId: generateRequestId(),
    };
  }

  /**
   * Retrieve an object (buffered)
   */
  async getObject(request: GetObjectRequest): Promise<GetObjectOutput> {
    await this.simulateLatency();
    this.simulateError();

    const key = this.makeKey(request.bucket, request.key);
    const stored = this.store.get(key);

    if (!stored) {
      throw ObjectError.notFound(request.key);
    }

    return {
      body: Buffer.from(stored.data),
      contentLength: stored.data.length,
      contentType: stored.contentType,
      eTag: stored.eTag,
      lastModified: stored.lastModified,
      metadata: stored.metadata,
      contentEncoding: stored.contentEncoding,
      contentLanguage: stored.contentLanguage,
      contentDisposition: stored.contentDisposition,
      cacheControl: stored.cacheControl,
      requestId: generateRequestId(),
    };
  }

  /**
   * Retrieve an object (streaming)
   */
  async getObjectStream(request: GetObjectRequest): Promise<GetObjectStreamOutput> {
    await this.simulateLatency();
    this.simulateError();

    const key = this.makeKey(request.bucket, request.key);
    const stored = this.store.get(key);

    if (!stored) {
      throw ObjectError.notFound(request.key);
    }

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(stored.data);
        controller.close();
      },
    });

    return {
      body: stream,
      contentLength: stored.data.length,
      contentType: stored.contentType,
      eTag: stored.eTag,
      lastModified: stored.lastModified,
      metadata: stored.metadata,
      contentEncoding: stored.contentEncoding,
      contentLanguage: stored.contentLanguage,
      contentDisposition: stored.contentDisposition,
      cacheControl: stored.cacheControl,
      requestId: generateRequestId(),
    };
  }

  /**
   * Delete an object
   */
  async deleteObject(request: DeleteObjectRequest): Promise<DeleteObjectOutput> {
    await this.simulateLatency();
    this.simulateError();

    const key = this.makeKey(request.bucket, request.key);
    this.store.delete(key);

    return {
      requestId: generateRequestId(),
    };
  }

  /**
   * Delete multiple objects
   */
  async deleteObjects(request: DeleteObjectsRequest): Promise<DeleteObjectsOutput> {
    await this.simulateLatency();
    this.simulateError();

    const deleted = request.objects.map((obj) => {
      const key = this.makeKey(request.bucket, obj.key);
      this.store.delete(key);

      return {
        key: obj.key,
        versionId: obj.versionId,
      };
    });

    return {
      deleted,
      errors: [],
      requestId: generateRequestId(),
    };
  }

  /**
   * Get object metadata
   */
  async headObject(request: HeadObjectRequest): Promise<HeadObjectOutput> {
    await this.simulateLatency();
    this.simulateError();

    const key = this.makeKey(request.bucket, request.key);
    const stored = this.store.get(key);

    if (!stored) {
      throw ObjectError.notFound(request.key);
    }

    return {
      contentLength: stored.data.length,
      contentType: stored.contentType,
      eTag: stored.eTag,
      lastModified: stored.lastModified,
      metadata: stored.metadata,
      contentEncoding: stored.contentEncoding,
      contentLanguage: stored.contentLanguage,
      contentDisposition: stored.contentDisposition,
      cacheControl: stored.cacheControl,
      requestId: generateRequestId(),
    };
  }

  /**
   * Copy an object
   */
  async copyObject(request: CopyObjectRequest): Promise<CopyObjectOutput> {
    await this.simulateLatency();
    this.simulateError();

    const sourceKey = this.makeKey(request.sourceBucket, request.sourceKey);
    const source = this.store.get(sourceKey);

    if (!source) {
      throw ObjectError.notFound(request.sourceKey);
    }

    const destKey = this.makeKey(request.bucket, request.key);
    const now = new Date();

    // Copy or replace metadata
    const metadata =
      request.metadataDirective === 'REPLACE' && request.metadata
        ? request.metadata
        : source.metadata;

    const copied: StoredObject = {
      data: new Uint8Array(source.data),
      contentType: request.contentType || source.contentType,
      metadata,
      eTag: source.eTag,
      lastModified: now,
      contentEncoding: request.contentEncoding || source.contentEncoding,
      contentLanguage: request.contentLanguage || source.contentLanguage,
      contentDisposition: request.contentDisposition || source.contentDisposition,
      cacheControl: request.cacheControl || source.cacheControl,
    };

    this.store.set(destKey, copied);

    return {
      eTag: copied.eTag,
      lastModified: now,
      requestId: generateRequestId(),
    };
  }

  /**
   * List objects in a bucket
   */
  async listObjects(request: ListObjectsRequest): Promise<ListObjectsOutput> {
    await this.simulateLatency();
    this.simulateError();

    const prefix = request.prefix || '';
    const delimiter = request.delimiter;
    const maxKeys = request.maxKeys || 1000;
    const startAfter = request.startAfter || '';

    // Filter objects by bucket and prefix
    const bucketPrefix = `${request.bucket}/`;
    const allKeys = Array.from(this.store.keys())
      .filter((key) => key.startsWith(bucketPrefix))
      .map((key) => key.substring(bucketPrefix.length))
      .filter((key) => matchesPrefix(key, prefix))
      .filter((key) => !startAfter || key > startAfter)
      .sort();

    // Extract common prefixes if delimiter specified
    let commonPrefixes: CommonPrefix[] = [];
    let objectKeys = allKeys;

    if (delimiter) {
      const prefixes = extractCommonPrefixes(allKeys, prefix, delimiter);
      commonPrefixes = prefixes.map((p) => ({ prefix: p }));

      // Filter out objects under common prefixes
      objectKeys = allKeys.filter((key) => {
        if (!key.startsWith(prefix)) return false;
        const remaining = key.substring(prefix.length);
        return !remaining.includes(delimiter);
      });
    }

    // Paginate
    const keys = objectKeys.slice(0, maxKeys);
    const isTruncated = keys.length < objectKeys.length;

    // Build object list
    const contents: R2Object[] = keys.map((objKey) => {
      const fullKey = this.makeKey(request.bucket, objKey);
      const stored = this.store.get(fullKey)!;

      return {
        key: objKey,
        lastModified: stored.lastModified,
        eTag: stored.eTag,
        size: stored.data.length,
        storageClass: 'STANDARD' as const,
      };
    });

    return {
      isTruncated,
      contents,
      commonPrefixes,
      name: request.bucket,
      prefix,
      delimiter,
      maxKeys,
      keyCount: contents.length,
      requestId: generateRequestId(),
    };
  }

  private makeKey(bucket: string, key: string): string {
    return `${bucket}/${key}`;
  }

  private async bodyToUint8Array(
    body: string | Buffer | ReadableStream<Uint8Array> | Uint8Array
  ): Promise<Uint8Array> {
    if (typeof body === 'string') {
      return new TextEncoder().encode(body);
    }

    if (body instanceof Buffer) {
      return new Uint8Array(body);
    }

    if (body instanceof Uint8Array) {
      return body;
    }

    // ReadableStream
    const chunks: Uint8Array[] = [];
    const reader = body.getReader();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }

    return concatenateArrays(chunks);
  }

  private async simulateLatency(): Promise<void> {
    if (this.options.latency && this.options.latency > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.options.latency));
    }
  }

  private simulateError(): void {
    if (this.options.errorRate && this.options.errorRate > 0) {
      if (Math.random() < this.options.errorRate) {
        throw new ObjectError({
          message: 'Simulated random error',
          code: 'SIMULATED_ERROR',
          status: 500,
          isRetryable: true,
          details: { errorRate: this.options.errorRate },
        });
      }
    }
  }
}

/**
 * Mock implementation of R2MultipartService
 *
 * Provides in-memory simulation of multipart upload operations for testing.
 */
export class MockMultipartService {
  constructor(
    private readonly store: Map<string, StoredObject>,
    private readonly uploads: Map<string, InternalMultipartUpload>,
    private readonly options: MockClientOptions = {}
  ) {}

  /**
   * Initiate multipart upload
   */
  async createMultipart(request: CreateMultipartRequest): Promise<CreateMultipartOutput> {
    await this.simulateLatency();
    this.simulateError();

    const uploadId = generateUploadId();

    const upload: InternalMultipartUpload = {
      uploadId,
      bucket: request.bucket,
      key: request.key,
      parts: new Map(),
      metadata: request.metadata || {},
      contentType: request.contentType,
      initiated: new Date(),
    };

    this.uploads.set(uploadId, upload);

    return {
      uploadId,
      bucket: request.bucket,
      key: request.key,
      requestId: generateRequestId(),
    };
  }

  /**
   * Upload a part
   */
  async uploadPart(request: UploadPartRequest): Promise<UploadPartOutput> {
    await this.simulateLatency();
    this.simulateError();

    const upload = this.uploads.get(request.uploadId);

    if (!upload) {
      throw MultipartError.uploadNotFound(request.uploadId);
    }

    const data = await this.bodyToUint8Array(request.body);
    const eTag = generateETag(data);

    upload.parts.set(request.partNumber, {
      data,
      eTag,
      partNumber: request.partNumber,
    });

    return {
      eTag,
      requestId: generateRequestId(),
    };
  }

  /**
   * Complete multipart upload
   */
  async completeMultipart(request: CompleteMultipartRequest): Promise<CompleteMultipartOutput> {
    await this.simulateLatency();
    this.simulateError();

    const upload = this.uploads.get(request.uploadId);

    if (!upload) {
      throw MultipartError.uploadNotFound(request.uploadId);
    }

    // Verify all parts are present
    for (const part of request.parts) {
      if (!upload.parts.has(part.partNumber)) {
        throw MultipartError.invalidPart(part.partNumber);
      }
    }

    // Combine parts in order
    const sortedParts = request.parts
      .slice()
      .sort((a, b) => a.partNumber - b.partNumber);

    const partData = sortedParts.map(
      (p) => upload.parts.get(p.partNumber)!.data
    );

    const combinedData = concatenateArrays(partData);
    const eTag = generateETag(combinedData);

    // Store as complete object
    const key = this.makeKey(upload.bucket, upload.key);
    const stored: StoredObject = {
      data: combinedData,
      contentType: upload.contentType,
      metadata: upload.metadata,
      eTag,
      lastModified: new Date(),
    };

    this.store.set(key, stored);

    // Clean up upload
    this.uploads.delete(request.uploadId);

    return {
      location: `https://mock.r2.cloudflarestorage.com/${upload.bucket}/${upload.key}`,
      bucket: upload.bucket,
      key: upload.key,
      eTag,
      requestId: generateRequestId(),
    };
  }

  /**
   * Abort multipart upload
   */
  async abortMultipart(request: AbortMultipartRequest): Promise<AbortMultipartOutput> {
    await this.simulateLatency();
    this.simulateError();

    this.uploads.delete(request.uploadId);

    return {
      requestId: generateRequestId(),
    };
  }

  /**
   * List parts of a multipart upload
   */
  async listParts(request: ListPartsRequest): Promise<ListPartsOutput> {
    await this.simulateLatency();
    this.simulateError();

    const upload = this.uploads.get(request.uploadId);

    if (!upload) {
      throw MultipartError.uploadNotFound(request.uploadId);
    }

    const maxParts = request.maxParts || 1000;
    const partNumberMarker = request.partNumberMarker || 0;

    const allParts = Array.from(upload.parts.values())
      .filter((p) => p.partNumber > partNumberMarker)
      .sort((a, b) => a.partNumber - b.partNumber);

    const parts = allParts.slice(0, maxParts);
    const isTruncated = parts.length < allParts.length;

    const partsList: Part[] = parts.map((p) => ({
      partNumber: p.partNumber,
      eTag: p.eTag,
      size: p.data.length,
      lastModified: new Date(),
    }));

    return {
      bucket: upload.bucket,
      key: upload.key,
      uploadId: request.uploadId,
      parts: partsList,
      isTruncated,
      maxParts,
      partNumberMarker,
      nextPartNumberMarker: isTruncated ? parts[parts.length - 1].partNumber : undefined,
      requestId: generateRequestId(),
    };
  }

  /**
   * List multipart uploads in progress
   */
  async listMultipartUploads(
    request: ListMultipartUploadsRequest
  ): Promise<ListMultipartUploadsOutput> {
    await this.simulateLatency();
    this.simulateError();

    const prefix = request.prefix || '';
    const maxUploads = request.maxUploads || 1000;

    const allUploads = Array.from(this.uploads.values())
      .filter((u) => u.bucket === request.bucket)
      .filter((u) => matchesPrefix(u.key, prefix))
      .sort((a, b) => a.key.localeCompare(b.key));

    const uploads = allUploads.slice(0, maxUploads);
    const isTruncated = uploads.length < allUploads.length;

    const uploadsList: MultipartUpload[] = uploads.map((u) => ({
      uploadId: u.uploadId,
      key: u.key,
      initiated: u.initiated,
      storageClass: 'STANDARD' as const,
    }));

    return {
      bucket: request.bucket,
      uploads: uploadsList,
      commonPrefixes: [],
      isTruncated,
      maxUploads,
      requestId: generateRequestId(),
    };
  }

  private makeKey(bucket: string, key: string): string {
    return `${bucket}/${key}`;
  }

  private async bodyToUint8Array(
    body: string | Buffer | ReadableStream<Uint8Array> | Uint8Array
  ): Promise<Uint8Array> {
    if (typeof body === 'string') {
      return new TextEncoder().encode(body);
    }

    if (body instanceof Buffer) {
      return new Uint8Array(body);
    }

    if (body instanceof Uint8Array) {
      return body;
    }

    // ReadableStream
    const chunks: Uint8Array[] = [];
    const reader = body.getReader();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }

    return concatenateArrays(chunks);
  }

  private async simulateLatency(): Promise<void> {
    if (this.options.latency && this.options.latency > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.options.latency));
    }
  }

  private simulateError(): void {
    if (this.options.errorRate && this.options.errorRate > 0) {
      if (Math.random() < this.options.errorRate) {
        throw new MultipartError({
          message: 'Simulated random error',
          code: 'SIMULATED_ERROR',
          status: 500,
          isRetryable: true,
          details: { errorRate: this.options.errorRate },
        });
      }
    }
  }
}

/**
 * Mock implementation of R2PresignService
 *
 * Generates fake presigned URLs for testing.
 */
export class MockPresignService {
  constructor(private readonly baseUrl: string) {}

  /**
   * Generate presigned GET URL
   */
  getObject(request: PresignGetRequest): PresignedUrl {
    const expiresIn = request.expiresIn || 3600;
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    const url = new URL(`${this.baseUrl}/${request.bucket}/${request.key}`);
    url.searchParams.set('X-Amz-Algorithm', 'AWS4-HMAC-SHA256');
    url.searchParams.set('X-Amz-Expires', expiresIn.toString());
    url.searchParams.set('X-Amz-Signature', 'mock-signature');

    return {
      url: url.toString(),
      expiresAt,
      method: 'GET',
    };
  }

  /**
   * Generate presigned PUT URL
   */
  putObject(request: PresignPutRequest): PresignedUrl {
    const expiresIn = request.expiresIn || 3600;
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    const url = new URL(`${this.baseUrl}/${request.bucket}/${request.key}`);
    url.searchParams.set('X-Amz-Algorithm', 'AWS4-HMAC-SHA256');
    url.searchParams.set('X-Amz-Expires', expiresIn.toString());
    url.searchParams.set('X-Amz-Signature', 'mock-signature');

    const requiredHeaders: Record<string, string> = {};
    if (request.contentType) {
      requiredHeaders['Content-Type'] = request.contentType;
    }

    return {
      url: url.toString(),
      expiresAt,
      method: 'PUT',
      requiredHeaders: Object.keys(requiredHeaders).length > 0 ? requiredHeaders : undefined,
    };
  }
}

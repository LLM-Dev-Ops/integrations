/**
 * Simulation/Mock Layer
 *
 * Mock GCS client for testing.
 * Following the SPARC specification.
 */

import {
  ObjectMetadata,
  GcsObject,
  BucketMetadata,
  StorageClass,
} from "../types/common.js";
import {
  InsertObjectRequest,
  GetObjectRequest,
  DeleteObjectRequest,
  ListObjectsRequest,
} from "../types/requests.js";
import { ListObjectsResponse, ListBucketsResponse } from "../types/responses.js";
import { ObjectError, BucketError } from "../error/index.js";

/**
 * Mock object storage.
 */
interface MockObject {
  metadata: ObjectMetadata;
  data: Buffer;
}

/**
 * Mock GCS client for testing.
 */
export class MockGcsClient {
  private _objectsMap: Map<string, MockObject> = new Map();
  private _bucketsMap: Map<string, BucketMetadata> = new Map();
  private generation = 1;
  private expectations: Expectation[] = [];

  /**
   * Add a mock object to storage.
   */
  withObject(bucket: string, name: string, data: Buffer | string): this {
    const key = this.objectKey(bucket, name);
    const dataBuffer = typeof data === "string" ? Buffer.from(data) : data;
    const gen = String(this.generation++);

    this._objectsMap.set(key, {
      metadata: {
        name,
        bucket,
        generation: gen,
        metageneration: "1",
        contentType: "application/octet-stream",
        size: dataBuffer.length,
        etag: `"${gen}"`,
        timeCreated: new Date(),
        updated: new Date(),
        storageClass: StorageClass.Standard,
        metadata: {},
        selfLink: `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(name)}`,
        mediaLink: `https://storage.googleapis.com/download/storage/v1/b/${bucket}/o/${encodeURIComponent(name)}?alt=media`,
      },
      data: dataBuffer,
    });

    // Ensure bucket exists
    if (!this._bucketsMap.has(bucket)) {
      this.withBucket(bucket);
    }

    return this;
  }

  /**
   * Add a mock bucket.
   */
  withBucket(name: string): this {
    this._bucketsMap.set(name, {
      name,
      id: name,
      projectNumber: "12345",
      timeCreated: new Date(),
      updated: new Date(),
      location: "US",
      storageClass: StorageClass.Standard,
      selfLink: `https://storage.googleapis.com/storage/v1/b/${name}`,
      metageneration: "1",
      etag: `"1"`,
    });
    return this;
  }

  /**
   * Expect an upload to a specific bucket/object.
   */
  expectUpload(bucket: string, object: string): this {
    this.expectations.push({
      type: "upload",
      bucket,
      object,
      called: false,
    });
    return this;
  }

  /**
   * Expect a download from a specific bucket/object.
   */
  expectDownload(bucket: string, object: string): this {
    this.expectations.push({
      type: "download",
      bucket,
      object,
      called: false,
    });
    return this;
  }

  /**
   * Expect a delete on a specific bucket/object.
   */
  expectDelete(bucket: string, object: string): this {
    this.expectations.push({
      type: "delete",
      bucket,
      object,
      called: false,
    });
    return this;
  }

  /**
   * Verify all expectations were met.
   */
  verify(): void {
    const unmet = this.expectations.filter((e) => !e.called);
    if (unmet.length > 0) {
      const descriptions = unmet.map(
        (e) => `${e.type} ${e.bucket}/${e.object}`
      );
      throw new Error(`Unmet expectations: ${descriptions.join(", ")}`);
    }
  }

  /**
   * Reset all objects and expectations.
   */
  reset(): void {
    this._objectsMap.clear();
    this._bucketsMap.clear();
    this.expectations = [];
    this.generation = 1;
  }

  /**
   * Mock objects service.
   */
  objects(): MockObjectsService {
    return new MockObjectsService(this);
  }

  /**
   * Mock buckets service.
   */
  buckets(): MockBucketsService {
    return new MockBucketsService(this);
  }

  // Internal methods

  private objectKey(bucket: string, name: string): string {
    return `${bucket}/${name}`;
  }

  /** @internal */
  _getObject(bucket: string, name: string): MockObject | undefined {
    return this._objectsMap.get(this.objectKey(bucket, name));
  }

  /** @internal */
  _setObject(bucket: string, name: string, obj: MockObject): void {
    this._objectsMap.set(this.objectKey(bucket, name), obj);
  }

  /** @internal */
  _deleteObject(bucket: string, name: string): boolean {
    return this._objectsMap.delete(this.objectKey(bucket, name));
  }

  /** @internal */
  _listObjects(bucket: string, prefix?: string): MockObject[] {
    const results: MockObject[] = [];
    for (const [key, obj] of this._objectsMap.entries()) {
      if (key.startsWith(`${bucket}/`)) {
        const name = key.slice(bucket.length + 1);
        if (!prefix || name.startsWith(prefix)) {
          results.push(obj);
        }
      }
    }
    return results;
  }

  /** @internal */
  _getBucket(name: string): BucketMetadata | undefined {
    return this._bucketsMap.get(name);
  }

  /** @internal */
  _listBuckets(): BucketMetadata[] {
    return Array.from(this._bucketsMap.values());
  }

  /** @internal */
  _nextGeneration(): string {
    return String(this.generation++);
  }

  /** @internal */
  _recordExpectation(type: string, bucket: string, object: string): void {
    const expectation = this.expectations.find(
      (e) => e.type === type && e.bucket === bucket && e.object === object
    );
    if (expectation) {
      expectation.called = true;
    }
  }
}

/**
 * Expectation for verification.
 */
interface Expectation {
  type: string;
  bucket: string;
  object: string;
  called: boolean;
}

/**
 * Mock objects service.
 */
class MockObjectsService {
  constructor(private client: MockGcsClient) {}

  async insert(request: InsertObjectRequest): Promise<ObjectMetadata> {
    this.client._recordExpectation("upload", request.bucket, request.name);

    const gen = this.client._nextGeneration();
    const metadata: ObjectMetadata = {
      name: request.name,
      bucket: request.bucket,
      generation: gen,
      metageneration: "1",
      contentType: request.contentType ?? "application/octet-stream",
      size: request.data.length,
      etag: `"${gen}"`,
      timeCreated: new Date(),
      updated: new Date(),
      storageClass: StorageClass.Standard,
      contentEncoding: request.contentEncoding,
      contentDisposition: request.contentDisposition,
      cacheControl: request.cacheControl,
      metadata: request.metadata ?? {},
      selfLink: `https://storage.googleapis.com/storage/v1/b/${request.bucket}/o/${encodeURIComponent(request.name)}`,
      mediaLink: `https://storage.googleapis.com/download/storage/v1/b/${request.bucket}/o/${encodeURIComponent(request.name)}?alt=media`,
    };

    this.client._setObject(request.bucket, request.name, {
      metadata,
      data: request.data,
    });

    return metadata;
  }

  async get(request: GetObjectRequest): Promise<GcsObject> {
    this.client._recordExpectation("download", request.bucket, request.object);

    const obj = this.client._getObject(request.bucket, request.object);
    if (!obj) {
      throw new ObjectError(
        `Object not found: ${request.bucket}/${request.object}`,
        "NotFound",
        { bucket: request.bucket, object: request.object }
      );
    }

    return {
      metadata: obj.metadata,
      data: obj.data,
    };
  }

  async getMetadata(request: GetObjectRequest): Promise<ObjectMetadata> {
    const obj = this.client._getObject(request.bucket, request.object);
    if (!obj) {
      throw new ObjectError(
        `Object not found: ${request.bucket}/${request.object}`,
        "NotFound",
        { bucket: request.bucket, object: request.object }
      );
    }
    return obj.metadata;
  }

  async delete(request: DeleteObjectRequest): Promise<void> {
    this.client._recordExpectation("delete", request.bucket, request.object);

    const deleted = this.client._deleteObject(request.bucket, request.object);
    if (!deleted) {
      throw new ObjectError(
        `Object not found: ${request.bucket}/${request.object}`,
        "NotFound",
        { bucket: request.bucket, object: request.object }
      );
    }
  }

  async list(request: ListObjectsRequest): Promise<ListObjectsResponse> {
    const objects = this.client._listObjects(request.bucket, request.prefix);

    return {
      items: objects.map((o) => o.metadata),
      prefixes: [],
      nextPageToken: undefined,
    };
  }

  async *listAll(request: ListObjectsRequest): AsyncIterable<ObjectMetadata> {
    const objects = this.client._listObjects(request.bucket, request.prefix);
    for (const obj of objects) {
      yield obj.metadata;
    }
  }
}

/**
 * Mock buckets service.
 */
class MockBucketsService {
  constructor(private client: MockGcsClient) {}

  async list(): Promise<ListBucketsResponse> {
    return {
      items: this.client._listBuckets(),
      nextPageToken: undefined,
    };
  }

  async get(request: { bucket: string }): Promise<BucketMetadata> {
    const bucket = this.client._getBucket(request.bucket);
    if (!bucket) {
      throw new BucketError(
        `Bucket not found: ${request.bucket}`,
        "NotFound",
        { bucket: request.bucket }
      );
    }
    return bucket;
  }

  async exists(bucket: string): Promise<boolean> {
    return this.client._getBucket(bucket) !== undefined;
  }
}

/**
 * Create a mock GCS client.
 */
export function createMockClient(): MockGcsClient {
  return new MockGcsClient();
}

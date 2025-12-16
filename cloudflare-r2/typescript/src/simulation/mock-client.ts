/**
 * Mock R2 client for testing
 * @module @studiorack/cloudflare-r2/simulation
 */

import type {
  StoredObject,
  MultipartUpload as InternalMultipartUpload,
  MockClientOptions,
} from './types.js';
import { MockObjectsService, MockMultipartService, MockPresignService } from './mock-services.js';

/**
 * Mock R2 client for testing without actual R2 access
 *
 * This client provides a complete in-memory implementation of all R2 operations,
 * allowing tests to run quickly and reliably without network calls or credentials.
 *
 * Features:
 * - Complete object operations (put, get, delete, list, copy, head)
 * - Multipart upload support
 * - Presigned URL generation
 * - Configurable latency simulation
 * - Error rate simulation
 * - Direct storage access for test setup/assertions
 *
 * Usage:
 * ```typescript
 * const client = new MockR2Client({ latency: 10 });
 *
 * // Pre-populate test data
 * client.putObject('test-bucket', 'file.txt', new TextEncoder().encode('content'));
 *
 * // Use like normal client
 * const result = await client.objects.getObject({
 *   bucket: 'test-bucket',
 *   key: 'file.txt'
 * });
 *
 * // Assert on storage
 * const stored = client.getObject('test-bucket', 'file.txt');
 * expect(stored?.data).toBeDefined();
 * ```
 */
export class MockR2Client {
  private store = new Map<string, StoredObject>();
  private multipartUploads = new Map<string, InternalMultipartUpload>();

  readonly objects: MockObjectsService;
  readonly multipart: MockMultipartService;
  readonly presign: MockPresignService;

  constructor(options: MockClientOptions = {}) {
    const baseUrl = options.baseUrl || 'https://mock.r2.cloudflarestorage.com';

    this.objects = new MockObjectsService(this.store, options);
    this.multipart = new MockMultipartService(this.store, this.multipartUploads, options);
    this.presign = new MockPresignService(baseUrl);
  }

  /**
   * Close client (no-op for mock)
   */
  async close(): Promise<void> {
    // No resources to clean up
  }

  // ========================================
  // Testing Utilities
  // ========================================

  /**
   * Clear all stored objects and uploads
   */
  clear(): void {
    this.store.clear();
    this.multipartUploads.clear();
  }

  /**
   * Get a stored object directly (for test assertions)
   *
   * @param bucket - Bucket name
   * @param key - Object key
   * @returns Stored object or undefined if not found
   */
  getObject(bucket: string, key: string): StoredObject | undefined {
    const fullKey = this.makeKey(bucket, key);
    return this.store.get(fullKey);
  }

  /**
   * Put an object directly (for test setup)
   *
   * @param bucket - Bucket name
   * @param key - Object key
   * @param data - Object data
   * @param metadata - Optional metadata
   */
  putObject(
    bucket: string,
    key: string,
    data: Uint8Array,
    metadata?: Record<string, string>
  ): void {
    const fullKey = this.makeKey(bucket, key);
    const eTag = this.generateSimpleETag(data);

    const stored: StoredObject = {
      data,
      metadata: metadata || {},
      eTag,
      lastModified: new Date(),
    };

    this.store.set(fullKey, stored);
  }

  /**
   * Delete an object directly (for test cleanup)
   *
   * @param bucket - Bucket name
   * @param key - Object key
   * @returns True if object was deleted, false if not found
   */
  deleteObject(bucket: string, key: string): boolean {
    const fullKey = this.makeKey(bucket, key);
    return this.store.delete(fullKey);
  }

  /**
   * List all object keys in a bucket (for test assertions)
   *
   * @param bucket - Bucket name
   * @param prefix - Optional prefix filter
   * @returns Array of object keys
   */
  listObjects(bucket: string, prefix?: string): string[] {
    const bucketPrefix = `${bucket}/`;
    const keys: string[] = [];

    for (const fullKey of this.store.keys()) {
      if (!fullKey.startsWith(bucketPrefix)) {
        continue;
      }

      const objectKey = fullKey.substring(bucketPrefix.length);

      if (prefix && !objectKey.startsWith(prefix)) {
        continue;
      }

      keys.push(objectKey);
    }

    return keys.sort();
  }

  /**
   * Get all stored objects (for debugging)
   *
   * @returns Map of all stored objects
   */
  getAllObjects(): Map<string, StoredObject> {
    return new Map(this.store);
  }

  /**
   * Get all multipart uploads (for debugging)
   *
   * @returns Map of all in-progress uploads
   */
  getAllUploads(): Map<string, InternalMultipartUpload> {
    return new Map(this.multipartUploads);
  }

  /**
   * Get number of stored objects
   */
  getObjectCount(): number {
    return this.store.size;
  }

  /**
   * Get number of in-progress multipart uploads
   */
  getUploadCount(): number {
    return this.multipartUploads.size;
  }

  /**
   * Check if an object exists
   *
   * @param bucket - Bucket name
   * @param key - Object key
   * @returns True if object exists
   */
  hasObject(bucket: string, key: string): boolean {
    const fullKey = this.makeKey(bucket, key);
    return this.store.has(fullKey);
  }

  /**
   * Get total size of all stored objects in bytes
   */
  getTotalSize(): number {
    let total = 0;
    for (const obj of this.store.values()) {
      total += obj.data.length;
    }
    return total;
  }

  /**
   * Get size of objects in a specific bucket
   *
   * @param bucket - Bucket name
   * @returns Total size in bytes
   */
  getBucketSize(bucket: string): number {
    const bucketPrefix = `${bucket}/`;
    let total = 0;

    for (const [key, obj] of this.store.entries()) {
      if (key.startsWith(bucketPrefix)) {
        total += obj.data.length;
      }
    }

    return total;
  }

  /**
   * Export all stored objects (for snapshot testing)
   *
   * @returns Object with bucket -> key -> data mapping
   */
  exportStorage(): Record<string, Record<string, string>> {
    const result: Record<string, Record<string, string>> = {};

    for (const [fullKey, obj] of this.store.entries()) {
      const parts = fullKey.split('/', 2);
      if (parts.length !== 2) continue;

      const [bucket, key] = parts;

      if (!result[bucket]) {
        result[bucket] = {};
      }

      // Convert data to base64 for serialization
      result[bucket][key] = this.arrayBufferToBase64(obj.data);
    }

    return result;
  }

  /**
   * Import stored objects (for snapshot testing)
   *
   * @param storage - Object with bucket -> key -> base64 data mapping
   */
  importStorage(storage: Record<string, Record<string, string>>): void {
    this.clear();

    for (const [bucket, objects] of Object.entries(storage)) {
      for (const [key, base64Data] of Object.entries(objects)) {
        const data = this.base64ToArrayBuffer(base64Data);
        this.putObject(bucket, key, data);
      }
    }
  }

  // ========================================
  // Private Helpers
  // ========================================

  private makeKey(bucket: string, key: string): string {
    return `${bucket}/${key}`;
  }

  private generateSimpleETag(data: Uint8Array): string {
    // Simple hash for testing (not cryptographically secure)
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      hash = ((hash << 5) - hash + data[i]) | 0;
    }
    const hex = Math.abs(hash).toString(16).padStart(32, '0');
    return `"${hex}"`;
  }

  private arrayBufferToBase64(buffer: Uint8Array): string {
    let binary = '';
    const len = buffer.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(buffer[i]);
    }
    return btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): Uint8Array {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
}

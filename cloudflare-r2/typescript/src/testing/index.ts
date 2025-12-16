/**
 * Testing utilities module for Cloudflare R2 Storage Integration
 * @module @studiorack/cloudflare-r2/testing
 *
 * Provides utilities for testing R2 integration code including:
 * - Mock clients and services
 * - Test fixtures and data generators
 * - Recording and replay support
 * - Configuration builders for tests
 *
 * Usage:
 * ```typescript
 * import {
 *   MockR2Client,
 *   createTestConfig,
 *   createTestObject,
 *   RecordingTransport,
 * } from '@studiorack/cloudflare-r2/testing';
 *
 * describe('R2 Operations', () => {
 *   let client: MockR2Client;
 *
 *   beforeEach(() => {
 *     client = new MockR2Client();
 *   });
 *
 *   it('should store and retrieve objects', async () => {
 *     const testData = createTestObject('test.txt');
 *     client.putObject('bucket', 'test.txt', testData.data);
 *
 *     const result = await client.objects.getObject({
 *       bucket: 'bucket',
 *       key: 'test.txt'
 *     });
 *
 *     expect(result.body).toEqual(testData.data);
 *   });
 * });
 * ```
 */

import type { NormalizedR2Config } from '../config/index.js';
import type { StoredObject } from '../simulation/types.js';

// Re-export simulation utilities for testing
export {
  MockR2Client,
  MockObjectsService,
  MockMultipartService,
  MockPresignService,
  RecordingTransport,
  ReplayTransport,
  generateETag,
  generateUploadId,
  generateRequestId,
  serializeStore,
  deserializeStore,
} from '../simulation/index.js';

export type {
  MockClientOptions,
  ReplayOptions,
  SimulationStore,
  Recording,
  RecordedRequest,
  RecordedResponse,
  StoredObject,
  MultipartUpload,
  UploadedPart,
} from '../simulation/index.js';

/**
 * Create a test configuration with sensible defaults
 *
 * @param overrides - Optional configuration overrides
 * @returns Normalized R2 configuration for testing
 */
export function createTestConfig(
  overrides?: Partial<NormalizedR2Config>
): NormalizedR2Config {
  const defaults: NormalizedR2Config = {
    accountId: 'test-account-id',
    accessKeyId: 'test-access-key-id',
    secretAccessKey: 'test-secret-access-key',
    endpoint: 'https://test-account-id.r2.cloudflarestorage.com',
    endpointUrl: 'https://test-account-id.r2.cloudflarestorage.com',
    timeout: 30000,
    multipartThreshold: 10 * 1024 * 1024, // 10 MB
    multipartPartSize: 5 * 1024 * 1024, // 5 MB
    multipartConcurrency: 4,
    retry: {
      maxRetries: 3,
      baseDelayMs: 100,
      maxDelayMs: 30000,
      jitterFactor: 0.1,
    },
    circuitBreaker: {
      enabled: false,
      failureThreshold: 5,
      successThreshold: 3,
      resetTimeout: 30000,
    },
  };

  return {
    ...defaults,
    ...overrides,
  };
}

/**
 * Create a test object with sample data
 *
 * @param key - Object key
 * @param options - Optional object configuration
 * @returns Stored object with test data
 */
export function createTestObject(
  _key: string,
  options?: {
    data?: Uint8Array;
    contentType?: string;
    metadata?: Record<string, string>;
    size?: number;
  }
): StoredObject {
  const data = options?.data || createTestData(options?.size || 1024);
  const eTag = generateSimpleETag(data);

  return {
    data,
    contentType: options?.contentType || 'application/octet-stream',
    metadata: options?.metadata || {},
    eTag,
    lastModified: new Date(),
  };
}

/**
 * Create test data of specified size
 *
 * @param size - Size in bytes
 * @param pattern - Optional pattern ('zeros', 'sequential', 'random')
 * @returns Uint8Array filled with test data
 */
export function createTestData(
  size: number,
  pattern: 'zeros' | 'sequential' | 'random' = 'random'
): Uint8Array {
  const data = new Uint8Array(size);

  switch (pattern) {
    case 'zeros':
      // Already initialized to zeros
      break;

    case 'sequential':
      for (let i = 0; i < size; i++) {
        data[i] = i % 256;
      }
      break;

    case 'random':
      for (let i = 0; i < size; i++) {
        data[i] = Math.floor(Math.random() * 256);
      }
      break;
  }

  return data;
}

/**
 * Create text test data
 *
 * @param text - Text content
 * @returns Uint8Array containing UTF-8 encoded text
 */
export function createTextData(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/**
 * Convert Uint8Array to text
 *
 * @param data - Binary data
 * @returns Decoded text string
 */
export function dataToText(data: Uint8Array): string {
  return new TextDecoder().decode(data);
}

/**
 * Create a test bucket name
 *
 * @param prefix - Optional prefix
 * @returns Unique bucket name for testing
 */
export function createTestBucketName(prefix: string = 'test'): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}-${timestamp}-${random}`;
}

/**
 * Create a test object key with optional prefix and suffix
 *
 * @param options - Key generation options
 * @returns Object key string
 */
export function createTestKey(options?: {
  prefix?: string;
  suffix?: string;
  extension?: string;
}): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);

  let key = `${timestamp}-${random}`;

  if (options?.prefix) {
    key = `${options.prefix}/${key}`;
  }

  if (options?.suffix) {
    key = `${key}-${options.suffix}`;
  }

  if (options?.extension) {
    key = `${key}.${options.extension}`;
  }

  return key;
}

/**
 * Create multiple test objects for bulk operations
 *
 * @param count - Number of objects to create
 * @param options - Object creation options
 * @returns Array of stored objects with keys
 */
export function createTestObjects(
  count: number,
  options?: {
    prefix?: string;
    size?: number;
    metadata?: Record<string, string>;
  }
): Array<{ key: string; object: StoredObject }> {
  const objects: Array<{ key: string; object: StoredObject }> = [];

  for (let i = 0; i < count; i++) {
    const key = createTestKey({
      prefix: options?.prefix,
      suffix: i.toString().padStart(4, '0'),
    });

    const object = createTestObject(key, {
      size: options?.size,
      metadata: options?.metadata,
    });

    objects.push({ key, object });
  }

  return objects;
}

/**
 * Wait for specified duration
 *
 * @param ms - Milliseconds to wait
 * @returns Promise that resolves after delay
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Assert that data matches expected content
 *
 * @param actual - Actual data
 * @param expected - Expected data
 * @throws Error if data doesn't match
 */
export function assertDataEquals(actual: Uint8Array, expected: Uint8Array): void {
  if (actual.length !== expected.length) {
    throw new Error(
      `Data length mismatch: expected ${expected.length}, got ${actual.length}`
    );
  }

  for (let i = 0; i < actual.length; i++) {
    if (actual[i] !== expected[i]) {
      throw new Error(
        `Data mismatch at byte ${i}: expected ${expected[i]}, got ${actual[i]}`
      );
    }
  }
}

/**
 * Calculate SHA-256 hash of data (for verification)
 *
 * @param data - Data to hash
 * @returns Hex-encoded hash string
 */
export function hashData(data: Uint8Array): string {
  // Simple hash for testing (not cryptographically secure)
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) - hash + data[i]) | 0;
  }
  return Math.abs(hash).toString(16).padStart(16, '0');
}

/**
 * Generate a simple ETag for test data
 */
function generateSimpleETag(data: Uint8Array): string {
  const hash = hashData(data);
  return `"${hash}"`;
}

/**
 * Create a mock metadata object
 *
 * @param extras - Additional metadata fields
 * @returns Metadata object
 */
export function createTestMetadata(
  extras?: Record<string, string>
): Record<string, string> {
  return {
    'test-id': Math.random().toString(36).substring(2),
    'created-at': new Date().toISOString(),
    ...extras,
  };
}

/**
 * Convert size string to bytes
 *
 * @param size - Size string (e.g., '10KB', '5MB', '1GB')
 * @returns Size in bytes
 */
export function parseSize(size: string): number {
  const units: Record<string, number> = {
    B: 1,
    KB: 1024,
    MB: 1024 * 1024,
    GB: 1024 * 1024 * 1024,
  };

  const match = size.match(/^(\d+(?:\.\d+)?)\s*([A-Z]+)$/i);
  if (!match) {
    throw new Error(`Invalid size format: ${size}`);
  }

  const [, value, unit] = match;
  const multiplier = units[unit.toUpperCase()];

  if (!multiplier) {
    throw new Error(`Unknown size unit: ${unit}`);
  }

  return Math.floor(parseFloat(value) * multiplier);
}

/**
 * Format bytes as human-readable size
 *
 * @param bytes - Size in bytes
 * @returns Formatted string (e.g., '10 KB', '5 MB')
 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  }

  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

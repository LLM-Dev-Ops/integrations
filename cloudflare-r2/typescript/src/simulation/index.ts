/**
 * Simulation and testing support module for Cloudflare R2 Storage Integration
 * @module @studiorack/cloudflare-r2/simulation
 *
 * This module provides comprehensive testing utilities including:
 * - Request/response recording and playback
 * - In-memory mock client
 * - Test data generation utilities
 *
 * Usage:
 *
 * Recording:
 * ```typescript
 * import { RecordingTransport } from '@studiorack/cloudflare-r2/simulation';
 *
 * const transport = new RecordingTransport(actualTransport);
 * // ... perform operations
 * const store = transport.exportRecordings();
 * fs.writeFileSync('recordings.json', JSON.stringify(store));
 * ```
 *
 * Playback:
 * ```typescript
 * import { ReplayTransport } from '@studiorack/cloudflare-r2/simulation';
 *
 * const store = JSON.parse(fs.readFileSync('recordings.json'));
 * const transport = new ReplayTransport(store, { strict: true });
 * // ... operations will use recorded responses
 * ```
 *
 * Mock Client:
 * ```typescript
 * import { MockR2Client } from '@studiorack/cloudflare-r2/simulation';
 *
 * const client = new MockR2Client({ latency: 10 });
 * client.putObject('bucket', 'key', data);
 * const result = await client.objects.getObject({ bucket: 'bucket', key: 'key' });
 * ```
 */

// Types
export type {
  RecordedRequest,
  RecordedResponse,
  Recording,
  SimulationStore,
  ReplayOptions,
  MockClientOptions,
  StoredObject,
  MultipartUpload,
  UploadedPart,
} from './types.js';

// Recording
export { RecordingTransport } from './recorder.js';

// Playback
export { ReplayTransport } from './replayer.js';

// Mock client and services
export { MockR2Client } from './mock-client.js';
export {
  MockObjectsService,
  MockMultipartService,
  MockPresignService,
} from './mock-services.js';

// Utilities
export {
  generateETag,
  matchRequest,
  serializeStore,
  deserializeStore,
  generateUploadId,
  generateRequestId,
  calculateTotalSize,
  concatenateArrays,
  matchesPrefix,
  extractCommonPrefixes,
} from './utils.js';

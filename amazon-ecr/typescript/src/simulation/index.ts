/**
 * Simulation module for Amazon ECR.
 *
 * This module provides simulation capabilities for testing ECR integrations
 * without requiring AWS credentials or making actual API calls.
 *
 * Features:
 * - Mock registry with in-memory state
 * - Mock client with error and latency injection
 * - Operation recording for capturing real API interactions
 * - Replay engine for deterministic testing
 *
 * @module simulation
 */

export { MockRegistry } from './mock-registry.js';
export type {
  MockRepository,
  MockImage,
  ScanFindings,
  Finding,
} from './mock-registry.js';

export { MockEcrClient } from './mock-client.js';
export type {
  ErrorInjectionConfig,
  LatencyConfig,
  ScanProgressionConfig,
  RecordedOperation,
} from './mock-client.js';

export {
  OperationRecorder,
  wrapClientForRecording,
  createRecordingSession,
} from './recorder.js';
export type { RecordingSession } from './recorder.js';

export {
  ReplayClient,
  createReplaySession,
} from './replay.js';
export type { ReplayConfig, ReplaySession } from './replay.js';

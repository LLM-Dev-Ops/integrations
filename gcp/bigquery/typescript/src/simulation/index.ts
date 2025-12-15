/**
 * Simulation and testing utilities for BigQuery.
 *
 * Following the SPARC specification for Google BigQuery integration.
 */

// Types
export {
  MockQueryResult,
  JobState,
  ReplayScenario,
  MockConfig,
  CallHistoryEntry,
} from "./types.js";

// Mock client
export { MockBigQueryClient } from "./mockClient.js";

// Replay functionality
export {
  RecordingClient,
  ReplayClient,
  saveScenario,
  loadScenario,
} from "./replay.js";

// Test data generator
export {
  generateSchema,
  generateRows,
  generateJob,
  randomValue,
} from "./generator.js";

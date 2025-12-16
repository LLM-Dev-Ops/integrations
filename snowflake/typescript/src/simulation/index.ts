/**
 * Snowflake Integration Simulation Layer
 *
 * Provides query recording and replay capabilities for testing without
 * connecting to Snowflake.
 *
 * @module @llmdevops/snowflake-integration/simulation
 */

export { QueryFingerprinter, defaultFingerprinter } from './fingerprint.js';
export { QueryRecorder } from './recorder.js';
export { SimulationReplayer } from './replayer.js';

// Re-export simulation-related types from the types module
export type { SimulationMode, RecordedQuery } from '../types/index.js';
export type { SimulationConfig } from '../config/index.js';

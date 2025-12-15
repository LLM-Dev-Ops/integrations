/**
 * Simulation Layer
 *
 * Provides recording and replay capabilities for Ollama interactions.
 * Based on SPARC specification Section 7.
 */

// Export types
export type { RecordEntry, RecordedResponse, TimingInfo, Recording } from './types.js';

// Export storage implementations
export { RecordingStorage, MemoryStorage, FileStorage } from './storage.js';

// Export simulation layer
export { SimulationLayer } from './layer.js';

// Re-export config types for convenience
export type { SimulationMode, RecordStorage, TimingMode } from '../config/types.js';

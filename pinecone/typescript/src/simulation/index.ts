/**
 * Simulation layer for Pinecone integration
 * Provides record/replay testing capabilities
 */

export { generateFingerprint, normalizeRequest } from './fingerprint.js';
export { SimulationLayer } from './layer.js';
export type { SimulationLayerConfig } from './layer.js';
export { FileStorage, InMemoryStorage } from './storage.js';
export type { SimulationMode, SimulationRecord, SimulationStorage } from './types.js';

/**
 * Azure Blob Storage Simulation Layer
 *
 * Recording and replay of HTTP interactions for CI/CD testing.
 * Enables testing without live Azure services.
 *
 * @example
 * ```typescript
 * import { SimulationLayer } from './simulation';
 *
 * // Recording mode
 * const layer = new SimulationLayer(
 *   { type: 'recording', path: './recordings.json' }
 * );
 *
 * // Replay mode
 * const replayLayer = new SimulationLayer(
 *   { type: 'replay', path: './recordings.json' }
 * );
 * await replayLayer.load('./recordings.json');
 * ```
 */

export { SimulationLayer } from './layer.js';
export { SimulationStorage } from './storage.js';
export type {
  RecordedInteraction,
  SerializedRequest,
  SerializedResponse,
  SimulationFile,
  SimulationConfig,
  MatchingMode,
} from './types.js';

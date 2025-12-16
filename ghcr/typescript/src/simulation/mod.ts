/**
 * Simulation module exports.
 * @module simulation
 */

export type { RecordedRequest, RecordedResponse, RecordingEntry } from './recorder.js';
export { RequestRecorder } from './recorder.js';

export type { MatchOptions } from './replayer.js';
export { RequestReplayer, createMockResponse } from './replayer.js';

/**
 * Streaming Service Module
 *
 * Re-exports for BigQuery streaming service.
 */

export { StreamingService } from "./service.js";
export { BufferedInserter } from "./buffered.js";
export type {
  InsertAllRequest,
  InsertAllResponse,
  InsertRow,
  InsertError,
  ErrorProto,
  BufferedInserterOptions,
} from "./types.js";
export { DEFAULT_BUFFERED_OPTIONS } from "./types.js";

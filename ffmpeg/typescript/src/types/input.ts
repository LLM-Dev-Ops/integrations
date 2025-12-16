/**
 * Input specification types for FFmpeg operations.
 *
 * Defines input sources including files, streams, and URLs with associated options.
 */

import type { Readable } from 'stream';

/**
 * Type of input source
 */
export type InputType = 'file' | 'pipe' | 'url';

/**
 * Input specification for FFmpeg operations
 */
export interface InputSpec {
  /** Type of input source */
  type: InputType;

  /** File path (required for 'file' type) */
  path?: string;

  /** URL (required for 'url' type) */
  url?: string;

  /** Readable stream (required for 'pipe' type) */
  stream?: Readable;

  /** Force input format (e.g., 'mp4', 'avi', 'rawvideo') */
  format?: string;

  /** Seek to position in seconds before processing */
  seekTo?: number;

  /** Duration in seconds to process from seekTo */
  duration?: number;

  /** Additional FFmpeg input options */
  options?: Record<string, string>;
}

/**
 * Validates that an input spec has the required fields for its type
 */
export function validateInputSpec(input: InputSpec): void {
  switch (input.type) {
    case 'file':
      if (!input.path) {
        throw new Error('Input type "file" requires a path');
      }
      break;
    case 'url':
      if (!input.url) {
        throw new Error('Input type "url" requires a url');
      }
      break;
    case 'pipe':
      if (!input.stream) {
        throw new Error('Input type "pipe" requires a stream');
      }
      if (!input.format) {
        throw new Error('Input type "pipe" requires a format');
      }
      break;
    default:
      throw new Error(`Invalid input type: ${(input as InputSpec).type}`);
  }
}

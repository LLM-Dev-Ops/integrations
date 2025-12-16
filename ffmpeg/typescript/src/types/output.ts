/**
 * Output specification types for FFmpeg operations.
 *
 * Defines output destinations and encoding settings including codecs, quality,
 * and format options.
 */

import type { Writable } from 'stream';

/**
 * Type of output destination
 */
export type OutputType = 'file' | 'pipe';

/**
 * Output specification for FFmpeg operations
 */
export interface OutputSpec {
  /** Type of output destination */
  type: OutputType;

  /** File path (required for 'file' type) */
  path?: string;

  /** Writable stream (required for 'pipe' type) */
  stream?: Writable;

  /** Output format (e.g., 'mp4', 'webm', 'mp3') */
  format?: string;

  // Video encoding options
  /** Video codec (e.g., 'libx264', 'libx265', 'copy') */
  videoCodec?: string;
  /** Video bitrate (e.g., '5M', '2500k') */
  videoBitrate?: string;
  /** Constant Rate Factor for quality (0-51, lower is better) */
  crf?: number;
  /** Output resolution (e.g., '1920x1080', '1280x720') */
  resolution?: string;
  /** Output frame rate */
  fps?: number;

  // Audio encoding options
  /** Audio codec (e.g., 'aac', 'libopus', 'copy') */
  audioCodec?: string;
  /** Audio bitrate (e.g., '128k', '192k') */
  audioBitrate?: string;

  /** Additional FFmpeg output options */
  options?: Record<string, string>;
}

/**
 * Validates that an output spec has the required fields for its type
 */
export function validateOutputSpec(output: OutputSpec): void {
  switch (output.type) {
    case 'file':
      if (!output.path) {
        throw new Error('Output type "file" requires a path');
      }
      break;
    case 'pipe':
      if (!output.stream) {
        throw new Error('Output type "pipe" requires a stream');
      }
      if (!output.format) {
        throw new Error('Output type "pipe" requires a format');
      }
      break;
    default:
      throw new Error(`Invalid output type: ${(output as OutputSpec).type}`);
  }
}

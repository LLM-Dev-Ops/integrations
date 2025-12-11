/**
 * Audio types for transcription and translation.
 */

import { Readable } from 'stream';

/**
 * Supported audio formats.
 */
export type AudioFormat =
  | 'flac'
  | 'mp3'
  | 'mp4'
  | 'mpeg'
  | 'mpga'
  | 'm4a'
  | 'ogg'
  | 'wav'
  | 'webm';

/**
 * Timestamp granularity options.
 */
export type Granularity = 'word' | 'segment';

/**
 * Word-level timestamp.
 */
export interface Word {
  /** The word text. */
  word: string;
  /** Start time in seconds. */
  start: number;
  /** End time in seconds. */
  end: number;
}

/**
 * Segment-level timestamp.
 */
export interface Segment {
  /** Segment ID. */
  id: number;
  /** Segment index. */
  seek: number;
  /** Start time in seconds. */
  start: number;
  /** End time in seconds. */
  end: number;
  /** Segment text. */
  text: string;
  /** Token IDs. */
  tokens: number[];
  /** Temperature used. */
  temperature: number;
  /** Average log probability. */
  avg_logprob: number;
  /** Compression ratio. */
  compression_ratio: number;
  /** No-speech probability. */
  no_speech_prob: number;
}

/**
 * Audio input for transcription/translation.
 */
export type AudioInput =
  | { type: 'path'; path: string }
  | { type: 'buffer'; buffer: Buffer; filename: string }
  | { type: 'stream'; stream: Readable; filename: string };

/**
 * Transcription request.
 */
export interface TranscriptionRequest {
  /** Audio file or buffer. */
  file: AudioInput;
  /** Model to use (e.g., 'whisper-large-v3'). */
  model: string;
  /** Language code (ISO 639-1). */
  language?: string;
  /** Prompt to guide transcription. */
  prompt?: string;
  /** Response format. */
  response_format?: 'json' | 'text' | 'verbose_json' | 'srt' | 'vtt';
  /** Temperature for sampling. */
  temperature?: number;
  /** Timestamp granularities. */
  timestamp_granularities?: Granularity[];
}

/**
 * Transcription response.
 */
export interface TranscriptionResponse {
  /** Transcribed text. */
  text: string;
  /** Task type. */
  task?: string;
  /** Language detected or specified. */
  language?: string;
  /** Duration of the audio in seconds. */
  duration?: number;
  /** Segments with timestamps. */
  segments?: Segment[];
  /** Words with timestamps. */
  words?: Word[];
}

/**
 * Translation request.
 */
export interface TranslationRequest {
  /** Audio file or buffer. */
  file: AudioInput;
  /** Model to use. */
  model: string;
  /** Prompt to guide translation. */
  prompt?: string;
  /** Response format. */
  response_format?: 'json' | 'text' | 'verbose_json' | 'srt' | 'vtt';
  /** Temperature for sampling. */
  temperature?: number;
}

/**
 * Translation response.
 */
export interface TranslationResponse {
  /** Translated text (in English). */
  text: string;
  /** Task type. */
  task?: string;
  /** Source language detected. */
  language?: string;
  /** Duration of the audio in seconds. */
  duration?: number;
  /** Segments with timestamps. */
  segments?: Segment[];
}

/**
 * Creates an audio input from a file path.
 */
export function audioFromPath(path: string): AudioInput {
  return { type: 'path', path };
}

/**
 * Creates an audio input from a buffer.
 */
export function audioFromBuffer(buffer: Buffer, filename: string): AudioInput {
  return { type: 'buffer', buffer, filename };
}

/**
 * Creates an audio input from a stream.
 */
export function audioFromStream(stream: Readable, filename: string): AudioInput {
  return { type: 'stream', stream, filename };
}

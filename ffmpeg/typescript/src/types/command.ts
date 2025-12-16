/**
 * FFmpeg command building types.
 *
 * Defines interfaces for constructing and serializing FFmpeg commands with
 * inputs, outputs, filters, and options.
 */

import type { InputSpec } from './input.js';
import type { OutputSpec } from './output.js';
import type { FilterGraph } from './filter.js';

/**
 * FFmpeg command representation
 */
export interface FFmpegCommand {
  /** Input specifications */
  inputs: InputSpec[];

  /** Output specifications */
  outputs: OutputSpec[];

  /** Global FFmpeg options (before inputs) */
  globalOptions: string[];

  /** Filter graph for complex filtering */
  filterGraph?: FilterGraph;

  /** Convert command to argument array */
  toArgs(): string[];

  /** Convert command to string representation */
  toString(): string;

  /** Serialize command to JSON for replay/logging */
  toJSON(): SerializedCommand;
}

/**
 * Serialized command for persistence and replay
 */
export interface SerializedCommand {
  /** Schema version */
  version: string;

  /** Command identifier */
  id?: string;

  /** Global options */
  globalOptions: string[];

  /** Serialized inputs */
  inputs: SerializedInput[];

  /** Serialized outputs */
  outputs: SerializedOutput[];

  /** Filter graph string */
  filterGraph?: string;

  /** Timestamp when command was created */
  createdAt: string;
}

/**
 * Serialized input (streams are not serializable)
 */
export interface SerializedInput {
  type: 'file' | 'url';
  path?: string;
  url?: string;
  format?: string;
  seekTo?: number;
  duration?: number;
  options?: Record<string, string>;
}

/**
 * Serialized output (streams are not serializable)
 */
export interface SerializedOutput {
  type: 'file';
  path: string;
  format?: string;
  videoCodec?: string;
  audioCodec?: string;
  videoBitrate?: string;
  audioBitrate?: string;
  crf?: number;
  resolution?: string;
  fps?: number;
  options?: Record<string, string>;
}

/**
 * FFmpeg command builder interface
 */
export interface FFmpegCommandBuilder {
  /** Add an input to the command */
  addInput(input: InputSpec): FFmpegCommandBuilder;

  /** Add multiple inputs to the command */
  addInputs(inputs: InputSpec[]): FFmpegCommandBuilder;

  /** Add an output to the command */
  addOutput(output: OutputSpec): FFmpegCommandBuilder;

  /** Add multiple outputs to the command */
  addOutputs(outputs: OutputSpec[]): FFmpegCommandBuilder;

  /** Set a global option */
  setGlobalOption(option: string, value?: string): FFmpegCommandBuilder;

  /** Enable overwrite mode (-y flag) */
  overwrite(): FFmpegCommandBuilder;

  /** Set number of threads */
  setThreads(count: number): FFmpegCommandBuilder;

  /** Set filter graph */
  setFilter(filterGraph: FilterGraph): FFmpegCommandBuilder;

  /** Clear all inputs */
  clearInputs(): FFmpegCommandBuilder;

  /** Clear all outputs */
  clearOutputs(): FFmpegCommandBuilder;

  /** Create a copy of the builder */
  clone(): FFmpegCommandBuilder;

  /** Build the final command */
  build(): FFmpegCommand;
}

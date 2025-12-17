/**
 * FFmpeg Command Builder
 *
 * Provides a fluent API for constructing FFmpeg commands with deterministic
 * argument ordering. Supports inputs, outputs, global options, and filter graphs.
 *
 * @example Basic transcoding
 * ```typescript
 * const builder = new FFmpegCommandBuilderImpl()
 *   .addInput({ type: 'file', path: '/input.mp4' })
 *   .addOutput({
 *     type: 'file',
 *     path: '/output.mp4',
 *     videoCodec: 'libx264',
 *     audioCodec: 'aac'
 *   })
 *   .overwrite();
 *
 * const command = builder.build();
 * console.log(command.toArgs());
 * // ['-y', '-i', '/input.mp4', '-c:v', 'libx264', '-c:a', 'aac', '/output.mp4']
 * ```
 */

import type {
  FFmpegCommand,
  FFmpegCommandBuilder,
  SerializedCommand,
  SerializedInput,
  SerializedOutput,
} from './types/command.js';
import type { InputSpec } from './types/input.js';
import type { OutputSpec } from './types/output.js';
import type { FilterGraph } from './types/filter.js';
import { validateInputSpec } from './types/input.js';
import { validateOutputSpec } from './types/output.js';

/**
 * Format time value (seconds) to FFmpeg time string (HH:MM:SS.ss)
 */
function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toFixed(2).padStart(5, '0')}`;
}

/**
 * Error thrown when command validation fails
 */
export class CommandValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommandValidationError';
  }
}

/**
 * Implementation of the FFmpegCommandBuilder interface
 */
export class FFmpegCommandBuilderImpl implements FFmpegCommandBuilder {
  private inputs: InputSpec[] = [];
  private outputs: OutputSpec[] = [];
  private globalOptions: string[] = [];
  private filter: FilterGraph | undefined = undefined;
  private commandId: string | undefined = undefined;

  /**
   * Set a unique command ID for serialization/replay
   */
  setId(id: string): FFmpegCommandBuilderImpl {
    this.commandId = id;
    return this;
  }

  /**
   * Add an input to the command
   */
  addInput(input: InputSpec): FFmpegCommandBuilderImpl {
    validateInputSpec(input);
    this.inputs.push(input);
    return this;
  }

  /**
   * Add multiple inputs to the command
   */
  addInputs(inputs: InputSpec[]): FFmpegCommandBuilderImpl {
    for (const input of inputs) {
      this.addInput(input);
    }
    return this;
  }

  /**
   * Add an output to the command
   */
  addOutput(output: OutputSpec): FFmpegCommandBuilderImpl {
    validateOutputSpec(output);
    this.outputs.push(output);
    return this;
  }

  /**
   * Add multiple outputs to the command
   */
  addOutputs(outputs: OutputSpec[]): FFmpegCommandBuilderImpl {
    for (const output of outputs) {
      this.addOutput(output);
    }
    return this;
  }

  /**
   * Set a global option (added before inputs)
   *
   * @param option - The option flag (e.g., '-y', '-threads')
   * @param value - Optional value for the option
   */
  setGlobalOption(option: string, value?: string): FFmpegCommandBuilderImpl {
    this.globalOptions.push(option);
    if (value !== undefined) {
      this.globalOptions.push(value);
    }
    return this;
  }

  /**
   * Enable overwrite mode (-y flag)
   */
  overwrite(): FFmpegCommandBuilderImpl {
    return this.setGlobalOption('-y');
  }

  /**
   * Disable overwrite (prompt before overwriting)
   */
  noOverwrite(): FFmpegCommandBuilderImpl {
    return this.setGlobalOption('-n');
  }

  /**
   * Set number of threads for encoding
   */
  setThreads(count: number): FFmpegCommandBuilderImpl {
    if (count < 0) {
      throw new CommandValidationError('Thread count must be non-negative');
    }
    return this.setGlobalOption('-threads', String(count));
  }

  /**
   * Set the filter graph
   */
  setFilter(filterGraph: FilterGraph): FFmpegCommandBuilderImpl {
    this.filter = filterGraph;
    return this;
  }

  /**
   * Clear all inputs
   */
  clearInputs(): FFmpegCommandBuilderImpl {
    this.inputs = [];
    return this;
  }

  /**
   * Clear all outputs
   */
  clearOutputs(): FFmpegCommandBuilderImpl {
    this.outputs = [];
    return this;
  }

  /**
   * Create a copy of the builder with current state
   */
  clone(): FFmpegCommandBuilderImpl {
    const cloned = new FFmpegCommandBuilderImpl();
    cloned.inputs = [...this.inputs];
    cloned.outputs = [...this.outputs];
    cloned.globalOptions = [...this.globalOptions];
    cloned.filter = this.filter;
    cloned.commandId = this.commandId;
    return cloned;
  }

  /**
   * Build the final FFmpeg command
   */
  build(): FFmpegCommand {
    if (this.inputs.length === 0) {
      throw new CommandValidationError('At least one input is required');
    }

    if (this.outputs.length === 0) {
      throw new CommandValidationError('At least one output is required');
    }

    // Capture current state for closure
    const inputs = [...this.inputs];
    const outputs = [...this.outputs];
    const globalOptions = [...this.globalOptions];
    const filterGraph = this.filter;
    const commandId = this.commandId;

    const buildArgs = (): string[] => {
      const args: string[] = [];

      // Global options first
      args.push(...globalOptions);

      // Input specifications
      for (const input of inputs) {
        args.push(...buildInputArgs(input));
      }

      // Filter graph
      if (filterGraph) {
        const filterStr = filterGraph.toString();
        if (filterStr) {
          args.push('-filter_complex', filterStr);
        }
      }

      // Output specifications
      for (const output of outputs) {
        args.push(...buildOutputArgs(output));
      }

      return args;
    };

    const serialize = (): SerializedCommand => {
      return {
        version: '1.0',
        id: commandId,
        globalOptions: [...globalOptions],
        inputs: inputs
          .filter((i) => i.type !== 'pipe')
          .map(serializeInput),
        outputs: outputs
          .filter((o) => o.type !== 'pipe')
          .map(serializeOutput),
        filterGraph: filterGraph?.toString(),
        createdAt: new Date().toISOString(),
      };
    };

    return {
      inputs,
      outputs,
      globalOptions,
      filterGraph,
      toArgs: buildArgs,
      toString: () => buildArgs().join(' '),
      toJSON: serialize,
    };
  }
}

/**
 * Build argument array for an input specification
 */
function buildInputArgs(input: InputSpec): string[] {
  const args: string[] = [];

  // Input options before -i (seeking, duration, format)
  if (input.seekTo !== undefined) {
    args.push('-ss', formatTime(input.seekTo));
  }

  if (input.duration !== undefined) {
    args.push('-t', formatTime(input.duration));
  }

  if (input.format) {
    args.push('-f', input.format);
  }

  // Additional options
  if (input.options) {
    for (const [key, value] of Object.entries(input.options)) {
      args.push(`-${key}`, String(value));
    }
  }

  // Input source
  switch (input.type) {
    case 'file':
      args.push('-i', input.path!);
      break;
    case 'pipe':
      args.push('-i', 'pipe:0');
      break;
    case 'url':
      args.push('-i', input.url!);
      break;
  }

  return args;
}

/**
 * Build argument array for an output specification
 */
function buildOutputArgs(output: OutputSpec): string[] {
  const args: string[] = [];

  // Video codec options
  if (output.videoCodec) {
    args.push('-c:v', output.videoCodec);
  }

  // Audio codec options
  if (output.audioCodec) {
    args.push('-c:a', output.audioCodec);
  }

  // Video quality/bitrate
  if (output.videoBitrate) {
    args.push('-b:v', output.videoBitrate);
  }

  if (output.crf !== undefined) {
    args.push('-crf', String(output.crf));
  }

  // Audio bitrate
  if (output.audioBitrate) {
    args.push('-b:a', output.audioBitrate);
  }

  // Resolution
  if (output.resolution) {
    args.push('-s', output.resolution);
  }

  // Frame rate
  if (output.fps !== undefined) {
    args.push('-r', String(output.fps));
  }

  // Output format
  if (output.format) {
    args.push('-f', output.format);
  }

  // Additional options
  if (output.options) {
    for (const [key, value] of Object.entries(output.options)) {
      args.push(`-${key}`, String(value));
    }
  }

  // Output destination
  switch (output.type) {
    case 'file':
      args.push(output.path!);
      break;
    case 'pipe':
      args.push('pipe:1');
      break;
  }

  return args;
}

/**
 * Serialize an input spec (excluding non-serializable streams)
 */
function serializeInput(input: InputSpec): SerializedInput {
  if (input.type === 'pipe') {
    throw new Error('Cannot serialize pipe input');
  }

  return {
    type: input.type as 'file' | 'url',
    path: input.path,
    url: input.url,
    format: input.format,
    seekTo: input.seekTo,
    duration: input.duration,
    options: input.options,
  };
}

/**
 * Serialize an output spec (excluding non-serializable streams)
 */
function serializeOutput(output: OutputSpec): SerializedOutput {
  if (output.type === 'pipe') {
    throw new Error('Cannot serialize pipe output');
  }

  return {
    type: 'file',
    path: output.path!,
    format: output.format,
    videoCodec: output.videoCodec,
    audioCodec: output.audioCodec,
    videoBitrate: output.videoBitrate,
    audioBitrate: output.audioBitrate,
    crf: output.crf,
    resolution: output.resolution,
    fps: output.fps,
    options: output.options,
  };
}

/**
 * Create a new FFmpeg command builder
 */
export function createCommandBuilder(): FFmpegCommandBuilderImpl {
  return new FFmpegCommandBuilderImpl();
}

/**
 * Deserialize a command from JSON (for replay)
 */
export function deserializeCommand(serialized: SerializedCommand): FFmpegCommand {
  if (serialized.version !== '1.0') {
    throw new Error(`Unsupported command version: ${serialized.version}`);
  }

  const builder = new FFmpegCommandBuilderImpl();

  // Restore global options
  for (let i = 0; i < serialized.globalOptions.length; i++) {
    const option = serialized.globalOptions[i];
    // Check if next item is a value (doesn't start with -)
    if (i + 1 < serialized.globalOptions.length && !serialized.globalOptions[i + 1].startsWith('-')) {
      builder.setGlobalOption(option, serialized.globalOptions[i + 1]);
      i++; // Skip the value
    } else {
      builder.setGlobalOption(option);
    }
  }

  // Restore inputs
  for (const input of serialized.inputs) {
    builder.addInput({
      type: input.type,
      path: input.path,
      url: input.url,
      format: input.format,
      seekTo: input.seekTo,
      duration: input.duration,
      options: input.options,
    });
  }

  // Restore outputs
  for (const output of serialized.outputs) {
    builder.addOutput({
      type: output.type,
      path: output.path,
      format: output.format,
      videoCodec: output.videoCodec,
      audioCodec: output.audioCodec,
      videoBitrate: output.videoBitrate,
      audioBitrate: output.audioBitrate,
      crf: output.crf,
      resolution: output.resolution,
      fps: output.fps,
      options: output.options,
    });
  }

  // Note: Filter graph from string would require parsing, which is complex
  // For now, raw filter strings can be restored using FilterGraph.raw()

  return builder.build();
}

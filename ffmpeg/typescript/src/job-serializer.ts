/**
 * FFmpeg Integration Module - Job Serialization
 * Functions for serializing and deserializing FFmpeg jobs
 */

import {
  FFmpegJob,
  SerializedJob,
  SerializedInput,
  SerializedOutput,
  InputSpec,
  OutputSpec,
} from "./types/index.js";

const SERIALIZATION_VERSION = "1.0";

/**
 * Serialize an FFmpeg job to a JSON-compatible format
 * Excludes streams and runtime objects, suitable for storage/replay
 * @param job - The FFmpeg job to serialize
 * @returns Serialized job object
 */
export function serializeJob(job: FFmpegJob): SerializedJob {
  return {
    version: SERIALIZATION_VERSION,
    id: job.id || "",
    operation: job.operation,
    command: [], // Will be populated by command builder
    input: serializeInput(job.input),
    output: serializeOutput(job.output),
    options: job.options || {},
    createdAt: new Date().toISOString(),
  };
}

/**
 * Deserialize a serialized job back to FFmpegJob format
 * @param serialized - The serialized job object
 * @returns Reconstructed FFmpeg job
 * @throws Error if version is unsupported
 */
export function deserializeJob(serialized: SerializedJob): FFmpegJob {
  if (serialized.version !== SERIALIZATION_VERSION) {
    throw new Error(`Unsupported job version: ${serialized.version}. Expected: ${SERIALIZATION_VERSION}`);
  }

  return {
    id: serialized.id,
    operation: serialized.operation,
    input: deserializeInput(serialized.input),
    output: deserializeOutput(serialized.output),
    options: serialized.options,
  };
}

/**
 * Serialize input specification
 * Excludes stream objects
 */
function serializeInput(input: InputSpec): SerializedInput {
  const serialized: SerializedInput = {
    type: input.type === "pipe" ? "file" : input.type, // Convert pipe to file for serialization
  };

  if (input.path) {
    serialized.path = input.path;
  }

  if (input.url) {
    serialized.url = input.url;
  }

  if (input.format) {
    serialized.format = input.format;
  }

  if (input.seekTo !== undefined) {
    serialized.seekTo = input.seekTo;
  }

  if (input.duration !== undefined) {
    serialized.duration = input.duration;
  }

  if (input.options) {
    serialized.options = { ...input.options };
  }

  return serialized;
}

/**
 * Serialize output specification
 * Excludes stream objects
 */
function serializeOutput(output: OutputSpec): SerializedOutput {
  const serialized: SerializedOutput = {
    type: "file",
    path: output.path || "",
  };

  if (output.format) {
    serialized.format = output.format;
  }

  if (output.videoCodec) {
    serialized.videoCodec = output.videoCodec;
  }

  if (output.audioCodec) {
    serialized.audioCodec = output.audioCodec;
  }

  if (output.videoBitrate) {
    serialized.videoBitrate = output.videoBitrate;
  }

  if (output.audioBitrate) {
    serialized.audioBitrate = output.audioBitrate;
  }

  if (output.crf !== undefined) {
    serialized.crf = output.crf;
  }

  if (output.resolution) {
    serialized.resolution = output.resolution;
  }

  if (output.fps !== undefined) {
    serialized.fps = output.fps;
  }

  if (output.options) {
    serialized.options = { ...output.options };
  }

  return serialized;
}

/**
 * Deserialize input specification
 */
function deserializeInput(serialized: SerializedInput): InputSpec {
  const input: InputSpec = {
    type: serialized.type,
  };

  if (serialized.path) {
    input.path = serialized.path;
  }

  if (serialized.url) {
    input.url = serialized.url;
  }

  if (serialized.format) {
    input.format = serialized.format;
  }

  if (serialized.seekTo !== undefined) {
    input.seekTo = serialized.seekTo;
  }

  if (serialized.duration !== undefined) {
    input.duration = serialized.duration;
  }

  if (serialized.options) {
    input.options = { ...serialized.options };
  }

  return input;
}

/**
 * Deserialize output specification
 */
function deserializeOutput(serialized: SerializedOutput): OutputSpec {
  const output: OutputSpec = {
    type: serialized.type,
    path: serialized.path,
  };

  if (serialized.format) {
    output.format = serialized.format;
  }

  if (serialized.videoCodec) {
    output.videoCodec = serialized.videoCodec;
  }

  if (serialized.audioCodec) {
    output.audioCodec = serialized.audioCodec;
  }

  if (serialized.videoBitrate) {
    output.videoBitrate = serialized.videoBitrate;
  }

  if (serialized.audioBitrate) {
    output.audioBitrate = serialized.audioBitrate;
  }

  if (serialized.crf !== undefined) {
    output.crf = serialized.crf;
  }

  if (serialized.resolution) {
    output.resolution = serialized.resolution;
  }

  if (serialized.fps !== undefined) {
    output.fps = serialized.fps;
  }

  if (serialized.options) {
    output.options = { ...serialized.options };
  }

  return output;
}

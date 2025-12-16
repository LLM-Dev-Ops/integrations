/**
 * FFmpeg Integration Module - Preset Library
 * Predefined transcoding profiles for common use cases
 */

import { OutputSpec, PresetName } from "./types/index.js";

/**
 * Preset library with predefined transcoding profiles
 * Based on industry best practices and common use cases
 */
export const PRESETS: Record<PresetName, Partial<OutputSpec>> = {
  /**
   * Web HD - High quality video for web streaming
   * 1920x1080, H.264 High Profile, AAC audio
   */
  "web-hd": {
    videoCodec: "libx264",
    audioCodec: "aac",
    videoBitrate: "5M",
    audioBitrate: "192k",
    resolution: "1920x1080",
    options: {
      preset: "medium",
      "profile:v": "high",
      level: "4.1",
      movflags: "+faststart", // Enable web streaming optimization
    },
  },

  /**
   * Web SD - Standard definition for web streaming
   * 1280x720, H.264 Main Profile, AAC audio
   */
  "web-sd": {
    videoCodec: "libx264",
    audioCodec: "aac",
    videoBitrate: "2500k",
    audioBitrate: "128k",
    resolution: "1280x720",
    options: {
      preset: "medium",
      "profile:v": "main",
      movflags: "+faststart",
    },
  },

  /**
   * Mobile - Optimized for mobile devices
   * 854x480, H.264 Baseline Profile, AAC audio
   */
  mobile: {
    videoCodec: "libx264",
    audioCodec: "aac",
    videoBitrate: "1M",
    audioBitrate: "96k",
    resolution: "854x480",
    options: {
      preset: "fast",
      "profile:v": "baseline",
      level: "3.0",
    },
  },

  /**
   * Archive - High quality archival with H.265/HEVC
   * CRF 18 (near lossless), AAC audio
   */
  archive: {
    videoCodec: "libx265",
    audioCodec: "aac",
    crf: 18,
    audioBitrate: "256k",
    options: {
      preset: "slow", // Better compression
    },
  },

  /**
   * Podcast - Audio-only optimized for voice
   * Mono, 128k AAC
   */
  podcast: {
    audioCodec: "aac",
    audioBitrate: "128k",
    options: {
      ac: "1", // Mono
      ar: "44100", // 44.1 kHz sample rate
    },
  },

  /**
   * Music - High quality audio for music
   * Stereo, 256k AAC
   */
  music: {
    audioCodec: "aac",
    audioBitrate: "256k",
    options: {
      ac: "2", // Stereo
      ar: "48000", // 48 kHz sample rate
    },
  },

  /**
   * Voice - Low bandwidth voice optimized with Opus
   * Mono, 32k Opus codec
   */
  voice: {
    audioCodec: "libopus",
    audioBitrate: "32k",
    options: {
      ac: "1", // Mono
      ar: "16000", // 16 kHz sample rate
      application: "voip", // Optimize for voice
    },
  },
};

/**
 * Get a preset configuration by name
 * @param name - The preset name
 * @returns Partial OutputSpec with preset configuration
 * @throws Error if preset name is invalid
 */
export function getPreset(name: PresetName): Partial<OutputSpec> {
  const preset = PRESETS[name];
  if (!preset) {
    throw new Error(`Invalid preset name: ${name}. Valid presets: ${Object.keys(PRESETS).join(", ")}`);
  }
  return { ...preset }; // Return a copy to prevent mutation
}

/**
 * Merge a preset with custom output specifications
 * Custom values override preset values
 * @param presetName - The preset to use as base
 * @param output - Custom output specifications
 * @returns Merged OutputSpec
 */
export function mergeWithPreset(presetName: PresetName, output: OutputSpec): OutputSpec {
  const preset = getPreset(presetName);

  // Deep merge options
  const mergedOptions = {
    ...preset.options,
    ...output.options,
  };

  // Merge top-level properties, with output taking precedence
  return {
    ...preset,
    ...output,
    options: mergedOptions,
  } as OutputSpec;
}

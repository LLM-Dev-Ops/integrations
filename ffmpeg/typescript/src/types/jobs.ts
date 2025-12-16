/**
 * Operation-specific job type definitions for FFmpeg.
 *
 * Defines specialized job types for common FFmpeg operations including
 * transcoding, audio extraction, normalization, thumbnails, and more.
 */

import type { InputSpec } from './input.js';
import type { OutputSpec } from './output.js';

/**
 * Base job interface with common fields
 */
export interface BaseJob {
  /** Optional job identifier (auto-generated if not provided) */
  id?: string;
}

/**
 * Preset names for common encoding profiles
 */
export type PresetName =
  | 'web-hd'      // 1080p web streaming
  | 'web-sd'      // 720p web streaming
  | 'mobile'      // 480p mobile
  | 'archive'     // High-quality archival
  | 'podcast'     // Audio podcast
  | 'music'       // Music streaming
  | 'voice';      // Voice/speech

/**
 * Transcoding job with full control over encoding
 */
export interface TranscodeJob extends BaseJob {
  /** Input specification */
  input: InputSpec;
  /** Output specification */
  output: OutputSpec;
  /** Optional preset to apply */
  preset?: PresetName;
  /** Additional transcoding options */
  options?: TranscodeOptions;
}

/**
 * Options for transcoding operations
 */
export interface TranscodeOptions {
  /** Use two-pass encoding for better quality */
  twoPass?: boolean;
  /** Hardware acceleration (e.g., 'cuda', 'vaapi', 'qsv') */
  hwAccel?: string;
  /** Apply deinterlacing filter */
  deinterlace?: boolean;
  /** Apply denoise filter */
  denoise?: boolean;
  /** Apply audio normalization */
  normalize?: boolean;
}

/**
 * Audio extraction job
 */
export interface AudioExtractJob extends BaseJob {
  /** Input video file */
  input: InputSpec;
  /** Output audio file */
  output: OutputSpec;
  /** Which audio stream to extract (0-based index) */
  streamIndex?: number;
  /** Apply loudness normalization */
  normalize?: boolean;
}

/**
 * Audio normalization standards
 */
export type NormalizationStandard = 'ebu-r128' | 'atsc-a85' | 'custom';

/**
 * Normalization target parameters
 */
export interface NormalizationTarget {
  /** Normalization standard to use */
  standard: NormalizationStandard;
  /** Target integrated loudness in LUFS (defaults to -16) */
  integratedLoudness?: number;
  /** Target true peak in dBTP (defaults to -1.5) */
  truePeak?: number;
  /** Target loudness range in LU (defaults to 11) */
  loudnessRange?: number;
}

/**
 * Audio normalization job
 */
export interface NormalizeJob extends BaseJob {
  /** Input audio/video file */
  input: InputSpec;
  /** Output normalized file */
  output: OutputSpec;
  /** Normalization target */
  target: NormalizationTarget;
}

/**
 * Thumbnail generation job
 */
export interface ThumbnailJob extends BaseJob {
  /** Input video file */
  input: InputSpec;
  /** Output image file */
  output: OutputSpec;
  /** Timestamp in seconds to extract (defaults to 10% of duration) */
  timestamp?: number;
  /** Thumbnail width (defaults to 320) */
  width?: number;
  /** Thumbnail height (defaults to proportional) */
  height?: number;
}

/**
 * Scaling algorithm for resize operations
 */
export type ScaleAlgorithm = 'bilinear' | 'bicubic' | 'lanczos';

/**
 * Video resize job
 */
export interface ResizeJob extends BaseJob {
  /** Input video file */
  input: InputSpec;
  /** Output resized video */
  output: OutputSpec;
  /** Target width */
  width?: number;
  /** Target height */
  height?: number;
  /** Maintain aspect ratio (defaults to true) */
  maintainAspect?: boolean;
  /** Scaling algorithm */
  algorithm?: ScaleAlgorithm;
}

/**
 * Transition effect for concatenation
 */
export type TransitionType = 'fade' | 'dissolve' | 'wipe';

/**
 * Transition specification
 */
export interface TransitionSpec {
  /** Type of transition */
  type: TransitionType;
  /** Duration of transition in seconds */
  duration: number;
}

/**
 * Video concatenation job
 */
export interface ConcatJob extends BaseJob {
  /** Input video files to concatenate */
  inputs: InputSpec[];
  /** Output concatenated video */
  output: OutputSpec;
  /** Optional transition between clips */
  transition?: TransitionSpec;
}

/**
 * Crop specification
 */
export interface CropSpec {
  /** Crop width */
  width: number;
  /** Crop height */
  height: number;
  /** X offset from top-left (defaults to center) */
  x?: number;
  /** Y offset from top-left (defaults to center) */
  y?: number;
}

/**
 * Video crop job
 */
export interface CropJob extends BaseJob {
  /** Input video file */
  input: InputSpec;
  /** Output cropped video */
  output: OutputSpec;
  /** Crop specification */
  crop: CropSpec;
}

/**
 * Frame extraction job
 */
export interface FrameExtractJob extends BaseJob {
  /** Input video file */
  input: InputSpec;
  /** Output directory for frames */
  outputPattern: string;
  /** Frame rate to extract (e.g., 1 = 1 frame per second) */
  fps?: number;
  /** Start time in seconds */
  startTime?: number;
  /** Duration in seconds */
  duration?: number;
  /** Image format (e.g., 'png', 'jpg') */
  format?: string;
}

/**
 * Watermark position
 */
export type WatermarkPosition =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'center';

/**
 * Watermark specification
 */
export interface WatermarkSpec {
  /** Type of watermark */
  type: 'image' | 'text';
  /** Image file path (for image watermark) */
  imagePath?: string;
  /** Text content (for text watermark) */
  text?: string;
  /** Position on video */
  position: WatermarkPosition;
  /** Opacity (0.0 to 1.0) */
  opacity?: number;
  /** Padding from edges in pixels */
  padding?: number;
}

/**
 * Watermark application job
 */
export interface WatermarkJob extends BaseJob {
  /** Input video file */
  input: InputSpec;
  /** Output watermarked video */
  output: OutputSpec;
  /** Watermark specification */
  watermark: WatermarkSpec;
}

/**
 * HLS (HTTP Live Streaming) segment configuration
 */
export interface HLSConfig {
  /** Segment duration in seconds (defaults to 6) */
  segmentDuration?: number;
  /** Playlist type ('vod' or 'event') */
  playlistType?: 'vod' | 'event';
  /** Output directory for segments and playlist */
  outputDir: string;
  /** Segment filename pattern */
  segmentPattern?: string;
}

/**
 * HLS generation job
 */
export interface HLSJob extends BaseJob {
  /** Input video file */
  input: InputSpec;
  /** HLS configuration */
  config: HLSConfig;
}

/**
 * Stream options for stream-based processing
 */
export interface StreamOptions {
  /** Optional job identifier */
  jobId?: string;
  /** Input format (required for pipe input) */
  inputFormat?: string;
  /** Output format */
  outputFormat?: string;
  /** Video codec */
  codec?: string;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Progress callback */
  onProgress?: (progress: number) => void;
}

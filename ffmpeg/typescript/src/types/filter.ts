/**
 * FFmpeg filter graph types.
 *
 * Defines structures for building complex filter graphs with multiple filters,
 * connections, and stream mappings.
 */

/**
 * Filter node in a filter graph
 */
export interface FilterNode {
  /** Unique identifier for the filter */
  id: string;

  /** Filter name (e.g., 'scale', 'crop', 'overlay') */
  name: string;

  /** Filter parameters */
  params?: Record<string, unknown>;

  /** Raw filter string (if not using structured params) */
  raw?: string;

  /** Input pads */
  inputs?: string[];

  /** Output pads */
  outputs?: string[];
}

/**
 * Filter connection between nodes
 */
export interface FilterConnection {
  /** Source filter ID */
  from: string;

  /** Source output pad */
  fromPad?: string;

  /** Target filter ID */
  to: string;

  /** Target input pad */
  toPad?: string;
}

/**
 * Filter graph containing multiple filters and connections
 */
export interface FilterGraph {
  /** Filters in the graph */
  filters: FilterNode[];

  /** Connections between filters */
  connections?: FilterConnection[];

  /** Convert to FFmpeg filter_complex string */
  toString(): string;

  /** Convert to JSON for serialization */
  toJSON(): object;
}

/**
 * Filter graph builder interface
 */
export interface FilterGraphBuilder {
  /** Add a filter to the graph */
  addFilter(name: string, params?: Record<string, unknown>): FilterGraphBuilder;

  /** Chain multiple filters in sequence */
  chain(...filterNames: string[]): FilterGraphBuilder;

  /** Add a scale filter */
  scale(width: number | string, height: number | string): FilterGraphBuilder;

  /** Add a crop filter */
  crop(width: number, height: number, x?: number, y?: number): FilterGraphBuilder;

  /** Add a fps filter */
  fps(rate: number): FilterGraphBuilder;

  /** Add a loudnorm filter */
  loudnorm(params: LoudnormParams): FilterGraphBuilder;

  /** Add an overlay filter */
  overlay(x: number | string, y: number | string): FilterGraphBuilder;

  /** Add a fade filter */
  fade(type: 'in' | 'out', startFrame?: number, duration?: number): FilterGraphBuilder;

  /** Add a raw filter string */
  raw(filterString: string): FilterGraphBuilder;

  /** Build the filter graph */
  build(): FilterGraph;
}

/**
 * Loudness normalization parameters (EBU R128)
 */
export interface LoudnormParams {
  /** Target integrated loudness in LUFS */
  I?: number;

  /** Target true peak in dBTP */
  TP?: number;

  /** Target loudness range in LU */
  LRA?: number;

  /** Measured input integrated loudness (for two-pass) */
  measured_I?: number;

  /** Measured input true peak (for two-pass) */
  measured_TP?: number;

  /** Measured input loudness range (for two-pass) */
  measured_LRA?: number;

  /** Measured input threshold (for two-pass) */
  measured_thresh?: number;

  /** Target offset (for two-pass) */
  offset?: number;

  /** Use linear mode (for two-pass) */
  linear?: boolean;

  /** Print format for measurements */
  print_format?: 'summary' | 'json';
}

/**
 * Scale filter parameters
 */
export interface ScaleParams {
  /** Width (can be number or expression like 'iw/2') */
  w?: number | string;

  /** Height (can be number or expression like 'ih/2') */
  h?: number | string;

  /** Scaling algorithm */
  flags?: 'bilinear' | 'bicubic' | 'lanczos';

  /** Force original aspect ratio */
  force_original_aspect_ratio?: 'disable' | 'decrease' | 'increase';
}

/**
 * Crop filter parameters
 */
export interface CropParams {
  /** Crop width */
  w: number | string;

  /** Crop height */
  h: number | string;

  /** X offset */
  x?: number | string;

  /** Y offset */
  y?: number | string;
}

/**
 * Overlay filter parameters
 */
export interface OverlayParams {
  /** X position */
  x?: number | string;

  /** Y position */
  y?: number | string;

  /** Enable alpha blending */
  alpha?: boolean;

  /** Overlay mode */
  mode?: 'yuv' | 'rgb';
}

/**
 * Fade filter parameters
 */
export interface FadeParams {
  /** Fade type */
  type: 'in' | 'out';

  /** Start frame or time */
  start_frame?: number;
  start_time?: number;

  /** Number of frames or duration */
  nb_frames?: number;
  duration?: number;

  /** Alpha fade */
  alpha?: boolean;
}

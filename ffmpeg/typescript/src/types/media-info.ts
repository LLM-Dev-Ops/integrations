/**
 * Media information types from FFprobe.
 *
 * Defines structures for media file metadata including format information,
 * stream details, and codec properties.
 */

/**
 * Stream type
 */
export type StreamType = 'video' | 'audio' | 'subtitle' | 'data';

/**
 * Complete media file information from FFprobe
 */
export interface MediaInfo {
  /** Container format information */
  format: FormatInfo;
  /** Array of streams in the media file */
  streams: StreamInfo[];
  /** Total duration in seconds */
  duration: number;
  /** File size in bytes */
  size: number;
  /** Overall bitrate in bits per second */
  bitrate: number;
}

/**
 * Container format information
 */
export interface FormatInfo {
  /** Format name (e.g., 'mov,mp4,m4a,3gp,3g2,mj2') */
  name: string;
  /** Long/descriptive format name */
  longName: string;
  /** Duration in seconds */
  duration: number;
  /** File size in bytes */
  size: number;
  /** Overall bitrate in bits per second */
  bitrate: number;
  /** Format metadata tags */
  tags: Record<string, string>;
}

/**
 * Base stream information
 */
export interface BaseStreamInfo {
  /** Stream index in the file */
  index: number;
  /** Type of stream */
  type: StreamType;
  /** Codec name (e.g., 'h264', 'aac') */
  codec: string;
  /** Full codec name */
  codecLongName: string;
  /** Codec profile (e.g., 'High', 'Main') */
  profile?: string;
  /** Stream bitrate in bits per second */
  bitrate?: number;
  /** Stream duration in seconds */
  duration?: number;
  /** Stream metadata tags */
  tags: Record<string, string>;
}

/**
 * Video stream information
 */
export interface VideoStreamInfo extends BaseStreamInfo {
  type: 'video';
  /** Video width in pixels */
  width: number;
  /** Video height in pixels */
  height: number;
  /** Frame rate (frames per second) */
  fps: number;
  /** Pixel format (e.g., 'yuv420p') */
  pixelFormat: string;
  /** Aspect ratio (e.g., '16:9') */
  aspectRatio?: string;
  /** Color space (e.g., 'bt709') */
  colorSpace?: string;
  /** Color range (e.g., 'tv', 'pc') */
  colorRange?: string;
}

/**
 * Audio stream information
 */
export interface AudioStreamInfo extends BaseStreamInfo {
  type: 'audio';
  /** Sample rate in Hz */
  sampleRate: number;
  /** Number of audio channels */
  channels: number;
  /** Channel layout (e.g., 'stereo', '5.1') */
  channelLayout: string;
  /** Bit depth (e.g., 16, 24) */
  bitDepth?: number;
}

/**
 * Subtitle stream information
 */
export interface SubtitleStreamInfo extends BaseStreamInfo {
  type: 'subtitle';
  /** Subtitle language code (e.g., 'eng', 'spa') */
  language?: string;
  /** Whether subtitles are forced */
  forced?: boolean;
  /** Whether subtitles are hearing impaired */
  hearingImpaired?: boolean;
}

/**
 * Data stream information (for metadata, timecode, etc.)
 */
export interface DataStreamInfo extends BaseStreamInfo {
  type: 'data';
}

/**
 * Union type for all stream types
 */
export type StreamInfo =
  | VideoStreamInfo
  | AudioStreamInfo
  | SubtitleStreamInfo
  | DataStreamInfo;

/**
 * Type guard for video streams
 */
export function isVideoStream(stream: StreamInfo): stream is VideoStreamInfo {
  return stream.type === 'video';
}

/**
 * Type guard for audio streams
 */
export function isAudioStream(stream: StreamInfo): stream is AudioStreamInfo {
  return stream.type === 'audio';
}

/**
 * Type guard for subtitle streams
 */
export function isSubtitleStream(stream: StreamInfo): stream is SubtitleStreamInfo {
  return stream.type === 'subtitle';
}

/**
 * Type guard for data streams
 */
export function isDataStream(stream: StreamInfo): stream is DataStreamInfo {
  return stream.type === 'data';
}

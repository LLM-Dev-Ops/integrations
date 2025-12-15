/**
 * Image Service Types
 *
 * @module services/image/types
 */

/**
 * Image size options.
 */
export type ImageSize = '256x256' | '512x512' | '1024x1024' | '1792x1024' | '1024x1792';

/**
 * Image response format.
 */
export type ImageResponseFormat = 'url' | 'b64_json';

/**
 * Image generation request.
 */
export interface GrokImageRequest {
  /** Prompt for image generation */
  readonly prompt: string;

  /** Model to use */
  readonly model?: string;

  /** Number of images to generate */
  readonly n?: number;

  /** Image size */
  readonly size?: ImageSize;

  /** Response format */
  readonly response_format?: ImageResponseFormat;

  /** User identifier for abuse detection */
  readonly user?: string;
}

/**
 * Generated image.
 */
export interface GeneratedImage {
  /** Image URL (if response_format is 'url') */
  readonly url?: string;

  /** Base64 image data (if response_format is 'b64_json') */
  readonly b64_json?: string;

  /** Revised prompt (if model revised it) */
  readonly revised_prompt?: string;
}

/**
 * Image generation response.
 */
export interface GrokImageResponse {
  /** Creation timestamp */
  readonly created: number;

  /** Generated images */
  readonly data: GeneratedImage[];
}

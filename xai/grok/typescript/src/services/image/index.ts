/**
 * Image Service Module
 *
 * @module services/image
 */

export type {
  GrokImageRequest,
  GrokImageResponse,
  GeneratedImage,
  ImageSize,
  ImageResponseFormat,
} from './types.js';

export { ImageService, DEFAULT_IMAGE_MODEL } from './service.js';

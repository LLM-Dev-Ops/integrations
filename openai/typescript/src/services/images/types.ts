import type { RequestOptions } from '../../types/common.js';

export type ImageSize = '256x256' | '512x512' | '1024x1024' | '1792x1024' | '1024x1792';
export type ImageQuality = 'standard' | 'hd';
export type ImageStyle = 'vivid' | 'natural';
export type ImageResponseFormat = 'url' | 'b64_json';

export interface ImageGenerateRequest {
  prompt: string;
  model?: 'dall-e-2' | 'dall-e-3';
  n?: number;
  quality?: ImageQuality;
  response_format?: ImageResponseFormat;
  size?: ImageSize;
  style?: ImageStyle;
  user?: string;
}

export interface ImageEditRequest {
  image: File | Blob;
  prompt: string;
  mask?: File | Blob;
  model?: 'dall-e-2';
  n?: number;
  size?: '256x256' | '512x512' | '1024x1024';
  response_format?: ImageResponseFormat;
  user?: string;
}

export interface ImageVariationRequest {
  image: File | Blob;
  model?: 'dall-e-2';
  n?: number;
  size?: '256x256' | '512x512' | '1024x1024';
  response_format?: ImageResponseFormat;
  user?: string;
}

export interface ImageResponse {
  created: number;
  data: ImageData[];
}

export interface ImageData {
  url?: string;
  b64_json?: string;
  revised_prompt?: string;
}

export type ImageGenerateParams = ImageGenerateRequest & RequestOptions;
export type ImageEditParams = ImageEditRequest & RequestOptions;
export type ImageVariationParams = ImageVariationRequest & RequestOptions;

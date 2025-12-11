/**
 * Model types for the Groq API.
 */

/**
 * Model information.
 */
export interface Model {
  /** Model ID. */
  id: string;
  /** Object type (always 'model'). */
  object: 'model';
  /** Unix timestamp of creation. */
  created: number;
  /** Model owner. */
  owned_by: string;
  /** Whether the model is active. */
  active?: boolean;
  /** Context window size. */
  context_window?: number;
  /** Public applications info. */
  public_apps?: unknown;
}

/**
 * List of models response.
 */
export interface ModelList {
  /** Object type (always 'list'). */
  object: 'list';
  /** List of models. */
  data: Model[];
}

/**
 * Known Groq models.
 */
export const KnownModels = {
  // LLaMA models
  LLAMA_3_3_70B_VERSATILE: 'llama-3.3-70b-versatile',
  LLAMA_3_3_70B_SPECDEC: 'llama-3.3-70b-specdec',
  LLAMA_3_2_90B_VISION: 'llama-3.2-90b-vision-preview',
  LLAMA_3_2_11B_VISION: 'llama-3.2-11b-vision-preview',
  LLAMA_3_2_3B: 'llama-3.2-3b-preview',
  LLAMA_3_2_1B: 'llama-3.2-1b-preview',
  LLAMA_3_1_70B_VERSATILE: 'llama-3.1-70b-versatile',
  LLAMA_3_1_8B_INSTANT: 'llama-3.1-8b-instant',
  LLAMA_GUARD_3_8B: 'llama-guard-3-8b',

  // Mixtral models
  MIXTRAL_8X7B: 'mixtral-8x7b-32768',

  // Gemma models
  GEMMA_2_9B: 'gemma2-9b-it',
  GEMMA_7B: 'gemma-7b-it',

  // Whisper models
  WHISPER_LARGE_V3: 'whisper-large-v3',
  WHISPER_LARGE_V3_TURBO: 'whisper-large-v3-turbo',
  DISTIL_WHISPER: 'distil-whisper-large-v3-en',

  // Other models
  LLAVA_V1_5_7B: 'llava-v1.5-7b-4096-preview',
} as const;

/**
 * Type for known model IDs.
 */
export type KnownModel = (typeof KnownModels)[keyof typeof KnownModels];

/**
 * Checks if a model ID is a known model.
 */
export function isKnownModel(modelId: string): modelId is KnownModel {
  return Object.values(KnownModels).includes(modelId as KnownModel);
}

/**
 * Checks if a model supports vision.
 */
export function supportsVision(modelId: string): boolean {
  return modelId.includes('vision') || modelId.includes('llava');
}

/**
 * Checks if a model is a Whisper model.
 */
export function isWhisperModel(modelId: string): boolean {
  return modelId.includes('whisper');
}

/**
 * Gets the context window size for known models.
 */
export function getContextWindow(modelId: string): number | undefined {
  const contextWindows: Record<string, number> = {
    'llama-3.3-70b-versatile': 128000,
    'llama-3.3-70b-specdec': 8192,
    'llama-3.2-90b-vision-preview': 8192,
    'llama-3.2-11b-vision-preview': 8192,
    'llama-3.2-3b-preview': 8192,
    'llama-3.2-1b-preview': 8192,
    'llama-3.1-70b-versatile': 128000,
    'llama-3.1-8b-instant': 128000,
    'mixtral-8x7b-32768': 32768,
    'gemma2-9b-it': 8192,
    'gemma-7b-it': 8192,
  };

  return contextWindows[modelId];
}

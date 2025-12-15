/**
 * Grok Model Capabilities
 *
 * Defines capabilities for each Grok model variant.
 *
 * @module models/capabilities
 */

import type { GrokModel, GrokCapabilities, ModelInfo } from './types.js';

/**
 * Capability definitions for all Grok models.
 */
export const MODEL_CAPABILITIES: Record<GrokModel, GrokCapabilities> = {
  'grok-4': {
    contextWindow: 256000,
    supportsVision: true,
    supportsReasoning: false,
    supportsLiveSearch: true,
    supportsTools: true,
    supportsStreaming: true,
    supportsEmbeddings: false,
    supportsImageGeneration: false,
  },
  'grok-4.1': {
    contextWindow: 256000,
    supportsVision: true,
    supportsReasoning: false,
    supportsLiveSearch: true,
    supportsTools: true,
    supportsStreaming: true,
    supportsEmbeddings: false,
    supportsImageGeneration: false,
  },
  'grok-3-beta': {
    contextWindow: 131072,
    supportsVision: false,
    supportsReasoning: true,
    supportsLiveSearch: true,
    supportsTools: true,
    supportsStreaming: true,
    supportsEmbeddings: false,
    supportsImageGeneration: false,
  },
  'grok-3-mini-beta': {
    contextWindow: 131072,
    supportsVision: false,
    supportsReasoning: true,
    supportsLiveSearch: true,
    supportsTools: true,
    supportsStreaming: true,
    supportsEmbeddings: false,
    supportsImageGeneration: false,
  },
  'grok-vision-beta': {
    contextWindow: 128000,
    supportsVision: true,
    supportsReasoning: false,
    supportsLiveSearch: true,
    supportsTools: true,
    supportsStreaming: true,
    supportsEmbeddings: false,
    supportsImageGeneration: false,
  },
  'grok-2-image-1212': {
    contextWindow: 0, // Image generation model
    supportsVision: false,
    supportsReasoning: false,
    supportsLiveSearch: false,
    supportsTools: false,
    supportsStreaming: false,
    supportsEmbeddings: false,
    supportsImageGeneration: true,
  },
  'grok-2-1212': {
    contextWindow: 131072,
    supportsVision: false,
    supportsReasoning: false,
    supportsLiveSearch: true,
    supportsTools: true,
    supportsStreaming: true,
    supportsEmbeddings: true,
    supportsImageGeneration: false,
  },
};

/**
 * Complete model information registry.
 */
export const MODEL_INFO: Record<GrokModel, ModelInfo> = {
  'grok-4': {
    id: 'grok-4',
    displayName: 'Grok 4',
    capabilities: MODEL_CAPABILITIES['grok-4'],
    aliases: ['grok4', 'grok-4-latest'],
    inputPricePerMillion: 3.0,
    outputPricePerMillion: 15.0,
    deprecated: false,
  },
  'grok-4.1': {
    id: 'grok-4.1',
    displayName: 'Grok 4.1',
    capabilities: MODEL_CAPABILITIES['grok-4.1'],
    aliases: ['grok41', 'grok-4-1'],
    inputPricePerMillion: 3.0,
    outputPricePerMillion: 15.0,
    deprecated: false,
  },
  'grok-3-beta': {
    id: 'grok-3-beta',
    displayName: 'Grok 3 Beta',
    capabilities: MODEL_CAPABILITIES['grok-3-beta'],
    aliases: ['grok3', 'grok-3', 'grok3-beta'],
    inputPricePerMillion: 2.0,
    outputPricePerMillion: 10.0,
    deprecated: false,
  },
  'grok-3-mini-beta': {
    id: 'grok-3-mini-beta',
    displayName: 'Grok 3 Mini Beta',
    capabilities: MODEL_CAPABILITIES['grok-3-mini-beta'],
    aliases: ['grok3-mini', 'grok-3-mini', 'grok3mini'],
    inputPricePerMillion: 0.3,
    outputPricePerMillion: 0.5,
    deprecated: false,
  },
  'grok-vision-beta': {
    id: 'grok-vision-beta',
    displayName: 'Grok Vision Beta',
    capabilities: MODEL_CAPABILITIES['grok-vision-beta'],
    aliases: ['grok-vision', 'grokvision'],
    inputPricePerMillion: 2.0,
    outputPricePerMillion: 10.0,
    deprecated: false,
  },
  'grok-2-image-1212': {
    id: 'grok-2-image-1212',
    displayName: 'Grok 2 Image',
    capabilities: MODEL_CAPABILITIES['grok-2-image-1212'],
    aliases: ['grok2-image', 'grok-2-image', 'grok-image'],
    inputPricePerMillion: 0, // Image pricing is per image, not tokens
    outputPricePerMillion: 0,
    deprecated: false,
  },
  'grok-2-1212': {
    id: 'grok-2-1212',
    displayName: 'Grok 2',
    capabilities: MODEL_CAPABILITIES['grok-2-1212'],
    aliases: ['grok2', 'grok-2'],
    inputPricePerMillion: 2.0,
    outputPricePerMillion: 10.0,
    deprecated: false,
  },
};

/**
 * Get capabilities for a model.
 *
 * @param model - Model identifier
 * @returns Model capabilities
 */
export function getCapabilities(model: GrokModel): GrokCapabilities {
  return MODEL_CAPABILITIES[model];
}

/**
 * Get full model info.
 *
 * @param model - Model identifier
 * @returns Model information
 */
export function getModelInfo(model: GrokModel): ModelInfo {
  return MODEL_INFO[model];
}

/**
 * Check if a model supports vision.
 *
 * @param model - Model identifier
 * @returns True if vision is supported
 */
export function supportsVision(model: GrokModel): boolean {
  return MODEL_CAPABILITIES[model].supportsVision;
}

/**
 * Check if a model supports reasoning.
 *
 * @param model - Model identifier
 * @returns True if reasoning is supported
 */
export function supportsReasoning(model: GrokModel): boolean {
  return MODEL_CAPABILITIES[model].supportsReasoning;
}

/**
 * Check if a model supports streaming.
 *
 * @param model - Model identifier
 * @returns True if streaming is supported
 */
export function supportsStreaming(model: GrokModel): boolean {
  return MODEL_CAPABILITIES[model].supportsStreaming;
}

/**
 * Check if a model supports tools/function calling.
 *
 * @param model - Model identifier
 * @returns True if tools are supported
 */
export function supportsTools(model: GrokModel): boolean {
  return MODEL_CAPABILITIES[model].supportsTools;
}

/**
 * Model Registry
 *
 * Provides model resolution by ID or alias.
 *
 * @module models/registry
 */

import type { GrokModel, GrokCapabilities, ModelInfo } from './types.js';
import { MODEL_INFO, MODEL_CAPABILITIES } from './capabilities.js';

/**
 * Model resolution result.
 */
export interface ModelResolution {
  /** Resolved model ID */
  readonly model: GrokModel;

  /** Model information */
  readonly info: ModelInfo;

  /** Whether resolution was exact match or alias */
  readonly exact: boolean;
}

/**
 * Model Registry for resolving model identifiers.
 */
export class ModelRegistry {
  private readonly aliasMap: Map<string, GrokModel>;

  constructor() {
    this.aliasMap = new Map();
    this.buildAliasMap();
  }

  private buildAliasMap(): void {
    for (const [modelId, info] of Object.entries(MODEL_INFO)) {
      const model = modelId as GrokModel;
      // Add exact ID
      this.aliasMap.set(model.toLowerCase(), model);

      // Add all aliases
      for (const alias of info.aliases) {
        this.aliasMap.set(alias.toLowerCase(), model);
      }
    }
  }

  /**
   * Resolve a model identifier to a GrokModel.
   *
   * @param modelHint - Model ID or alias
   * @returns Resolution result or null if not found
   */
  resolve(modelHint: string): ModelResolution | null {
    const normalized = modelHint.toLowerCase().trim();

    // Check if it's a known model ID
    if (normalized in MODEL_INFO) {
      const model = normalized as GrokModel;
      return {
        model,
        info: MODEL_INFO[model],
        exact: true,
      };
    }

    // Check aliases
    const resolved = this.aliasMap.get(normalized);
    if (resolved) {
      return {
        model: resolved,
        info: MODEL_INFO[resolved],
        exact: normalized === resolved,
      };
    }

    return null;
  }

  /**
   * Get capabilities for a model.
   *
   * @param model - Model identifier
   * @returns Model capabilities
   */
  getCapabilities(model: GrokModel): GrokCapabilities {
    return MODEL_CAPABILITIES[model];
  }

  /**
   * Get all registered models.
   *
   * @returns Array of model information
   */
  list(): ModelInfo[] {
    return Object.values(MODEL_INFO);
  }

  /**
   * Get models supporting a specific capability.
   *
   * @param capability - Capability to filter by
   * @returns Array of models with the capability
   */
  listWithCapability(
    capability: keyof GrokCapabilities
  ): ModelInfo[] {
    return Object.values(MODEL_INFO).filter(
      (info) => info.capabilities[capability] === true
    );
  }

  /**
   * Check if a model hint is valid.
   *
   * @param modelHint - Model ID or alias to check
   * @returns True if the model can be resolved
   */
  isValid(modelHint: string): boolean {
    return this.resolve(modelHint) !== null;
  }
}

/**
 * Default model registry instance.
 */
let defaultRegistry: ModelRegistry | null = null;

/**
 * Get the default model registry.
 *
 * @returns Default ModelRegistry instance
 */
export function getModelRegistry(): ModelRegistry {
  if (!defaultRegistry) {
    defaultRegistry = new ModelRegistry();
  }
  return defaultRegistry;
}

/**
 * Resolve a model hint to a GrokModel.
 *
 * @param modelHint - Model ID or alias
 * @returns Resolution result or null if not found
 */
export function resolveModel(modelHint: string): ModelResolution | null {
  return getModelRegistry().resolve(modelHint);
}

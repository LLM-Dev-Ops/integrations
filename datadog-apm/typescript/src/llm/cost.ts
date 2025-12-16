/**
 * Cost tracking for LLM operations
 * Following the SPARC specification with model pricing
 */

/**
 * Model pricing information (per 1M tokens)
 */
interface ModelPricing {
  input: number; // Cost per 1M input tokens
  output: number; // Cost per 1M output tokens
}

/**
 * Model pricing table
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  // Claude models
  'claude-3-opus': {
    input: 15.0,
    output: 75.0,
  },
  'claude-3-opus-20240229': {
    input: 15.0,
    output: 75.0,
  },
  'claude-3-sonnet': {
    input: 3.0,
    output: 15.0,
  },
  'claude-3-sonnet-20240229': {
    input: 3.0,
    output: 15.0,
  },
  'claude-3-5-sonnet': {
    input: 3.0,
    output: 15.0,
  },
  'claude-3-5-sonnet-20241022': {
    input: 3.0,
    output: 15.0,
  },
  'claude-3-5-sonnet-20240620': {
    input: 3.0,
    output: 15.0,
  },
  'claude-3-haiku': {
    input: 0.25,
    output: 1.25,
  },
  'claude-3-haiku-20240307': {
    input: 0.25,
    output: 1.25,
  },
  'claude-3-5-haiku': {
    input: 0.25,
    output: 1.25,
  },
  'claude-3-5-haiku-20241022': {
    input: 0.25,
    output: 1.25,
  },

  // GPT-4 models
  'gpt-4': {
    input: 30.0,
    output: 60.0,
  },
  'gpt-4-0613': {
    input: 30.0,
    output: 60.0,
  },
  'gpt-4-32k': {
    input: 60.0,
    output: 120.0,
  },
  'gpt-4-turbo': {
    input: 10.0,
    output: 30.0,
  },
  'gpt-4-turbo-preview': {
    input: 10.0,
    output: 30.0,
  },
  'gpt-4o': {
    input: 5.0,
    output: 15.0,
  },
  'gpt-4o-mini': {
    input: 0.15,
    output: 0.6,
  },

  // GPT-3.5 models
  'gpt-3.5-turbo': {
    input: 0.5,
    output: 1.5,
  },
  'gpt-3.5-turbo-0125': {
    input: 0.5,
    output: 1.5,
  },
  'gpt-3.5-turbo-1106': {
    input: 1.0,
    output: 2.0,
  },
  'gpt-3.5-turbo-16k': {
    input: 3.0,
    output: 4.0,
  },
};

/**
 * Cost tracker for LLM operations
 */
export class CostTracker {
  /**
   * Calculate the cost of an LLM operation
   * @param model - Model identifier
   * @param inputTokens - Number of input tokens
   * @param outputTokens - Number of output tokens
   * @returns Cost in dollars
   */
  static calculateCost(
    model: string,
    inputTokens: number,
    outputTokens: number
  ): number {
    const pricing = this.getPricing(model);
    if (!pricing) {
      return 0;
    }

    const inputCost = (inputTokens / 1_000_000) * pricing.input;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;

    return inputCost + outputCost;
  }

  /**
   * Get pricing information for a model
   * @param model - Model identifier
   * @returns Pricing information or null if not found
   */
  static getPricing(model: string): ModelPricing | null {
    // Try exact match first
    if (MODEL_PRICING[model]) {
      return MODEL_PRICING[model];
    }

    // Try to find a base model match
    // e.g., "gpt-4-0125-preview" -> "gpt-4"
    for (const [knownModel, pricing] of Object.entries(MODEL_PRICING)) {
      if (model.startsWith(knownModel)) {
        return pricing;
      }
    }

    return null;
  }

  /**
   * Check if pricing is available for a model
   * @param model - Model identifier
   * @returns True if pricing is available
   */
  static hasPricing(model: string): boolean {
    return this.getPricing(model) !== null;
  }

  /**
   * Get all supported models
   * @returns Array of model identifiers
   */
  static getSupportedModels(): string[] {
    return Object.keys(MODEL_PRICING);
  }
}
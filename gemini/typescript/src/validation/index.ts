/**
 * Comprehensive input validation for Gemini API requests.
 *
 * This module provides strict validation at service boundaries to ensure
 * all requests meet API requirements before being sent.
 */

import { ValidationError } from '../error/index.js';
import type {
  GenerateContentRequest,
  EmbedContentRequest,
  Content,
  Part,
  GenerationConfig,
  TaskType,
} from '../types/index.js';

// ============================================================================
// Validation Types
// ============================================================================

/** Detailed validation error information */
export interface ValidationDetail {
  field: string;
  description: string;
  value?: unknown;
}

/** Validation result container */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationDetail[];
}

// ============================================================================
// Content & Part Validation
// ============================================================================

/**
 * Validates a Content object.
 * @param content - The content to validate
 * @param fieldPath - The field path for error reporting
 * @returns Array of validation errors
 */
function validateContent(content: Content, fieldPath: string): ValidationDetail[] {
  const errors: ValidationDetail[] = [];

  if (!content.parts || content.parts.length === 0) {
    errors.push({
      field: `${fieldPath}.parts`,
      description: 'Content must have at least one part',
    });
    return errors;
  }

  content.parts.forEach((part, i) => {
    errors.push(...validatePart(part, `${fieldPath}.parts[${i}]`));
  });

  return errors;
}

/**
 * Validates a Part object.
 * @param part - The part to validate
 * @param fieldPath - The field path for error reporting
 * @returns Array of validation errors
 */
function validatePart(part: Part, fieldPath: string): ValidationDetail[] {
  const errors: ValidationDetail[] = [];
  const partKeys = Object.keys(part);

  if (partKeys.length === 0) {
    errors.push({
      field: fieldPath,
      description: 'Part must have at least one property',
    });
    return errors;
  }

  // Validate text parts
  if ('text' in part) {
    if (typeof part.text !== 'string') {
      errors.push({
        field: `${fieldPath}.text`,
        description: 'Text must be a string',
        value: typeof part.text,
      });
    } else if (part.text.length === 0) {
      errors.push({
        field: `${fieldPath}.text`,
        description: 'Text cannot be empty',
      });
    }
  }

  // Validate inline data parts
  if ('inlineData' in part) {
    if (!part.inlineData.data) {
      errors.push({
        field: `${fieldPath}.inlineData.data`,
        description: 'InlineData must have data property',
      });
    }
    if (!part.inlineData.mimeType) {
      errors.push({
        field: `${fieldPath}.inlineData.mimeType`,
        description: 'InlineData must have mimeType property',
      });
    }
  }

  // Validate file data parts
  if ('fileData' in part) {
    if (!part.fileData.fileUri) {
      errors.push({
        field: `${fieldPath}.fileData.fileUri`,
        description: 'FileData must have fileUri property',
      });
    }
  }

  // Validate function call parts
  if ('functionCall' in part) {
    if (!part.functionCall.name) {
      errors.push({
        field: `${fieldPath}.functionCall.name`,
        description: 'FunctionCall must have name property',
      });
    }
  }

  // Validate function response parts
  if ('functionResponse' in part) {
    if (!part.functionResponse.name) {
      errors.push({
        field: `${fieldPath}.functionResponse.name`,
        description: 'FunctionResponse must have name property',
      });
    }
    if (!part.functionResponse.response) {
      errors.push({
        field: `${fieldPath}.functionResponse.response`,
        description: 'FunctionResponse must have response property',
      });
    }
  }

  return errors;
}

// ============================================================================
// Generation Config Validation
// ============================================================================

/**
 * Validates GenerationConfig parameters.
 * @param config - The generation config to validate
 * @returns Array of validation errors
 */
function validateGenerationConfig(config: GenerationConfig): ValidationDetail[] {
  const errors: ValidationDetail[] = [];

  // Temperature validation (0.0 to 2.0)
  if (config.temperature !== undefined) {
    if (typeof config.temperature !== 'number') {
      errors.push({
        field: 'generationConfig.temperature',
        description: 'Temperature must be a number',
        value: typeof config.temperature,
      });
    } else if (config.temperature < 0 || config.temperature > 2) {
      errors.push({
        field: 'generationConfig.temperature',
        description: 'Temperature must be between 0 and 2',
        value: config.temperature,
      });
    }
  }

  // Top-p validation (0.0 to 1.0)
  if (config.topP !== undefined) {
    if (typeof config.topP !== 'number') {
      errors.push({
        field: 'generationConfig.topP',
        description: 'Top-p must be a number',
        value: typeof config.topP,
      });
    } else if (config.topP < 0 || config.topP > 1) {
      errors.push({
        field: 'generationConfig.topP',
        description: 'Top-p must be between 0 and 1',
        value: config.topP,
      });
    }
  }

  // Top-k validation (must be >= 1)
  if (config.topK !== undefined) {
    if (typeof config.topK !== 'number') {
      errors.push({
        field: 'generationConfig.topK',
        description: 'Top-k must be a number',
        value: typeof config.topK,
      });
    } else if (config.topK < 1) {
      errors.push({
        field: 'generationConfig.topK',
        description: 'Top-k must be at least 1',
        value: config.topK,
      });
    }
  }

  // Max output tokens validation (must be >= 1)
  if (config.maxOutputTokens !== undefined) {
    if (typeof config.maxOutputTokens !== 'number') {
      errors.push({
        field: 'generationConfig.maxOutputTokens',
        description: 'Max output tokens must be a number',
        value: typeof config.maxOutputTokens,
      });
    } else if (config.maxOutputTokens < 1) {
      errors.push({
        field: 'generationConfig.maxOutputTokens',
        description: 'Max output tokens must be at least 1',
        value: config.maxOutputTokens,
      });
    }
  }

  // Candidate count validation (1 to 8)
  if (config.candidateCount !== undefined) {
    if (typeof config.candidateCount !== 'number') {
      errors.push({
        field: 'generationConfig.candidateCount',
        description: 'Candidate count must be a number',
        value: typeof config.candidateCount,
      });
    } else if (config.candidateCount < 1 || config.candidateCount > 8) {
      errors.push({
        field: 'generationConfig.candidateCount',
        description: 'Candidate count must be between 1 and 8',
        value: config.candidateCount,
      });
    }
  }

  // Stop sequences validation
  if (config.stopSequences !== undefined) {
    if (!Array.isArray(config.stopSequences)) {
      errors.push({
        field: 'generationConfig.stopSequences',
        description: 'Stop sequences must be an array',
        value: typeof config.stopSequences,
      });
    } else if (config.stopSequences.length > 5) {
      errors.push({
        field: 'generationConfig.stopSequences',
        description: 'Stop sequences cannot exceed 5 entries',
        value: config.stopSequences.length,
      });
    }
  }

  return errors;
}

// ============================================================================
// Request Validation - Generate Content
// ============================================================================

/**
 * Validates a GenerateContentRequest.
 * Throws ValidationError if validation fails.
 *
 * @param request - The request to validate
 * @throws {ValidationError} If validation fails
 */
export function validateGenerateContentRequest(request: GenerateContentRequest): void {
  const errors: ValidationDetail[] = [];

  // Contents validation (required, non-empty)
  if (!request.contents) {
    errors.push({
      field: 'contents',
      description: 'Contents is required',
    });
  } else if (!Array.isArray(request.contents)) {
    errors.push({
      field: 'contents',
      description: 'Contents must be an array',
      value: typeof request.contents,
    });
  } else if (request.contents.length === 0) {
    errors.push({
      field: 'contents',
      description: 'Contents array must not be empty',
    });
  } else {
    // Validate each content item
    request.contents.forEach((content, i) => {
      errors.push(...validateContent(content, `contents[${i}]`));
    });
  }

  // System instruction validation (optional)
  if (request.systemInstruction) {
    errors.push(...validateContent(request.systemInstruction, 'systemInstruction'));
  }

  // Generation config validation (optional)
  if (request.generationConfig) {
    errors.push(...validateGenerationConfig(request.generationConfig));
  }

  // Tools validation (optional)
  if (request.tools !== undefined) {
    if (!Array.isArray(request.tools)) {
      errors.push({
        field: 'tools',
        description: 'Tools must be an array',
        value: typeof request.tools,
      });
    }
  }

  // Safety settings validation (optional)
  if (request.safetySettings !== undefined) {
    if (!Array.isArray(request.safetySettings)) {
      errors.push({
        field: 'safetySettings',
        description: 'Safety settings must be an array',
        value: typeof request.safetySettings,
      });
    }
  }

  if (errors.length > 0) {
    throw new ValidationError('Invalid GenerateContentRequest', errors);
  }
}

// ============================================================================
// Request Validation - Embeddings
// ============================================================================

/**
 * Validates an EmbedContentRequest.
 * Throws ValidationError if validation fails.
 *
 * @param request - The request to validate
 * @throws {ValidationError} If validation fails
 */
export function validateEmbedContentRequest(request: EmbedContentRequest): void {
  const errors: ValidationDetail[] = [];

  // Content validation (required)
  if (!request.content) {
    errors.push({
      field: 'content',
      description: 'Content is required',
    });
  } else {
    errors.push(...validateContent(request.content, 'content'));

    // Embedding content must be text-only
    if (request.content.parts) {
      request.content.parts.forEach((part, i) => {
        if (!('text' in part)) {
          errors.push({
            field: `content.parts[${i}]`,
            description: 'Embedding content must contain only text parts',
          });
        }
      });
    }
  }

  // Output dimensionality validation (1 to 768)
  if (request.outputDimensionality !== undefined) {
    if (typeof request.outputDimensionality !== 'number') {
      errors.push({
        field: 'outputDimensionality',
        description: 'Output dimensionality must be a number',
        value: typeof request.outputDimensionality,
      });
    } else if (request.outputDimensionality < 1 || request.outputDimensionality > 768) {
      errors.push({
        field: 'outputDimensionality',
        description: 'Output dimensionality must be between 1 and 768',
        value: request.outputDimensionality,
      });
    }
  }

  // Title validation (only for RETRIEVAL_DOCUMENT)
  if (request.title !== undefined) {
    if (request.taskType !== 'RETRIEVAL_DOCUMENT') {
      errors.push({
        field: 'title',
        description: 'Title is only allowed for RETRIEVAL_DOCUMENT task type',
        value: request.taskType,
      });
    }
    if (typeof request.title !== 'string' || request.title.length === 0) {
      errors.push({
        field: 'title',
        description: 'Title must be a non-empty string',
      });
    }
  }

  // Task type validation
  if (request.taskType !== undefined) {
    const validTaskTypes: TaskType[] = [
      'RETRIEVAL_QUERY',
      'RETRIEVAL_DOCUMENT',
      'SEMANTIC_SIMILARITY',
      'CLASSIFICATION',
      'CLUSTERING',
    ];
    if (!validTaskTypes.includes(request.taskType)) {
      errors.push({
        field: 'taskType',
        description: `Task type must be one of: ${validTaskTypes.join(', ')}`,
        value: request.taskType,
      });
    }
  }

  if (errors.length > 0) {
    throw new ValidationError('Invalid EmbedContentRequest', errors);
  }
}

// ============================================================================
// Batch Validation
// ============================================================================

/**
 * Validates batch size.
 * Throws ValidationError if batch size exceeds maximum.
 *
 * @param items - The items array to validate
 * @param maxSize - Maximum allowed size
 * @param fieldName - Field name for error reporting
 * @throws {ValidationError} If batch size exceeds maximum
 */
export function validateBatchSize(items: unknown[], maxSize: number, fieldName: string): void {
  if (!Array.isArray(items)) {
    throw new ValidationError(`${fieldName} must be an array`, [{
      field: fieldName,
      description: 'Must be an array',
      value: typeof items,
    }]);
  }

  if (items.length === 0) {
    throw new ValidationError(`${fieldName} cannot be empty`, [{
      field: fieldName,
      description: 'Array cannot be empty',
      value: 0,
    }]);
  }

  if (items.length > maxSize) {
    throw new ValidationError(`Batch size exceeds maximum of ${maxSize}`, [{
      field: fieldName,
      description: `Batch size ${items.length} exceeds maximum of ${maxSize}`,
      value: items.length,
    }]);
  }
}

// ============================================================================
// Model Name Validation
// ============================================================================

/**
 * Validates a model name.
 * Throws ValidationError if model name is invalid.
 *
 * @param model - The model name to validate
 * @throws {ValidationError} If model name is invalid
 */
export function validateModelName(model: string): void {
  if (!model || typeof model !== 'string') {
    throw new ValidationError('Invalid model name', [{
      field: 'model',
      description: 'Model name must be a non-empty string',
      value: model,
    }]);
  }

  if (model.trim().length === 0) {
    throw new ValidationError('Invalid model name', [{
      field: 'model',
      description: 'Model name cannot be empty or whitespace',
    }]);
  }
}

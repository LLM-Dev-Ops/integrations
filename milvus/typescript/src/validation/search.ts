import { MilvusValidationError } from '../errors/index.js';
import { SearchRequest, HybridSearchRequest } from '../types/search.js';
import { IndexType } from '../types/metric.js';
import { MAX_DIMENSIONS } from './entity.js';

/**
 * Maximum top_k value.
 */
export const MAX_TOP_K = 16_384;

/**
 * Maximum number of query vectors.
 */
export const MAX_NQ = 16_384;

/**
 * Validate a search request.
 */
export function validateSearchRequest(request: SearchRequest): void {
  if (!request.collectionName || request.collectionName.trim() === '') {
    throw new MilvusValidationError('Collection name is required', {
      field: 'collectionName',
    });
  }

  if (!request.vectorField || request.vectorField.trim() === '') {
    throw new MilvusValidationError('Vector field name is required', {
      field: 'vectorField',
    });
  }

  if (!request.vectors || request.vectors.length === 0) {
    throw new MilvusValidationError('At least one query vector is required', {
      field: 'vectors',
    });
  }

  if (request.vectors.length > MAX_NQ) {
    throw new MilvusValidationError(
      `Number of query vectors ${request.vectors.length} exceeds maximum ${MAX_NQ}`,
      { field: 'vectors', details: { count: request.vectors.length, max: MAX_NQ } }
    );
  }

  if (request.topK <= 0 || request.topK > MAX_TOP_K) {
    throw new MilvusValidationError(
      `Invalid topK: ${request.topK}. Must be between 1 and ${MAX_TOP_K}`,
      { field: 'topK', details: { value: request.topK, max: MAX_TOP_K } }
    );
  }

  // Validate vectors
  validateVectors(request.vectors);

  // Validate search params
  validateSearchParams(request.params.indexType, request.params.params);

  // Validate filter if provided
  if (request.filter) {
    validateFilterExpression(request.filter);
  }
}

/**
 * Validate a hybrid search request.
 */
export function validateHybridSearchRequest(request: HybridSearchRequest): void {
  if (!request.collectionName || request.collectionName.trim() === '') {
    throw new MilvusValidationError('Collection name is required', {
      field: 'collectionName',
    });
  }

  if (!request.searches || request.searches.length === 0) {
    throw new MilvusValidationError('At least one search is required', {
      field: 'searches',
    });
  }

  if (request.finalTopK <= 0 || request.finalTopK > MAX_TOP_K) {
    throw new MilvusValidationError(
      `Invalid finalTopK: ${request.finalTopK}. Must be between 1 and ${MAX_TOP_K}`,
      { field: 'finalTopK' }
    );
  }

  // Validate rerank strategy
  if (
    request.rerankStrategy.type === 'weightedSum' &&
    request.rerankStrategy.weights.length !== request.searches.length
  ) {
    throw new MilvusValidationError(
      'Number of weights must match number of searches for weighted sum reranking',
      { field: 'rerankStrategy' }
    );
  }

  // Validate individual searches (skip collection name validation for sub-searches)
  for (let i = 0; i < request.searches.length; i++) {
    const search = request.searches[i];
    if (search) {
      // Set collection name from parent if not set
      if (!search.collectionName) {
        search.collectionName = request.collectionName;
      }
      validateSearchRequest(search);
    }
  }
}

/**
 * Validate query vectors.
 */
export function validateVectors(vectors: number[][]): void {
  if (vectors.length === 0) {
    throw new MilvusValidationError('No vectors provided', { field: 'vectors' });
  }

  const firstVec = vectors[0];
  if (!firstVec) {
    throw new MilvusValidationError('Invalid vector at index 0', {
      field: 'vectors',
    });
  }

  const dimension = firstVec.length;

  if (dimension === 0) {
    throw new MilvusValidationError('Vector dimension cannot be 0', {
      field: 'vectors',
    });
  }

  if (dimension > MAX_DIMENSIONS) {
    throw new MilvusValidationError(
      `Vector dimension ${dimension} exceeds maximum ${MAX_DIMENSIONS}`,
      { field: 'vectors', details: { dimension, max: MAX_DIMENSIONS } }
    );
  }

  for (let i = 0; i < vectors.length; i++) {
    const vec = vectors[i];
    if (!vec) {
      throw new MilvusValidationError(`Invalid vector at index ${i}`, {
        field: 'vectors',
      });
    }

    if (vec.length !== dimension) {
      throw new MilvusValidationError(
        `Dimension mismatch at index ${i}: expected ${dimension}, got ${vec.length}`,
        { field: 'vectors' }
      );
    }

    for (let j = 0; j < vec.length; j++) {
      const val = vec[j];
      if (typeof val !== 'number' || !Number.isFinite(val)) {
        throw new MilvusValidationError(
          `Invalid vector value at [${i}][${j}]`,
          { field: 'vectors' }
        );
      }
    }
  }
}

/**
 * Validate search parameters for an index type.
 */
export function validateSearchParams(
  indexType: IndexType,
  params: Record<string, number | string>
): void {
  switch (indexType) {
    case IndexType.IvfFlat:
    case IndexType.IvfSq8:
    case IndexType.IvfPq: {
      const nprobe = params['nprobe'];
      if (nprobe !== undefined) {
        const nprobeNum = typeof nprobe === 'number' ? nprobe : parseInt(nprobe as string, 10);
        if (nprobeNum < 1 || nprobeNum > 65536) {
          throw new MilvusValidationError(
            `Invalid nprobe: ${nprobe}. Must be between 1 and 65536`,
            { field: 'params.nprobe' }
          );
        }
      }
      break;
    }

    case IndexType.Hnsw: {
      const ef = params['ef'];
      if (ef !== undefined) {
        const efNum = typeof ef === 'number' ? ef : parseInt(ef as string, 10);
        if (efNum < 1 || efNum > 32768) {
          throw new MilvusValidationError(
            `Invalid ef: ${ef}. Must be between 1 and 32768`,
            { field: 'params.ef' }
          );
        }
      }
      break;
    }

    case IndexType.DiskAnn: {
      const searchList = params['search_list'];
      if (searchList !== undefined) {
        const slNum =
          typeof searchList === 'number'
            ? searchList
            : parseInt(searchList as string, 10);
        if (slNum < 1 || slNum > 65535) {
          throw new MilvusValidationError(
            `Invalid search_list: ${searchList}. Must be between 1 and 65535`,
            { field: 'params.search_list' }
          );
        }
      }
      break;
    }

    case IndexType.AutoIndex: {
      const level = params['level'];
      if (level !== undefined) {
        const levelNum =
          typeof level === 'number' ? level : parseInt(level as string, 10);
        if (levelNum < 1 || levelNum > 5) {
          throw new MilvusValidationError(
            `Invalid level: ${level}. Must be between 1 and 5`,
            { field: 'params.level' }
          );
        }
      }
      break;
    }

    case IndexType.Flat:
    default:
      // No params to validate
      break;
  }
}

/**
 * Validate a filter expression (basic validation).
 */
export function validateFilterExpression(expression: string): void {
  const MAX_EXPRESSION_LENGTH = 65_536;

  if (expression.length > MAX_EXPRESSION_LENGTH) {
    throw new MilvusValidationError(
      `Filter expression too long: ${expression.length} > ${MAX_EXPRESSION_LENGTH}`,
      { field: 'filter' }
    );
  }

  // Check for balanced parentheses
  let parenCount = 0;
  let inString = false;
  let stringChar = '';

  for (const char of expression) {
    if (inString) {
      if (char === stringChar) {
        inString = false;
      }
    } else {
      if (char === '"' || char === "'") {
        inString = true;
        stringChar = char;
      } else if (char === '(') {
        parenCount++;
      } else if (char === ')') {
        parenCount--;
        if (parenCount < 0) {
          throw new MilvusValidationError('Unbalanced parentheses in filter', {
            field: 'filter',
          });
        }
      }
    }
  }

  if (inString) {
    throw new MilvusValidationError('Unterminated string in filter', {
      field: 'filter',
    });
  }

  if (parenCount !== 0) {
    throw new MilvusValidationError('Unbalanced parentheses in filter', {
      field: 'filter',
    });
  }

  // Check for potential injection patterns
  const dangerous = ['--', ';', '/*', '*/', 'drop ', 'delete ', 'update ', 'insert '];
  const lowerExpr = expression.toLowerCase();
  for (const pattern of dangerous) {
    if (lowerExpr.includes(pattern)) {
      throw new MilvusValidationError(
        `Potential injection detected in filter: "${pattern}"`,
        { field: 'filter' }
      );
    }
  }
}

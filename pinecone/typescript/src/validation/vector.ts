/**
 * Vector validation module for Pinecone integration.
 *
 * Provides validation for vector operations including ID, values, sparse values,
 * and metadata according to Pinecone's constraints.
 *
 * @module validation/vector
 */

/**
 * Maximum length for vector IDs.
 */
export const MAX_ID_LENGTH = 512;

/**
 * Maximum number of dimensions for a vector.
 */
export const MAX_DIMENSIONS = 20_000;

/**
 * Maximum size for metadata in bytes (40KB).
 */
export const MAX_METADATA_SIZE = 40_960;

/**
 * Validation error thrown when vector validation fails.
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';

    // Maintains proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ValidationError);
    }
  }
}

/**
 * Sparse vector values with indices.
 */
export interface SparseValues {
  /** Array of indices for sparse values */
  indices: number[];
  /** Array of values corresponding to indices */
  values: number[];
}

/**
 * Metadata value types supported by Pinecone.
 */
export type MetadataValue = string | number | boolean | string[];

/**
 * Metadata as a key-value map.
 */
export type Metadata = Record<string, MetadataValue>;

/**
 * Vector representation for Pinecone.
 */
export interface Vector {
  /** Unique identifier for the vector */
  id: string;
  /** Dense vector values */
  values: number[];
  /** Optional sparse vector values */
  sparse_values?: SparseValues;
  /** Optional metadata */
  metadata?: Metadata;
}

/**
 * Validator for Pinecone vectors and related data structures.
 */
export class VectorValidator {
  /**
   * Validates a complete vector object.
   *
   * @param vector - The vector to validate
   * @throws {ValidationError} If validation fails
   */
  static validate(vector: Vector): void {
    if (!vector) {
      throw new ValidationError('Vector is required');
    }

    this.validateId(vector.id);
    this.validateValues(vector.values);

    if (vector.sparse_values !== undefined) {
      this.validateSparseValues(vector.sparse_values);
    }

    if (vector.metadata !== undefined) {
      this.validateMetadata(vector.metadata);
    }
  }

  /**
   * Validates a vector ID.
   *
   * Rules:
   * - Must be non-empty
   * - Maximum 512 characters
   * - ASCII printable characters only (32-126)
   *
   * @param id - The ID to validate
   * @throws {ValidationError} If validation fails
   */
  static validateId(id: string): void {
    if (!id || id.length === 0) {
      throw new ValidationError('Vector ID cannot be empty');
    }

    if (id.length > MAX_ID_LENGTH) {
      throw new ValidationError(
        `Vector ID exceeds maximum length of ${MAX_ID_LENGTH} characters (got ${id.length})`
      );
    }

    // Check for ASCII printable characters only (32-126)
    for (let i = 0; i < id.length; i++) {
      const charCode = id.charCodeAt(i);
      if (charCode < 32 || charCode > 126) {
        throw new ValidationError(
          `Vector ID contains non-ASCII printable character at position ${i} (code: ${charCode})`
        );
      }
    }
  }

  /**
   * Validates vector values (dense vector).
   *
   * Rules:
   * - Must be non-empty
   * - Maximum 20,000 dimensions
   * - No NaN or Infinity values
   *
   * @param values - The vector values to validate
   * @throws {ValidationError} If validation fails
   */
  static validateValues(values: number[]): void {
    if (!values || values.length === 0) {
      throw new ValidationError('Vector values cannot be empty');
    }

    if (values.length > MAX_DIMENSIONS) {
      throw new ValidationError(
        `Vector dimensions exceed maximum of ${MAX_DIMENSIONS} (got ${values.length})`
      );
    }

    for (let i = 0; i < values.length; i++) {
      const value = values[i];

      if (typeof value !== 'number') {
        throw new ValidationError(
          `Vector value at index ${i} is not a number (got ${typeof value})`
        );
      }

      if (isNaN(value)) {
        throw new ValidationError(
          `Vector value at index ${i} is NaN`
        );
      }

      if (!isFinite(value)) {
        throw new ValidationError(
          `Vector value at index ${i} is Infinity or -Infinity`
        );
      }
    }
  }

  /**
   * Validates sparse vector values.
   *
   * Rules:
   * - Indices and values arrays must have the same length
   * - Indices must be sorted in ascending order
   * - Indices must be non-negative
   * - Values must not be NaN or Infinity
   *
   * @param sparse - The sparse values to validate
   * @throws {ValidationError} If validation fails
   */
  static validateSparseValues(sparse: SparseValues): void {
    if (!sparse) {
      throw new ValidationError('Sparse values object is required');
    }

    if (!Array.isArray(sparse.indices)) {
      throw new ValidationError('Sparse indices must be an array');
    }

    if (!Array.isArray(sparse.values)) {
      throw new ValidationError('Sparse values must be an array');
    }

    if (sparse.indices.length !== sparse.values.length) {
      throw new ValidationError(
        `Sparse indices length (${sparse.indices.length}) must equal values length (${sparse.values.length})`
      );
    }

    // Validate indices are sorted and non-negative
    let previousIndex = -1;
    for (let i = 0; i < sparse.indices.length; i++) {
      const index = sparse.indices[i];

      if (typeof index !== 'number' || !Number.isInteger(index)) {
        throw new ValidationError(
          `Sparse index at position ${i} is not an integer (got ${index})`
        );
      }

      if (index < 0) {
        throw new ValidationError(
          `Sparse index at position ${i} is negative (${index})`
        );
      }

      if (index <= previousIndex) {
        throw new ValidationError(
          `Sparse indices must be sorted in ascending order (index ${index} at position ${i} is not greater than previous ${previousIndex})`
        );
      }

      previousIndex = index;
    }

    // Validate values
    for (let i = 0; i < sparse.values.length; i++) {
      const value = sparse.values[i];

      if (typeof value !== 'number') {
        throw new ValidationError(
          `Sparse value at index ${i} is not a number (got ${typeof value})`
        );
      }

      if (isNaN(value)) {
        throw new ValidationError(
          `Sparse value at index ${i} is NaN`
        );
      }

      if (!isFinite(value)) {
        throw new ValidationError(
          `Sparse value at index ${i} is Infinity or -Infinity`
        );
      }
    }
  }

  /**
   * Validates metadata object.
   *
   * Rules:
   * - Serialized size must be less than 40KB
   * - Keys must be non-empty strings
   * - Values must be string, number, boolean, or string array
   *
   * @param metadata - The metadata to validate
   * @throws {ValidationError} If validation fails
   */
  static validateMetadata(metadata: Metadata): void {
    if (!metadata || typeof metadata !== 'object') {
      throw new ValidationError('Metadata must be an object');
    }

    if (Array.isArray(metadata)) {
      throw new ValidationError('Metadata cannot be an array');
    }

    // Validate keys and values
    for (const [key, value] of Object.entries(metadata)) {
      if (!key || key.length === 0) {
        throw new ValidationError('Metadata key cannot be empty');
      }

      this.validateMetadataValue(key, value);
    }

    // Check serialized size
    const serialized = JSON.stringify(metadata);
    const byteSize = new TextEncoder().encode(serialized).length;

    if (byteSize > MAX_METADATA_SIZE) {
      throw new ValidationError(
        `Metadata size exceeds maximum of ${MAX_METADATA_SIZE} bytes (got ${byteSize})`
      );
    }
  }

  /**
   * Validates a single metadata value.
   *
   * @param key - The metadata key (for error messages)
   * @param value - The value to validate
   * @throws {ValidationError} If validation fails
   */
  private static validateMetadataValue(key: string, value: MetadataValue): void {
    const valueType = typeof value;

    if (value === null || value === undefined) {
      throw new ValidationError(
        `Metadata value for key "${key}" cannot be null or undefined`
      );
    }

    if (valueType === 'string' || valueType === 'number' || valueType === 'boolean') {
      return;
    }

    if (Array.isArray(value)) {
      if (value.length === 0) {
        throw new ValidationError(
          `Metadata array for key "${key}" cannot be empty`
        );
      }

      for (let i = 0; i < value.length; i++) {
        if (typeof value[i] !== 'string') {
          throw new ValidationError(
            `Metadata array for key "${key}" must contain only strings (found ${typeof value[i]} at index ${i})`
          );
        }
      }
      return;
    }

    throw new ValidationError(
      `Metadata value for key "${key}" has invalid type (${valueType}). Must be string, number, boolean, or string[]`
    );
  }
}

import { FieldType } from './field.js';

/**
 * Represents a single entity with field values.
 */
export interface Entity {
  /** Field name to value mapping */
  fields: Record<string, FieldValue>;
}

/**
 * Union type for all possible field values.
 */
export type FieldValue =
  | boolean
  | number
  | bigint
  | string
  | number[]
  | bigint[]
  | string[]
  | boolean[]
  | Uint8Array
  | SparseVector
  | Record<string, unknown>;

/**
 * Sparse vector representation as index-value pairs.
 */
export interface SparseVector {
  /** Index positions */
  indices: number[];
  /** Values at those indices */
  values: number[];
}

/**
 * Field data for batch operations.
 */
export interface FieldData {
  /** Field name */
  fieldName: string;
  /** Field data type */
  fieldType: FieldType;
  /** Values for this field (one per entity) */
  values: FieldValue[];
}

/**
 * Helper to create Int64 field data.
 */
export function createInt64Field(name: string, values: bigint[]): FieldData {
  return {
    fieldName: name,
    fieldType: FieldType.Int64,
    values,
  };
}

/**
 * Helper to create String/VarChar field data.
 */
export function createStringField(name: string, values: string[]): FieldData {
  return {
    fieldName: name,
    fieldType: FieldType.VarChar,
    values,
  };
}

/**
 * Helper to create Float field data.
 */
export function createFloatField(name: string, values: number[]): FieldData {
  return {
    fieldName: name,
    fieldType: FieldType.Float,
    values,
  };
}

/**
 * Helper to create FloatVector field data.
 */
export function createFloatVectorField(
  name: string,
  vectors: number[][],
  dimension: number
): FieldData {
  // Flatten vectors for transport
  const flatValues: number[] = [];
  for (const vec of vectors) {
    if (vec.length !== dimension) {
      throw new Error(
        `Vector dimension mismatch: expected ${dimension}, got ${vec.length}`
      );
    }
    flatValues.push(...vec);
  }
  return {
    fieldName: name,
    fieldType: FieldType.FloatVector,
    values: [flatValues], // Stored as single flat array with dimension metadata
  };
}

/**
 * Helper to create JSON field data.
 */
export function createJsonField(
  name: string,
  values: Record<string, unknown>[]
): FieldData {
  return {
    fieldName: name,
    fieldType: FieldType.Json,
    values,
  };
}

/**
 * Helper to create SparseFloatVector field data.
 */
export function createSparseVectorField(
  name: string,
  values: SparseVector[]
): FieldData {
  return {
    fieldName: name,
    fieldType: FieldType.SparseFloatVector,
    values,
  };
}

/**
 * Get the number of rows from field data.
 */
export function getRowCount(fields: FieldData[]): number {
  if (fields.length === 0) return 0;
  const firstField = fields[0];
  if (!firstField) return 0;

  // For vector fields stored as flat arrays, need to calculate
  if (firstField.fieldType === FieldType.FloatVector) {
    // Vector count depends on dimension, handled separately
    return firstField.values.length;
  }

  return firstField.values.length;
}

import { MilvusValidationError } from '../errors/index.js';
import { FieldData } from '../types/entity.js';
import { FieldType, CollectionSchema } from '../types/field.js';
import { InsertRequest, UpsertRequest } from '../types/insert.js';

/**
 * Maximum supported vector dimensions.
 */
export const MAX_DIMENSIONS = 32_768;

/**
 * Maximum VARCHAR length.
 */
export const MAX_VARCHAR_LENGTH = 65_535;

/**
 * Maximum batch size per insert.
 */
export const MAX_BATCH_SIZE = 10_000;

/**
 * Validate an insert request.
 */
export function validateInsertRequest(
  request: InsertRequest | UpsertRequest,
  schema?: CollectionSchema
): void {
  if (!request.collectionName || request.collectionName.trim() === '') {
    throw new MilvusValidationError('Collection name is required', {
      field: 'collectionName',
    });
  }

  if (!request.fields || request.fields.length === 0) {
    throw new MilvusValidationError('At least one field is required', {
      field: 'fields',
    });
  }

  // Validate row count consistency
  const rowCounts = new Set(request.fields.map((f) => getFieldRowCount(f)));
  if (rowCounts.size > 1) {
    throw new MilvusValidationError(
      'All fields must have the same number of rows',
      { details: { rowCounts: Array.from(rowCounts) } }
    );
  }

  const rowCount = rowCounts.values().next().value ?? 0;
  if (rowCount > MAX_BATCH_SIZE) {
    throw new MilvusValidationError(
      `Batch size ${rowCount} exceeds maximum ${MAX_BATCH_SIZE}`,
      { details: { rowCount, maxBatchSize: MAX_BATCH_SIZE } }
    );
  }

  // Validate each field
  for (const field of request.fields) {
    validateField(field, schema);
  }
}

/**
 * Get row count for a field.
 */
function getFieldRowCount(field: FieldData): number {
  // For vector fields stored as flat arrays
  if (
    field.fieldType === FieldType.FloatVector &&
    Array.isArray(field.values) &&
    field.values.length === 1 &&
    Array.isArray(field.values[0])
  ) {
    // Flat vector array - need dimension info
    return 1; // Simplified - real implementation would track dimension
  }
  return field.values.length;
}

/**
 * Validate a single field.
 */
function validateField(field: FieldData, schema?: CollectionSchema): void {
  if (!field.fieldName || field.fieldName.trim() === '') {
    throw new MilvusValidationError('Field name is required', {
      field: 'fieldName',
    });
  }

  // If schema provided, validate against it
  if (schema) {
    const fieldSchema = schema.fields.find((f) => f.name === field.fieldName);
    if (!fieldSchema && !schema.enableDynamicField) {
      throw new MilvusValidationError(`Unknown field: ${field.fieldName}`, {
        field: field.fieldName,
      });
    }

    if (fieldSchema && fieldSchema.dataType !== field.fieldType) {
      throw new MilvusValidationError(
        `Type mismatch for field ${field.fieldName}: expected ${fieldSchema.dataType}, got ${field.fieldType}`,
        {
          field: field.fieldName,
          details: {
            expected: fieldSchema.dataType,
            actual: field.fieldType,
          },
        }
      );
    }
  }

  // Validate vector fields
  if (
    field.fieldType === FieldType.FloatVector ||
    field.fieldType === FieldType.BinaryVector
  ) {
    validateVectorField(field);
  }

  // Validate string fields
  if (
    field.fieldType === FieldType.String ||
    field.fieldType === FieldType.VarChar
  ) {
    validateStringField(field);
  }
}

/**
 * Validate a vector field.
 */
function validateVectorField(field: FieldData): void {
  const values = field.values;
  if (!Array.isArray(values) || values.length === 0) {
    throw new MilvusValidationError(
      `Vector field ${field.fieldName} has no values`,
      { field: field.fieldName }
    );
  }

  // For float vectors, check dimension consistency and validity
  if (field.fieldType === FieldType.FloatVector) {
    // Handle both flat array format and nested array format
    const firstValue = values[0];
    if (Array.isArray(firstValue)) {
      const dimension = firstValue.length;
      if (dimension > MAX_DIMENSIONS) {
        throw new MilvusValidationError(
          `Vector dimension ${dimension} exceeds maximum ${MAX_DIMENSIONS}`,
          {
            field: field.fieldName,
            details: { dimension, maxDimensions: MAX_DIMENSIONS },
          }
        );
      }

      for (let i = 0; i < values.length; i++) {
        const vec = values[i];
        if (!Array.isArray(vec)) {
          throw new MilvusValidationError(
            `Invalid vector at index ${i} in field ${field.fieldName}`,
            { field: field.fieldName }
          );
        }
        if (vec.length !== dimension) {
          throw new MilvusValidationError(
            `Dimension mismatch at index ${i} in field ${field.fieldName}: expected ${dimension}, got ${vec.length}`,
            { field: field.fieldName }
          );
        }

        // Check for NaN/Infinity
        for (let j = 0; j < vec.length; j++) {
          const val = vec[j];
          if (typeof val !== 'number' || !Number.isFinite(val)) {
            throw new MilvusValidationError(
              `Invalid vector value at [${i}][${j}] in field ${field.fieldName}`,
              { field: field.fieldName }
            );
          }
        }
      }
    }
  }
}

/**
 * Validate a string field.
 */
function validateStringField(field: FieldData): void {
  for (let i = 0; i < field.values.length; i++) {
    const value = field.values[i];
    if (typeof value === 'string' && value.length > MAX_VARCHAR_LENGTH) {
      throw new MilvusValidationError(
        `String at index ${i} in field ${field.fieldName} exceeds maximum length ${MAX_VARCHAR_LENGTH}`,
        {
          field: field.fieldName,
          details: { index: i, length: value.length },
        }
      );
    }
  }
}

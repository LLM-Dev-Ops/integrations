/**
 * Object validation utilities
 *
 * Provides validation for objects, vectors, and properties against schema definitions.
 */

import type { WeaviateObject, Properties, Vector } from '../types/index.js';
import type { ClassDefinition, PropertyDefinition } from '../types/schema.js';
import { InvalidVectorError, InvalidObjectError } from '../errors/index.js';
import type { ValidationError, ObjectValidationResult } from './types.js';
import { isValidVector, isValidVectorDimensions } from '../types/vector.js';

// ============================================================================
// Object Validation
// ============================================================================

/**
 * Validate a complete object against its schema
 *
 * @param object - Object to validate
 * @param schema - Class definition from schema
 * @returns Validation result
 */
export function validateObject(
  object: Partial<WeaviateObject>,
  schema: ClassDefinition
): ObjectValidationResult {
  const errors: ValidationError[] = [];

  // Validate properties
  if (object.properties) {
    const propertyErrors = validateProperties(object.properties, schema);
    errors.push(...propertyErrors);
  }

  // Validate vector if present
  if (object.vector) {
    try {
      validateVector(object.vector, schema);
    } catch (error) {
      if (error instanceof InvalidVectorError) {
        errors.push({
          property: 'vector',
          message: error.message,
          code: 'INVALID_VECTOR',
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate properties against schema
 *
 * @param properties - Properties to validate
 * @param schema - Class definition
 * @returns Array of validation errors
 */
export function validateProperties(
  properties: Properties,
  schema: ClassDefinition
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Create a map of property definitions for quick lookup
  const propertyMap = new Map<string, PropertyDefinition>();
  for (const prop of schema.properties) {
    propertyMap.set(prop.name, prop);
  }

  // Validate each property
  for (const [propName, propValue] of Object.entries(properties)) {
    const propDef = propertyMap.get(propName);

    // Check if property exists in schema
    if (!propDef) {
      errors.push({
        property: propName,
        message: `Property '${propName}' not found in schema`,
        code: 'PROPERTY_NOT_FOUND',
      });
      continue;
    }

    // Validate property value type
    const typeError = validatePropertyType(propName, propValue, propDef);
    if (typeError) {
      errors.push(typeError);
    }
  }

  return errors;
}

/**
 * Validate a property value against its definition
 *
 * @param propName - Property name
 * @param value - Property value
 * @param definition - Property definition
 * @returns Validation error if invalid, undefined otherwise
 */
function validatePropertyType(
  propName: string,
  value: unknown,
  definition: PropertyDefinition
): ValidationError | undefined {
  if (value === null || value === undefined) {
    // Null values are allowed
    return undefined;
  }

  const dataType = definition.dataType[0]; // Use first data type

  // Text validation
  if (dataType === 'text' || dataType === 'string') {
    if (typeof value !== 'string') {
      return {
        property: propName,
        message: `Property '${propName}' must be a string`,
        code: 'INVALID_TYPE',
      };
    }
  }

  // Text array validation
  if (dataType === 'text[]' || dataType === 'string[]') {
    if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) {
      return {
        property: propName,
        message: `Property '${propName}' must be a string array`,
        code: 'INVALID_TYPE',
      };
    }
  }

  // Number validation
  if (dataType === 'number' || dataType === 'int') {
    if (typeof value !== 'number' || !isFinite(value)) {
      return {
        property: propName,
        message: `Property '${propName}' must be a number`,
        code: 'INVALID_TYPE',
      };
    }
  }

  // Number array validation
  if (dataType === 'number[]' || dataType === 'int[]') {
    if (
      !Array.isArray(value) ||
      !value.every((v) => typeof v === 'number' && isFinite(v))
    ) {
      return {
        property: propName,
        message: `Property '${propName}' must be a number array`,
        code: 'INVALID_TYPE',
      };
    }
  }

  // Boolean validation
  if (dataType === 'boolean') {
    if (typeof value !== 'boolean') {
      return {
        property: propName,
        message: `Property '${propName}' must be a boolean`,
        code: 'INVALID_TYPE',
      };
    }
  }

  // Boolean array validation
  if (dataType === 'boolean[]') {
    if (!Array.isArray(value) || !value.every((v) => typeof v === 'boolean')) {
      return {
        property: propName,
        message: `Property '${propName}' must be a boolean array`,
        code: 'INVALID_TYPE',
      };
    }
  }

  // Date validation
  if (dataType === 'date') {
    if (!(value instanceof Date) && typeof value !== 'string') {
      return {
        property: propName,
        message: `Property '${propName}' must be a Date or ISO 8601 string`,
        code: 'INVALID_TYPE',
      };
    }
  }

  // Date array validation
  if (dataType === 'date[]') {
    if (
      !Array.isArray(value) ||
      !value.every((v) => v instanceof Date || typeof v === 'string')
    ) {
      return {
        property: propName,
        message: `Property '${propName}' must be a Date array`,
        code: 'INVALID_TYPE',
      };
    }
  }

  // UUID validation
  if (dataType === 'uuid') {
    if (typeof value !== 'string') {
      return {
        property: propName,
        message: `Property '${propName}' must be a UUID string`,
        code: 'INVALID_TYPE',
      };
    }
  }

  // GeoCoordinates validation
  if (dataType === 'geoCoordinates') {
    if (
      typeof value !== 'object' ||
      value === null ||
      !('latitude' in value) ||
      !('longitude' in value)
    ) {
      return {
        property: propName,
        message: `Property '${propName}' must be a GeoCoordinates object`,
        code: 'INVALID_TYPE',
      };
    }
  }

  // PhoneNumber validation
  if (dataType === 'phoneNumber') {
    if (
      typeof value !== 'object' ||
      value === null ||
      !('input' in value) ||
      !('international' in value)
    ) {
      return {
        property: propName,
        message: `Property '${propName}' must be a PhoneNumber object`,
        code: 'INVALID_TYPE',
      };
    }
  }

  // Blob validation
  if (dataType === 'blob') {
    if (!(value instanceof Uint8Array) && typeof value !== 'string') {
      return {
        property: propName,
        message: `Property '${propName}' must be a Uint8Array or base64 string`,
        code: 'INVALID_TYPE',
      };
    }
  }

  // Reference validation (class name as data type)
  if (dataType[0] === dataType[0].toUpperCase() && !dataType.includes('[')) {
    if (!Array.isArray(value)) {
      return {
        property: propName,
        message: `Property '${propName}' must be an array of references`,
        code: 'INVALID_TYPE',
      };
    }
  }

  return undefined;
}

// ============================================================================
// Vector Validation
// ============================================================================

/**
 * Validate a vector against schema requirements
 *
 * @param vector - Vector to validate
 * @param schema - Class definition
 * @throws InvalidVectorError if vector is invalid
 */
export function validateVector(vector: Vector, schema: ClassDefinition): void {
  // Basic vector validation
  if (!isValidVector(vector)) {
    throw new InvalidVectorError(
      'Vector contains invalid values (must be finite numbers)'
    );
  }

  // Get expected dimensions from schema
  const expectedDimensions = getVectorDimension(schema);

  // If dimensions are defined in schema, validate
  if (expectedDimensions > 0) {
    if (!isValidVectorDimensions(vector, expectedDimensions)) {
      throw new InvalidVectorError(
        `Vector dimension mismatch: expected ${expectedDimensions}, got ${vector.length}`
      );
    }
  }
}

/**
 * Get the expected vector dimension from schema
 *
 * @param schema - Class definition
 * @returns Expected vector dimension, or 0 if not defined
 */
export function getVectorDimension(schema: ClassDefinition): number {
  // Check if vectorIndexConfig has dimension info
  // Note: Weaviate doesn't always expose dimensions in schema,
  // so we return 0 if not available
  const vectorConfig = schema.vectorIndexConfig;
  if (!vectorConfig) {
    return 0;
  }

  // Some vector configs might have dimension info in moduleConfig
  const moduleConfig = schema.moduleConfig;
  if (moduleConfig) {
    // Check for dimension in various vectorizer configs
    const vectorizerConfig = Object.values(moduleConfig).find(
      (config) =>
        typeof config === 'object' &&
        config !== null &&
        'dimensions' in config
    );

    if (vectorizerConfig && typeof vectorizerConfig === 'object') {
      const dimensions = (vectorizerConfig as { dimensions?: number }).dimensions;
      if (typeof dimensions === 'number') {
        return dimensions;
      }
    }
  }

  return 0;
}

/**
 * Validate that required properties are present
 *
 * @param properties - Properties to check
 * @param schema - Class definition
 * @returns Array of missing required properties
 */
export function validateRequiredProperties(
  properties: Properties,
  schema: ClassDefinition
): string[] {
  const missing: string[] = [];

  // Note: Weaviate doesn't have a built-in "required" concept,
  // but we can check for properties that are commonly expected
  // This is a placeholder for future enhancements

  return missing;
}

/**
 * Check if a property is indexed for filtering
 *
 * @param propertyName - Property name
 * @param schema - Class definition
 * @returns True if property is filterable
 */
export function isPropertyFilterable(
  propertyName: string,
  schema: ClassDefinition
): boolean {
  const property = schema.properties.find((p) => p.name === propertyName);
  if (!property) {
    return false;
  }

  // Check new indexFilterable flag
  if (property.indexFilterable !== undefined) {
    return property.indexFilterable;
  }

  // Fallback to deprecated indexInverted
  if (property.indexInverted !== undefined) {
    return property.indexInverted;
  }

  // Default to true if not specified
  return true;
}

/**
 * Check if a property is searchable (BM25)
 *
 * @param propertyName - Property name
 * @param schema - Class definition
 * @returns True if property is searchable
 */
export function isPropertySearchable(
  propertyName: string,
  schema: ClassDefinition
): boolean {
  const property = schema.properties.find((p) => p.name === propertyName);
  if (!property) {
    return false;
  }

  // Check indexSearchable flag
  if (property.indexSearchable !== undefined) {
    return property.indexSearchable;
  }

  // Default to false if not specified
  return false;
}

/**
 * Filter validation
 *
 * Provides functions to validate filters against a schema,
 * ensuring that filters reference valid properties and use
 * compatible operators.
 */

import type { WhereFilter, FilterOperand } from './types.js';
import { isOperandFilter, isAndFilter } from './types.js';
import type { ClassDefinition, PropertyDefinition } from '../types/schema.js';
import { isOperatorCompatible } from './operators.js';

/**
 * Maximum allowed filter depth per SPARC specification
 * Weaviate limits filter nesting to prevent complex query execution
 */
export const MAX_FILTER_DEPTH = 10;

/**
 * Validation error
 */
export interface ValidationError {
  /**
   * Error message
   */
  message: string;

  /**
   * Property path that caused the error
   */
  path?: string[];

  /**
   * Error type
   */
  type:
    | 'property_not_found'
    | 'property_not_filterable'
    | 'incompatible_operator'
    | 'invalid_value'
    | 'invalid_path'
    | 'max_depth_exceeded'
    | 'invalid_cross_reference';
}

/**
 * Validation result
 */
export interface FilterValidationResult {
  /**
   * Whether the filter is valid
   */
  valid: boolean;

  /**
   * Array of validation errors
   */
  errors: ValidationError[];
}

/**
 * Schema cache interface for cross-reference validation
 */
export interface SchemaResolver {
  /**
   * Get class definition by name
   */
  getClass(className: string): ClassDefinition | undefined;
}

/**
 * Validate a filter against a schema
 *
 * @param filter - The filter to validate
 * @param schema - The class schema to validate against
 * @param schemaResolver - Optional resolver for cross-reference validation
 * @returns Validation result
 */
export function validateFilter(
  filter: WhereFilter,
  schema: ClassDefinition,
  schemaResolver?: SchemaResolver
): FilterValidationResult {
  const errors: ValidationError[] = [];

  // Validate filter depth
  const depth = calculateFilterDepth(filter);
  if (depth > MAX_FILTER_DEPTH) {
    errors.push({
      type: 'max_depth_exceeded',
      message: `Filter depth (${depth}) exceeds maximum allowed (${MAX_FILTER_DEPTH})`,
    });
  }

  collectValidationErrors(filter, schema, errors, schemaResolver);

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Calculate the depth of a filter tree
 *
 * @param filter - The filter to measure
 * @returns Maximum depth of the filter tree
 */
export function calculateFilterDepth(filter: WhereFilter): number {
  if (isOperandFilter(filter)) {
    return 1;
  }

  if (isAndFilter(filter) || filter.operator === 'Or') {
    if (!filter.operands || filter.operands.length === 0) {
      return 1;
    }
    const maxChildDepth = Math.max(
      ...filter.operands.map((op) => calculateFilterDepth(op))
    );
    return 1 + maxChildDepth;
  }

  return 1;
}

/**
 * Recursively collect validation errors from a filter
 *
 * @param filter - The filter to validate
 * @param schema - The class schema
 * @param errors - Array to collect errors
 * @param schemaResolver - Optional resolver for cross-reference validation
 */
function collectValidationErrors(
  filter: WhereFilter,
  schema: ClassDefinition,
  errors: ValidationError[],
  schemaResolver?: SchemaResolver
): void {
  if (isOperandFilter(filter)) {
    const operandErrors = validateOperand(filter.operand, schema, schemaResolver);
    errors.push(...operandErrors);
    return;
  }

  if (isAndFilter(filter)) {
    for (const operand of filter.operands) {
      collectValidationErrors(operand, schema, errors, schemaResolver);
    }
    return;
  }

  // OrFilter
  for (const operand of filter.operands) {
    collectValidationErrors(operand, schema, errors, schemaResolver);
  }
}

/**
 * Validate a filter operand
 *
 * @param operand - The operand to validate
 * @param schema - The class schema
 * @param schemaResolver - Optional resolver for cross-reference validation
 * @returns Array of validation errors
 */
export function validateOperand(
  operand: FilterOperand,
  schema: ClassDefinition,
  schemaResolver?: SchemaResolver
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Validate property path
  const pathErrors = validatePropertyPath(operand.path, schema, schemaResolver);
  if (pathErrors.length > 0) {
    errors.push(...pathErrors);
    return errors; // Can't validate further if path is invalid
  }

  // Get the property definition (may be in referenced class for multi-level paths)
  const property = findPropertyWithCrossRef(operand.path, schema, schemaResolver);
  if (!property) {
    // This shouldn't happen if validatePropertyPath passed, but check anyway
    errors.push({
      type: 'property_not_found',
      message: `Property not found: ${operand.path.join('.')}`,
      path: operand.path,
    });
    return errors;
  }

  // Check if property is filterable
  if (!isPropertyFilterable(property)) {
    errors.push({
      type: 'property_not_filterable',
      message: `Property is not filterable: ${operand.path.join('.')}. Set indexFilterable: true in the schema.`,
      path: operand.path,
    });
  }

  // Check operator compatibility
  const dataType = property.dataType[0] ?? ''; // Use first data type
  if (dataType && !isOperatorCompatible(operand.operator, dataType)) {
    errors.push({
      type: 'incompatible_operator',
      message: `Operator ${operand.operator} is not compatible with type ${dataType}`,
      path: operand.path,
    });
  }

  // Validate value type matches
  const valueErrors = validateValue(operand, property);
  errors.push(...valueErrors);

  return errors;
}

/**
 * Validate a property path
 *
 * @param path - Property path to validate
 * @param schema - The class schema
 * @param schemaResolver - Optional resolver for cross-reference validation
 * @returns Array of validation errors
 */
export function validatePropertyPath(
  path: string[],
  schema: ClassDefinition,
  schemaResolver?: SchemaResolver
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (path.length === 0) {
    errors.push({
      type: 'invalid_path',
      message: 'Property path cannot be empty',
      path,
    });
    return errors;
  }

  // Validate single-level paths
  if (path.length === 1) {
    const propertyName = path[0];
    const property = schema.properties.find((p) => p.name === propertyName);

    if (!property) {
      errors.push({
        type: 'property_not_found',
        message: `Property not found in schema: ${propertyName}`,
        path,
      });
    }
    return errors;
  }

  // Validate multi-level paths (cross-references)
  // Path format: [referenceProperty, referencedClass, targetProperty]
  // e.g., ["author", "Author", "name"] to filter Article.author -> Author.name
  const crossRefErrors = validateCrossReferencePath(path, schema, schemaResolver);
  errors.push(...crossRefErrors);

  return errors;
}

/**
 * Validate a cross-reference property path
 *
 * @param path - Property path to validate (e.g., ["author", "Author", "name"])
 * @param schema - The source class schema
 * @param schemaResolver - Optional resolver for referenced class schema
 * @returns Array of validation errors
 */
function validateCrossReferencePath(
  path: string[],
  schema: ClassDefinition,
  schemaResolver?: SchemaResolver
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (path.length < 2) {
    return errors;
  }

  // First segment is the reference property on the source class
  const referencePropertyName = path[0];
  const referenceProperty = schema.properties.find(
    (p) => p.name === referencePropertyName
  );

  if (!referenceProperty) {
    errors.push({
      type: 'property_not_found',
      message: `Reference property not found in schema: ${referencePropertyName}`,
      path,
    });
    return errors;
  }

  // Check that the property is a reference type (dataType is a class name)
  const refDataType = referenceProperty.dataType[0] ?? '';
  const firstChar = refDataType.charAt(0);
  const isReference =
    refDataType.length > 0 &&
    firstChar === firstChar.toUpperCase() &&
    !refDataType.includes('[');

  if (!isReference) {
    errors.push({
      type: 'invalid_cross_reference',
      message: `Property '${referencePropertyName}' is not a cross-reference type`,
      path,
    });
    return errors;
  }

  // Second segment should be the referenced class name
  const referencedClassName = path[1];

  // Verify the class name matches the reference type
  if (refDataType !== referencedClassName) {
    errors.push({
      type: 'invalid_cross_reference',
      message: `Reference class mismatch: property references '${refDataType}' but path specifies '${referencedClassName}'`,
      path,
    });
    return errors;
  }

  // If we have a schema resolver, validate the remaining path in the referenced class
  if (schemaResolver && path.length > 2) {
    const referencedSchema = schemaResolver.getClass(referencedClassName);

    if (!referencedSchema) {
      errors.push({
        type: 'invalid_cross_reference',
        message: `Referenced class '${referencedClassName}' not found in schema`,
        path,
      });
      return errors;
    }

    // Validate the remaining path segments in the referenced class
    const remainingPath = path.slice(2);
    const remainingErrors = validatePropertyPath(
      remainingPath,
      referencedSchema,
      schemaResolver
    );

    // Adjust error paths to include full path
    for (const error of remainingErrors) {
      error.path = path;
    }
    errors.push(...remainingErrors);
  }

  return errors;
}

/**
 * Find a property definition by path with cross-reference support
 *
 * @param path - Property path
 * @param schema - The class schema
 * @param schemaResolver - Optional resolver for cross-reference validation
 * @returns Property definition or undefined
 */
function findPropertyWithCrossRef(
  path: string[],
  schema: ClassDefinition,
  schemaResolver?: SchemaResolver
): PropertyDefinition | undefined {
  if (path.length === 0) {
    return undefined;
  }

  // For single-level paths, find directly
  if (path.length === 1) {
    return schema.properties.find((p) => p.name === path[0]);
  }

  // For multi-level paths (cross-references), follow the reference chain
  // Path format: [referenceProperty, referencedClass, targetProperty, ...]
  if (path.length >= 3 && schemaResolver) {
    const referencedClassName = path[1] ?? '';
    const referencedSchema = schemaResolver.getClass(referencedClassName);

    if (referencedSchema) {
      // Find the target property in the referenced class
      const remainingPath = path.slice(2);
      return findPropertyWithCrossRef(remainingPath, referencedSchema, schemaResolver);
    }
  }

  // Fallback: return the first property in the path
  return schema.properties.find((p) => p.name === path[0]);
}

/**
 * Check if a property is filterable
 *
 * @param property - Property definition
 * @returns True if the property can be used in filters
 */
export function isPropertyFilterable(property: PropertyDefinition): boolean {
  // Check modern flag
  if (property.indexFilterable !== undefined) {
    return property.indexFilterable;
  }

  // Fall back to deprecated flag
  if (property.indexInverted !== undefined) {
    return property.indexInverted;
  }

  // Default to true for backward compatibility
  return true;
}

/**
 * Validate filter value against property type
 *
 * @param operand - Filter operand
 * @param property - Property definition
 * @returns Array of validation errors
 */
function validateValue(
  operand: FilterOperand,
  property: PropertyDefinition
): ValidationError[] {
  const errors: ValidationError[] = [];
  const value = operand.value;
  const firstDataType = property.dataType[0];
  const dataType = firstDataType ? firstDataType.toLowerCase() : '';

  // Null is always valid for IsNull operator
  if (value === null) {
    return errors;
  }

  // Check array operators
  if (operand.operator === 'ContainsAny' || operand.operator === 'ContainsAll') {
    if (!Array.isArray(value)) {
      errors.push({
        type: 'invalid_value',
        message: `${operand.operator} requires an array value`,
        path: operand.path,
      });
    }
    return errors;
  }

  // Check geo range
  if (operand.operator === 'WithinGeoRange') {
    if (
      typeof value !== 'object' ||
      value === null ||
      !('latitude' in value) ||
      !('longitude' in value) ||
      !('distanceKm' in value)
    ) {
      errors.push({
        type: 'invalid_value',
        message: 'WithinGeoRange requires a GeoRange object',
        path: operand.path,
      });
    }
    return errors;
  }

  // Type-specific validation
  if (dataType.includes('int')) {
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      errors.push({
        type: 'invalid_value',
        message: `Expected integer value for ${dataType} property`,
        path: operand.path,
      });
    }
  } else if (dataType.includes('number')) {
    if (typeof value !== 'number') {
      errors.push({
        type: 'invalid_value',
        message: `Expected number value for ${dataType} property`,
        path: operand.path,
      });
    }
  } else if (dataType.includes('boolean')) {
    if (typeof value !== 'boolean') {
      errors.push({
        type: 'invalid_value',
        message: `Expected boolean value for ${dataType} property`,
        path: operand.path,
      });
    }
  } else if (dataType.includes('text')) {
    if (typeof value !== 'string') {
      errors.push({
        type: 'invalid_value',
        message: `Expected string value for ${dataType} property`,
        path: operand.path,
      });
    }
  } else if (dataType.includes('date')) {
    if (!(value instanceof Date) && typeof value !== 'string') {
      errors.push({
        type: 'invalid_value',
        message: `Expected Date or ISO string for ${dataType} property`,
        path: operand.path,
      });
    }
  }

  return errors;
}

/**
 * Get a user-friendly validation summary
 *
 * @param result - Validation result
 * @returns Summary string
 */
export function getValidationSummary(result: FilterValidationResult): string {
  if (result.valid) {
    return 'Filter is valid';
  }

  const messages = result.errors.map((err) => {
    const pathStr = err.path ? ` at ${err.path.join('.')}` : '';
    return `- ${err.message}${pathStr}`;
  });

  return `Filter validation failed:\n${messages.join('\n')}`;
}

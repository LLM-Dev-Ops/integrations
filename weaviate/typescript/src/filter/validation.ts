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
    | 'invalid_path';
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
 * Validate a filter against a schema
 *
 * @param filter - The filter to validate
 * @param schema - The class schema to validate against
 * @returns Validation result
 */
export function validateFilter(
  filter: WhereFilter,
  schema: ClassDefinition
): FilterValidationResult {
  const errors: ValidationError[] = [];

  collectValidationErrors(filter, schema, errors);

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Recursively collect validation errors from a filter
 *
 * @param filter - The filter to validate
 * @param schema - The class schema
 * @param errors - Array to collect errors
 */
function collectValidationErrors(
  filter: WhereFilter,
  schema: ClassDefinition,
  errors: ValidationError[]
): void {
  if (isOperandFilter(filter)) {
    const operandErrors = validateOperand(filter.operand, schema);
    errors.push(...operandErrors);
    return;
  }

  if (isAndFilter(filter)) {
    for (const operand of filter.operands) {
      collectValidationErrors(operand, schema, errors);
    }
    return;
  }

  // OrFilter
  for (const operand of filter.operands) {
    collectValidationErrors(operand, schema, errors);
  }
}

/**
 * Validate a filter operand
 *
 * @param operand - The operand to validate
 * @param schema - The class schema
 * @returns Array of validation errors
 */
export function validateOperand(
  operand: FilterOperand,
  schema: ClassDefinition
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Validate property path
  const pathErrors = validatePropertyPath(operand.path, schema);
  if (pathErrors.length > 0) {
    errors.push(...pathErrors);
    return errors; // Can't validate further if path is invalid
  }

  // Get the property definition
  const property = findProperty(operand.path, schema);
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
  const dataType = property.dataType[0]; // Use first data type
  if (!isOperatorCompatible(operand.operator, dataType)) {
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
 * @returns Array of validation errors
 */
export function validatePropertyPath(
  path: string[],
  schema: ClassDefinition
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

  // For now, we only support single-level paths
  // Multi-level paths (cross-references) require additional schema lookups
  if (path.length > 1) {
    // TODO: Implement cross-reference path validation
    // This would require fetching the referenced class schema
    return errors; // Skip validation for now
  }

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

/**
 * Find a property definition by path
 *
 * @param path - Property path
 * @param schema - The class schema
 * @returns Property definition or undefined
 */
function findProperty(
  path: string[],
  schema: ClassDefinition
): PropertyDefinition | undefined {
  if (path.length === 0) {
    return undefined;
  }

  // For single-level paths, find directly
  if (path.length === 1) {
    return schema.properties.find((p) => p.name === path[0]);
  }

  // For multi-level paths, would need to follow references
  // This is more complex and requires schema lookup for referenced classes
  // For now, return the first property
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
  const dataType = property.dataType[0].toLowerCase();

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

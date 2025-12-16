/**
 * Reference Validation
 *
 * Utilities for validating references, checking cross-reference compatibility,
 * detecting circular references, and enforcing reference depth limits.
 *
 * @module @llmdevops/weaviate-integration/reference/validation
 */

import type { ClassDefinition, Schema } from '../types/schema.js';
import type { Reference } from '../types/reference.js';
import type { UUID } from '../types/property.js';
import type { ValidationError, ExtendedValidationResult } from './types.js';
import { isReferenceProperty } from '../types/schema.js';

/**
 * Default maximum reference depth
 */
const DEFAULT_MAX_DEPTH = 3;

// ============================================================================
// Property Validation
// ============================================================================

/**
 * Validate that a property exists and is a reference type
 *
 * @param schema - The class definition
 * @param property - The property name
 * @returns True if the property exists and is a reference type
 *
 * @example
 * ```typescript
 * const classDef = await getClass("Article");
 * const isValid = validateReferenceProperty(classDef, "authors");
 * ```
 */
export function validateReferenceProperty(
  schema: ClassDefinition,
  property: string
): boolean {
  const prop = schema.properties.find((p) => p.name === property);

  if (!prop) {
    return false;
  }

  return isReferenceProperty(prop);
}

/**
 * Get expected target classes for a reference property
 *
 * @param schema - The class definition
 * @param property - The property name
 * @returns Array of expected class names, or null if not a reference property
 */
export function getExpectedReferenceClasses(
  schema: ClassDefinition,
  property: string
): string[] | null {
  const prop = schema.properties.find((p) => p.name === property);

  if (!prop || !isReferenceProperty(prop)) {
    return null;
  }

  // Reference properties have class names as data types
  // Filter out array notation and primitive types
  return prop.dataType.filter(
    (type) =>
      type[0] === type[0].toUpperCase() && !type.includes('[') && !type.includes('[]')
  );
}

// ============================================================================
// Cross-Reference Validation
// ============================================================================

/**
 * Validation result for cross-references
 */
export interface ValidationResult {
  /**
   * Whether the reference is valid
   */
  valid: boolean;

  /**
   * Error message if invalid
   */
  error?: string;

  /**
   * Expected target classes
   */
  expectedClasses?: string[];

  /**
   * Actual target class
   */
  actualClass?: string;
}

/**
 * Validate a cross-reference between classes
 *
 * Checks if the reference property on the source class accepts
 * references to the target class.
 *
 * @param schema - Complete schema
 * @param fromClass - Source class name
 * @param property - Reference property name
 * @param toClass - Target class name
 * @returns Validation result
 *
 * @example
 * ```typescript
 * const result = validateCrossReference(
 *   schema,
 *   "Article",
 *   "authors",
 *   "Author"
 * );
 *
 * if (!result.valid) {
 *   console.error(result.error);
 * }
 * ```
 */
export function validateCrossReference(
  schema: Schema,
  fromClass: string,
  property: string,
  toClass: string
): ValidationResult {
  // Find source class
  const sourceClass = schema.classes.find((c) => c.name === fromClass);
  if (!sourceClass) {
    return {
      valid: false,
      error: `Source class "${fromClass}" not found in schema`,
    };
  }

  // Find property
  const prop = sourceClass.properties.find((p) => p.name === property);
  if (!prop) {
    return {
      valid: false,
      error: `Property "${property}" not found in class "${fromClass}"`,
    };
  }

  // Check if property is a reference type
  if (!isReferenceProperty(prop)) {
    return {
      valid: false,
      error: `Property "${property}" is not a reference type`,
    };
  }

  // Get expected classes
  const expectedClasses = prop.dataType.filter(
    (type) =>
      type[0] === type[0].toUpperCase() && !type.includes('[') && !type.includes('[]')
  );

  // Check if target class is in expected classes
  if (!expectedClasses.includes(toClass)) {
    return {
      valid: false,
      error: `Property "${property}" does not accept references to "${toClass}". Expected: ${expectedClasses.join(', ')}`,
      expectedClasses,
      actualClass: toClass,
    };
  }

  // Verify target class exists
  const targetClass = schema.classes.find((c) => c.name === toClass);
  if (!targetClass) {
    return {
      valid: false,
      error: `Target class "${toClass}" not found in schema`,
      expectedClasses,
      actualClass: toClass,
    };
  }

  return {
    valid: true,
    expectedClasses,
    actualClass: toClass,
  };
}

// ============================================================================
// Circular Reference Detection
// ============================================================================

/**
 * Check if adding a reference would create a circular dependency
 *
 * This is a simple implementation that checks for direct cycles.
 * A more sophisticated implementation would traverse the reference graph.
 *
 * @param references - Array of existing/new references
 * @param fromClass - Source class name
 * @param fromId - Source object ID
 * @returns True if a circular reference is detected
 *
 * @example
 * ```typescript
 * const refs = [
 *   { className: "Author", id: "author-1", beacon: "..." },
 *   { className: "Article", id: "article-1", beacon: "..." }
 * ];
 *
 * const hasCircular = checkCircularReference(refs, "Article", "article-1");
 * ```
 */
export function checkCircularReference(
  references: Reference[],
  fromClass: string,
  fromId: UUID
): boolean {
  // Check for direct self-reference
  return references.some(
    (ref) => ref.className === fromClass && ref.id === fromId
  );
}

/**
 * Detect circular references in a reference chain
 *
 * This function performs a more thorough check by building a reference graph
 * and detecting cycles using visited tracking.
 *
 * @param referenceMap - Map of object IDs to their references
 * @param fromId - Starting object ID
 * @param visited - Set of visited IDs (used internally)
 * @returns True if a cycle is detected
 */
export function detectCircularReferenceChain(
  referenceMap: Map<UUID, Reference[]>,
  fromId: UUID,
  visited: Set<UUID> = new Set()
): boolean {
  // If we've seen this ID before, we have a cycle
  if (visited.has(fromId)) {
    return true;
  }

  // Mark as visited
  visited.add(fromId);

  // Get references from this object
  const refs = referenceMap.get(fromId);
  if (!refs || refs.length === 0) {
    return false;
  }

  // Check each reference
  for (const ref of refs) {
    if (detectCircularReferenceChain(referenceMap, ref.id, new Set(visited))) {
      return true;
    }
  }

  return false;
}

// ============================================================================
// Reference Depth Validation
// ============================================================================

/**
 * Validate that reference depth doesn't exceed maximum
 *
 * @param depth - Current reference depth
 * @param maxDepth - Maximum allowed depth (default: 3)
 * @returns True if depth is within limits
 *
 * @example
 * ```typescript
 * if (!validateReferenceDepth(currentDepth, 5)) {
 *   throw new Error("Reference depth exceeded");
 * }
 * ```
 */
export function validateReferenceDepth(
  depth: number,
  maxDepth: number = DEFAULT_MAX_DEPTH
): boolean {
  return depth >= 0 && depth <= maxDepth;
}

/**
 * Calculate reference depth from a reference chain
 *
 * @param referenceChain - Array of references in order of traversal
 * @returns Reference depth
 */
export function calculateReferenceDepth(referenceChain: Reference[]): number {
  return referenceChain.length;
}

// ============================================================================
// Comprehensive Validation
// ============================================================================

/**
 * Perform comprehensive reference validation
 *
 * Combines all validation checks into a single function.
 *
 * @param options - Validation options
 * @returns Extended validation result
 */
export function validateReference(options: {
  schema?: Schema;
  fromClass?: string;
  property?: string;
  toClass?: string;
  toId?: UUID;
  existingReferences?: Reference[];
  referenceChain?: Reference[];
  maxDepth?: number;
}): ExtendedValidationResult {
  const errors: ValidationError[] = [];
  const result: ExtendedValidationResult = {
    valid: true,
    errors,
  };

  // Validate property if schema provided
  if (options.schema && options.fromClass && options.property) {
    const sourceClass = options.schema.classes.find(
      (c) => c.name === options.fromClass
    );

    if (!sourceClass) {
      errors.push({
        code: 'CLASS_NOT_FOUND',
        message: `Source class "${options.fromClass}" not found`,
      });
      result.propertyExists = false;
    } else {
      const isValid = validateReferenceProperty(sourceClass, options.property);
      result.propertyExists = isValid;
      result.isReferenceProperty = isValid;

      if (!isValid) {
        const prop = sourceClass.properties.find(
          (p) => p.name === options.property
        );
        if (!prop) {
          errors.push({
            code: 'PROPERTY_NOT_FOUND',
            message: `Property "${options.property}" not found`,
            path: options.property,
          });
        } else {
          errors.push({
            code: 'NOT_REFERENCE_PROPERTY',
            message: `Property "${options.property}" is not a reference type`,
            path: options.property,
          });
        }
      }

      // Get expected classes
      if (isValid) {
        result.expectedClasses = getExpectedReferenceClasses(
          sourceClass,
          options.property
        ) ?? undefined;
      }
    }
  }

  // Validate cross-reference
  if (
    options.schema &&
    options.fromClass &&
    options.property &&
    options.toClass
  ) {
    const crossRefResult = validateCrossReference(
      options.schema,
      options.fromClass,
      options.property,
      options.toClass
    );

    if (!crossRefResult.valid) {
      errors.push({
        code: 'INVALID_CROSS_REFERENCE',
        message: crossRefResult.error ?? 'Invalid cross-reference',
        path: options.property,
      });
      result.expectedClasses = crossRefResult.expectedClasses;
    }
  }

  // Check for circular references
  if (
    options.existingReferences &&
    options.fromClass &&
    options.toId
  ) {
    const hasCircular = checkCircularReference(
      options.existingReferences,
      options.fromClass,
      options.toId
    );

    result.circularReference = hasCircular;

    if (hasCircular) {
      errors.push({
        code: 'CIRCULAR_REFERENCE',
        message: 'Circular reference detected',
      });
    }
  }

  // Validate reference depth
  if (options.referenceChain) {
    const depth = calculateReferenceDepth(options.referenceChain);
    result.depth = depth;

    const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
    if (!validateReferenceDepth(depth, maxDepth)) {
      errors.push({
        code: 'DEPTH_EXCEEDED',
        message: `Reference depth ${depth} exceeds maximum ${maxDepth}`,
      });
    }
  }

  result.valid = errors.length === 0;
  return result;
}

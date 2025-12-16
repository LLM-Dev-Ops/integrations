/**
 * Filter optimization
 *
 * Provides functions to optimize filters for better query performance.
 * Optimizations include:
 * - Flattening nested filters
 * - Reordering filters by selectivity
 * - Removing redundant conditions
 */

import type { WhereFilter, FilterOperand } from './types.js';
import { FilterOperator, isOperandFilter, isAndFilter, isOrFilter } from './types.js';
import type { ClassDefinition } from '../types/schema.js';

/**
 * Optimize a filter for better query performance
 *
 * @param filter - The filter to optimize
 * @param schema - The class schema for selectivity estimation
 * @returns Optimized filter
 */
export function optimizeFilter(
  filter: WhereFilter,
  schema: ClassDefinition
): WhereFilter {
  // Step 1: Flatten nested filters
  let optimized = flattenNestedFilters(filter);

  // Step 2: Reorder by selectivity
  optimized = reorderFiltersBySelectivity(optimized, schema);

  return optimized;
}

/**
 * Flatten nested filters of the same type
 *
 * Transforms: AND(AND(a, b), c) -> AND(a, b, c)
 * Transforms: OR(OR(a, b), c) -> OR(a, b, c)
 *
 * @param filter - The filter to flatten
 * @returns Flattened filter
 */
export function flattenNestedFilters(filter: WhereFilter): WhereFilter {
  if (isOperandFilter(filter)) {
    return filter;
  }

  if (isAndFilter(filter)) {
    const flattened: WhereFilter[] = [];

    for (const operand of filter.operands) {
      const flatOperand = flattenNestedFilters(operand);

      // If the operand is also an AND, merge its operands
      if (isAndFilter(flatOperand)) {
        flattened.push(...flatOperand.operands);
      } else {
        flattened.push(flatOperand);
      }
    }

    return {
      operator: 'And',
      operands: flattened,
    } as WhereFilter;
  }

  if (isOrFilter(filter)) {
    const flattened: WhereFilter[] = [];

    for (const operand of filter.operands) {
      const flatOperand = flattenNestedFilters(operand);

      // If the operand is also an OR, merge its operands
      if (isOrFilter(flatOperand)) {
        flattened.push(...flatOperand.operands);
      } else {
        flattened.push(flatOperand);
      }
    }

    return {
      operator: 'Or',
      operands: flattened,
    } as WhereFilter;
  }

  return filter;
}

/**
 * Reorder filters by estimated selectivity
 *
 * More selective filters (that filter out more data) should be evaluated first.
 *
 * @param filter - The filter to reorder
 * @param schema - The class schema
 * @returns Reordered filter
 */
function reorderFiltersBySelectivity(
  filter: WhereFilter,
  schema: ClassDefinition
): WhereFilter {
  if (isOperandFilter(filter)) {
    return filter;
  }

  if (isAndFilter(filter)) {
    // For AND filters, put most selective first
    const sortedOperands = [...filter.operands].sort((a, b) => {
      const selectivityA = estimateSelectivity(a, schema);
      const selectivityB = estimateSelectivity(b, schema);
      // Lower selectivity (more filtering) comes first
      return selectivityA - selectivityB;
    });

    return {
      operator: 'And',
      operands: sortedOperands.map((f) => reorderFiltersBySelectivity(f, schema)),
    } as WhereFilter;
  }

  if (isOrFilter(filter)) {
    // For OR filters, order doesn't matter as much for performance,
    // but we still recursively optimize nested filters
    return {
      operator: 'Or',
      operands: filter.operands.map((f) => reorderFiltersBySelectivity(f, schema)),
    } as WhereFilter;
  }

  return filter;
}

/**
 * Estimate the selectivity of a filter
 *
 * Returns a number between 0 (most selective) and 1 (least selective).
 * Lower values mean the filter is more selective (filters out more data).
 *
 * @param filter - The filter to estimate
 * @param schema - The class schema
 * @returns Estimated selectivity (0-1)
 */
export function estimateSelectivity(
  filter: WhereFilter,
  schema: ClassDefinition
): number {
  if (isOperandFilter(filter)) {
    return estimateOperandSelectivity(filter.operand, schema);
  }

  if (isAndFilter(filter)) {
    // AND is selective - the more conditions, the more selective
    // Use the minimum selectivity of all operands
    const selectivities = filter.operands.map((f) =>
      estimateSelectivity(f, schema)
    );
    return Math.min(...selectivities, 0.1);
  }

  if (isOrFilter(filter)) {
    // OR is less selective - it widens the result set
    // Use the maximum selectivity of all operands
    const selectivities = filter.operands.map((f) =>
      estimateSelectivity(f, schema)
    );
    return Math.max(...selectivities, 0.8);
  }

  return 0.5; // Default
}

/**
 * Estimate the selectivity of a filter operand
 *
 * @param operand - The operand to estimate
 * @param schema - The class schema
 * @returns Estimated selectivity (0-1)
 */
function estimateOperandSelectivity(
  operand: FilterOperand,
  schema: ClassDefinition
): number {
  // Base selectivity by operator type
  let selectivity = getOperatorSelectivity(operand.operator);

  // Adjust based on property indexing
  const property = schema.properties.find((p) => p.name === operand.path[0]);
  if (property) {
    // Indexed properties are more selective
    if (property.indexFilterable === false) {
      selectivity *= 1.5; // Less selective if not indexed
    }

    // Array properties are less selective for Contains operators
    if (property.dataType[0].includes('[]')) {
      if (
        operand.operator === FilterOperator.ContainsAny ||
        operand.operator === FilterOperator.ContainsAll
      ) {
        selectivity *= 1.2;
      }
    }
  }

  // Clamp to 0-1 range
  return Math.max(0, Math.min(1, selectivity));
}

/**
 * Get base selectivity estimate for an operator
 *
 * @param operator - Filter operator
 * @returns Base selectivity estimate
 */
function getOperatorSelectivity(operator: FilterOperator): number {
  switch (operator) {
    case FilterOperator.Equal:
      return 0.05; // Very selective
    case FilterOperator.NotEqual:
      return 0.95; // Very unselective
    case FilterOperator.IsNull:
      return 0.1; // Usually selective
    case FilterOperator.GreaterThan:
    case FilterOperator.LessThan:
      return 0.5; // Medium selective
    case FilterOperator.GreaterThanEqual:
    case FilterOperator.LessThanEqual:
      return 0.5; // Medium selective
    case FilterOperator.Like:
      return 0.3; // Fairly selective
    case FilterOperator.ContainsAny:
      return 0.4; // Less selective for arrays
    case FilterOperator.ContainsAll:
      return 0.2; // More selective for arrays
    case FilterOperator.WithinGeoRange:
      return 0.3; // Depends on radius, assume medium
    default:
      return 0.5; // Default medium
  }
}

/**
 * Reorder an array of filters by selectivity
 *
 * @param filters - Array of filters to reorder
 * @param schema - The class schema
 * @returns Reordered array of filters
 */
export function reorderBySelectivity(
  filters: WhereFilter[],
  schema: ClassDefinition
): WhereFilter[] {
  return [...filters].sort((a, b) => {
    const selectivityA = estimateSelectivity(a, schema);
    const selectivityB = estimateSelectivity(b, schema);
    return selectivityA - selectivityB;
  });
}

/**
 * Remove redundant filters
 *
 * Identifies and removes duplicate or redundant filter conditions.
 *
 * @param filter - The filter to clean
 * @returns Filter with redundancies removed
 */
export function removeRedundantFilters(filter: WhereFilter): WhereFilter {
  if (isOperandFilter(filter)) {
    return filter;
  }

  if (isAndFilter(filter)) {
    // Remove duplicate operands in AND
    const uniqueOperands = removeDuplicateFilters(filter.operands);

    if (uniqueOperands.length === 1) {
      return uniqueOperands[0];
    }

    return {
      operator: 'And',
      operands: uniqueOperands.map(removeRedundantFilters),
    } as WhereFilter;
  }

  if (isOrFilter(filter)) {
    // Remove duplicate operands in OR
    const uniqueOperands = removeDuplicateFilters(filter.operands);

    if (uniqueOperands.length === 1) {
      return uniqueOperands[0];
    }

    return {
      operator: 'Or',
      operands: uniqueOperands.map(removeRedundantFilters),
    } as WhereFilter;
  }

  return filter;
}

/**
 * Remove duplicate filters from an array
 *
 * @param filters - Array of filters
 * @returns Array with duplicates removed
 */
function removeDuplicateFilters(filters: WhereFilter[]): WhereFilter[] {
  const seen = new Set<string>();
  const unique: WhereFilter[] = [];

  for (const filter of filters) {
    const key = serializeFilterKey(filter);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(filter);
    }
  }

  return unique;
}

/**
 * Serialize a filter to a unique key for deduplication
 *
 * @param filter - The filter to serialize
 * @returns Unique string key
 */
function serializeFilterKey(filter: WhereFilter): string {
  return JSON.stringify(filter);
}

/**
 * Count the number of filter conditions
 *
 * @param filter - The filter to count
 * @returns Number of leaf conditions
 */
export function countFilterConditions(filter: WhereFilter): number {
  if (isOperandFilter(filter)) {
    return 1;
  }

  if (isAndFilter(filter) || isOrFilter(filter)) {
    return filter.operands.reduce(
      (sum, f) => sum + countFilterConditions(f),
      0
    );
  }

  return 0;
}

/**
 * Calculate the depth of a filter tree
 *
 * @param filter - The filter to measure
 * @returns Maximum depth
 */
export function calculateFilterDepth(filter: WhereFilter): number {
  if (isOperandFilter(filter)) {
    return 1;
  }

  if (isAndFilter(filter) || isOrFilter(filter)) {
    const depths = filter.operands.map(calculateFilterDepth);
    return 1 + Math.max(...depths);
  }

  return 0;
}

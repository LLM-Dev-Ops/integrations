/**
 * Query validation module for Pinecone integration.
 *
 * Provides validation for query requests including top-k limits,
 * vector dimensions, and metadata filters.
 *
 * @module validation/query
 */

import { ValidationError } from './vector.js';
import { VectorValidator, type SparseValues } from './vector.js';

/**
 * Maximum value for top_k parameter.
 */
export const MAX_TOP_K = 10_000;

/**
 * Maximum depth for nested metadata filters.
 */
export const MAX_FILTER_DEPTH = 10;

/**
 * Comparison operators for metadata filters.
 */
export enum ComparisonOp {
  Eq = '$eq',
  Ne = '$ne',
  Gt = '$gt',
  Gte = '$gte',
  Lt = '$lt',
  Lte = '$lte',
  In = '$in',
  Nin = '$nin',
}

/**
 * Metadata value types for filtering.
 */
export type MetadataFilterValue = string | number | boolean | string[] | number[];

/**
 * Filter condition for metadata.
 */
export interface FilterCondition {
  /** Field name to filter on */
  field: string;
  /** Comparison operator */
  op: ComparisonOp;
  /** Value to compare against */
  value: MetadataFilterValue;
}

/**
 * Logical operators for combining filter conditions.
 */
export enum FilterOperator {
  And = '$and',
  Or = '$or',
}

/**
 * Metadata filter structure.
 * Can be nested for complex queries.
 */
export interface MetadataFilter {
  /** Logical operator for combining conditions */
  operator?: FilterOperator;
  /** Array of filter conditions or nested filters */
  conditions?: Array<FilterCondition | MetadataFilter>;
  /** Direct field filters (alternative syntax) */
  [key: string]: any;
}

/**
 * Query request structure.
 */
export interface QueryRequest {
  /** Namespace to query (optional) */
  namespace?: string;
  /** Query vector (dense) */
  vector?: number[];
  /** Query by vector ID instead of providing vector */
  id?: string;
  /** Number of results to return */
  top_k: number;
  /** Metadata filter */
  filter?: MetadataFilter;
  /** Include vector values in response */
  include_values?: boolean;
  /** Include metadata in response */
  include_metadata?: boolean;
  /** Sparse vector for hybrid search */
  sparse_vector?: SparseValues;
}

/**
 * Validator for Pinecone query requests.
 */
export class QueryValidator {
  /**
   * Validates a complete query request.
   *
   * Rules:
   * - Must have vector OR id (at least one)
   * - top_k must be between 1 and 10,000
   * - Vector dimensions validated by VectorValidator
   * - Filter validated for depth and structure
   *
   * @param request - The query request to validate
   * @throws {ValidationError} If validation fails
   */
  static validate(request: QueryRequest): void {
    if (!request) {
      throw new ValidationError('Query request is required');
    }

    // Validate that at least one of vector or id is provided
    if (!request.vector && !request.id) {
      throw new ValidationError(
        'Query request must have either "vector" or "id" specified'
      );
    }

    // Note: Both vector and id can be provided - id takes precedence in Pinecone

    // Validate top_k
    if (typeof request.top_k !== 'number') {
      throw new ValidationError(
        `top_k must be a number (got ${typeof request.top_k})`
      );
    }

    if (!Number.isInteger(request.top_k)) {
      throw new ValidationError(
        `top_k must be an integer (got ${request.top_k})`
      );
    }

    if (request.top_k < 1) {
      throw new ValidationError(
        `top_k must be at least 1 (got ${request.top_k})`
      );
    }

    if (request.top_k > MAX_TOP_K) {
      throw new ValidationError(
        `top_k exceeds maximum of ${MAX_TOP_K} (got ${request.top_k})`
      );
    }

    // Validate vector if provided
    if (request.vector !== undefined) {
      VectorValidator.validateValues(request.vector);
    }

    // Validate id if provided
    if (request.id !== undefined) {
      VectorValidator.validateId(request.id);
    }

    // Validate sparse vector if provided
    if (request.sparse_vector !== undefined) {
      VectorValidator.validateSparseValues(request.sparse_vector);
    }

    // Validate filter if provided
    if (request.filter !== undefined) {
      this.validateFilter(request.filter);
    }
  }

  /**
   * Validates a metadata filter.
   *
   * Rules:
   * - No empty conditions arrays
   * - No reserved field names starting with '$' (except operators)
   * - Maximum depth of 10 levels
   * - Valid operator types
   *
   * @param filter - The filter to validate
   * @param depth - Current recursion depth (for internal use)
   * @throws {ValidationError} If validation fails
   */
  static validateFilter(filter: MetadataFilter, depth: number = 0): void {
    if (!filter || typeof filter !== 'object') {
      throw new ValidationError('Filter must be an object');
    }

    if (Array.isArray(filter)) {
      throw new ValidationError('Filter cannot be an array');
    }

    // Check maximum depth
    if (depth > MAX_FILTER_DEPTH) {
      throw new ValidationError(
        `Filter depth exceeds maximum of ${MAX_FILTER_DEPTH} levels`
      );
    }

    // Check if using structured filter format with operator and conditions
    if ('operator' in filter || 'conditions' in filter) {
      this.validateStructuredFilter(filter, depth);
      return;
    }

    // Otherwise, validate as direct field filters
    this.validateDirectFieldFilters(filter, depth);
  }

  /**
   * Validates a structured filter with operator and conditions.
   *
   * @param filter - The filter to validate
   * @param depth - Current recursion depth
   * @throws {ValidationError} If validation fails
   */
  private static validateStructuredFilter(
    filter: MetadataFilter,
    depth: number
  ): void {
    // Validate operator
    if (filter.operator !== undefined) {
      if (
        filter.operator !== FilterOperator.And &&
        filter.operator !== FilterOperator.Or
      ) {
        throw new ValidationError(
          `Invalid filter operator: ${filter.operator}. Must be "$and" or "$or"`
        );
      }
    }

    // Validate conditions
    if (filter.conditions === undefined || !Array.isArray(filter.conditions)) {
      throw new ValidationError('Filter conditions must be an array');
    }

    if (filter.conditions.length === 0) {
      throw new ValidationError('Filter conditions array cannot be empty');
    }

    // Validate each condition
    for (let i = 0; i < filter.conditions.length; i++) {
      const condition = filter.conditions[i];

      if (!condition || typeof condition !== 'object') {
        throw new ValidationError(
          `Filter condition at index ${i} must be an object`
        );
      }

      // Check if it's a nested filter or a condition
      if ('operator' in condition || 'conditions' in condition) {
        // Nested filter
        this.validateFilter(condition as MetadataFilter, depth + 1);
      } else if ('field' in condition && 'op' in condition && 'value' in condition) {
        // Filter condition
        this.validateFilterCondition(condition as FilterCondition);
      } else {
        // Direct field filter
        this.validateDirectFieldFilters(condition, depth + 1);
      }
    }
  }

  /**
   * Validates direct field filters (key-value pairs).
   *
   * @param filter - The filter object to validate
   * @param depth - Current recursion depth
   * @throws {ValidationError} If validation fails
   */
  private static validateDirectFieldFilters(
    filter: Record<string, any>,
    depth: number
  ): void {
    const keys = Object.keys(filter);

    if (keys.length === 0) {
      throw new ValidationError('Filter object cannot be empty');
    }

    for (const key of keys) {
      // Skip operator and conditions keys
      if (key === 'operator' || key === 'conditions') {
        continue;
      }

      // Check for reserved field names (starting with $)
      if (key.startsWith('$')) {
        // Check if it's a valid operator
        const validOperators = Object.values(FilterOperator);
        if (!validOperators.includes(key as FilterOperator)) {
          throw new ValidationError(
            `Invalid filter operator or reserved field name: ${key}`
          );
        }

        // If it's an operator, validate its conditions
        const conditions = filter[key];
        if (!Array.isArray(conditions)) {
          throw new ValidationError(
            `Operator ${key} must have an array of conditions`
          );
        }

        if (conditions.length === 0) {
          throw new ValidationError(
            `Operator ${key} cannot have empty conditions array`
          );
        }

        for (let i = 0; i < conditions.length; i++) {
          this.validateFilter(conditions[i], depth + 1);
        }
      } else {
        // Regular field filter - validate the value
        const value = filter[key];

        if (value === null || value === undefined) {
          throw new ValidationError(
            `Filter value for field "${key}" cannot be null or undefined`
          );
        }

        // If value is an object, it might contain comparison operators
        if (typeof value === 'object' && !Array.isArray(value)) {
          this.validateFieldOperators(key, value);
        }
      }
    }
  }

  /**
   * Validates field-level comparison operators.
   *
   * @param field - The field name
   * @param operators - Object containing operators and values
   * @throws {ValidationError} If validation fails
   */
  private static validateFieldOperators(
    field: string,
    operators: Record<string, any>
  ): void {
    const validOps = Object.values(ComparisonOp);

    for (const [op, value] of Object.entries(operators)) {
      if (!validOps.includes(op as ComparisonOp)) {
        throw new ValidationError(
          `Invalid comparison operator "${op}" for field "${field}"`
        );
      }

      if (value === null || value === undefined) {
        throw new ValidationError(
          `Comparison value for field "${field}" operator "${op}" cannot be null or undefined`
        );
      }
    }
  }

  /**
   * Validates a single filter condition.
   *
   * @param condition - The condition to validate
   * @throws {ValidationError} If validation fails
   */
  private static validateFilterCondition(condition: FilterCondition): void {
    // Validate field
    if (!condition.field || typeof condition.field !== 'string') {
      throw new ValidationError('Filter condition field must be a non-empty string');
    }

    if (condition.field.length === 0) {
      throw new ValidationError('Filter condition field cannot be empty');
    }

    // Check for reserved field names
    if (condition.field.startsWith('$')) {
      throw new ValidationError(
        `Filter condition field cannot start with "$": ${condition.field}`
      );
    }

    // Validate operator
    const validOps = Object.values(ComparisonOp);
    if (!validOps.includes(condition.op)) {
      throw new ValidationError(
        `Invalid comparison operator: ${condition.op}`
      );
    }

    // Validate value
    if (condition.value === null || condition.value === undefined) {
      throw new ValidationError(
        `Filter condition value for field "${condition.field}" cannot be null or undefined`
      );
    }

    const valueType = typeof condition.value;

    // For $in and $nin, value must be an array
    if (condition.op === ComparisonOp.In || condition.op === ComparisonOp.Nin) {
      if (!Array.isArray(condition.value)) {
        throw new ValidationError(
          `Filter condition value for operator "${condition.op}" must be an array (got ${valueType})`
        );
      }

      if (condition.value.length === 0) {
        throw new ValidationError(
          `Filter condition value array for operator "${condition.op}" cannot be empty`
        );
      }
    } else {
      // For other operators, validate primitive types
      if (
        valueType !== 'string' &&
        valueType !== 'number' &&
        valueType !== 'boolean'
      ) {
        throw new ValidationError(
          `Filter condition value for field "${condition.field}" must be string, number, or boolean (got ${valueType})`
        );
      }
    }
  }
}

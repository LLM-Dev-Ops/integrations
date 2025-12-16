/**
 * Qdrant FilterBuilder implementation following SPARC specification.
 *
 * Provides a fluent API for building type-safe Qdrant filters with support for:
 * - Must conditions (AND logic)
 * - Should conditions (OR logic)
 * - Must_not conditions (NOT logic)
 * - Field matching, ranges, and geographic filters
 * - Nested filters for array elements
 * - Filter validation
 */

import {
  Condition,
  FieldCondition,
  Filter,
  FilterValidationError,
  FilterValidationErrorCode,
  GeoBoundingBox,
  GeoPoint,
  GeoRadius,
  HasIdCondition,
  isValidGeoPoint,
  isValidPointId,
  isValidRange,
  MatchValue,
  MinShould,
  NestedCondition,
  PointId,
  Range,
  ValidationResult,
} from './types.js';

/**
 * Maximum nesting depth for filters to prevent stack overflow.
 */
const MAX_NESTED_DEPTH = 10;

/**
 * FilterBuilder provides a fluent API for constructing Qdrant filters.
 *
 * @example
 * ```typescript
 * const filter = new FilterBuilder()
 *   .fieldMatch('category', 'electronics')
 *   .fieldRange('price', { gte: 100, lte: 500 })
 *   .fieldMatchAny('brand', ['apple', 'samsung'])
 *   .build();
 * ```
 *
 * @example Geographic filtering
 * ```typescript
 * const filter = new FilterBuilder()
 *   .geoRadius('location', 40.7128, -74.0060, 5000) // 5km radius
 *   .build();
 * ```
 *
 * @example Nested filtering
 * ```typescript
 * const nestedFilter = new FilterBuilder()
 *   .fieldMatch('color', 'red')
 *   .build();
 *
 * const filter = new FilterBuilder()
 *   .nested('variants', nestedFilter)
 *   .build();
 * ```
 */
export class FilterBuilder {
  private filter: Filter;

  /**
   * Creates a new FilterBuilder instance.
   *
   * @param initialFilter - Optional initial filter to build upon
   */
  constructor(initialFilter?: Filter) {
    this.filter = initialFilter ?? {
      must: [],
      should: [],
      mustNot: [],
    };
  }

  // ==========================================================================
  // Field Match Methods
  // ==========================================================================

  /**
   * Adds an exact match condition for a field.
   *
   * @param key - Field key in the payload
   * @param value - Value to match (boolean, number, or string)
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.fieldMatch('status', 'active')
   *        .fieldMatch('count', 42)
   *        .fieldMatch('enabled', true);
   * ```
   */
  fieldMatch(key: string, value: boolean | number | string): this {
    const matchValue = this.toMatchValue(value);
    const condition: FieldCondition = {
      key,
      match: matchValue,
    };
    this.filter.must.push({ type: 'Field', condition });
    return this;
  }

  /**
   * Adds a match-any condition for a field (matches if value is in array).
   *
   * @param key - Field key in the payload
   * @param values - Array of values to match against
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.fieldMatchAny('category', ['electronics', 'computers', 'phones']);
   * ```
   */
  fieldMatchAny(key: string, values: string[]): this {
    if (values.length === 0) {
      throw new Error('fieldMatchAny requires at least one value');
    }
    const condition: FieldCondition = {
      key,
      match: { type: 'Keywords', values },
    };
    this.filter.must.push({ type: 'Field', condition });
    return this;
  }

  // ==========================================================================
  // Range Methods
  // ==========================================================================

  /**
   * Adds a numeric range condition for a field.
   *
   * @param key - Field key in the payload
   * @param range - Range specification with gte/gt/lte/lt
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.fieldRange('price', { gte: 100, lte: 500 });
   * builder.fieldRange('age', { gt: 18, lt: 65 });
   * ```
   */
  fieldRange(key: string, range: Range): this {
    if (!isValidRange(range)) {
      throw new Error(`Invalid range for field '${key}'`);
    }
    const condition: FieldCondition = {
      key,
      range,
    };
    this.filter.must.push({ type: 'Field', condition });
    return this;
  }

  /**
   * Adds a greater-than-or-equal condition for a field.
   *
   * @param key - Field key in the payload
   * @param value - Minimum value (inclusive)
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.fieldGte('age', 18);
   * ```
   */
  fieldGte(key: string, value: number): this {
    return this.fieldRange(key, { gte: value });
  }

  /**
   * Adds a greater-than condition for a field.
   *
   * @param key - Field key in the payload
   * @param value - Minimum value (exclusive)
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.fieldGt('score', 0.5);
   * ```
   */
  fieldGt(key: string, value: number): this {
    return this.fieldRange(key, { gt: value });
  }

  /**
   * Adds a less-than-or-equal condition for a field.
   *
   * @param key - Field key in the payload
   * @param value - Maximum value (inclusive)
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.fieldLte('price', 1000);
   * ```
   */
  fieldLte(key: string, value: number): this {
    return this.fieldRange(key, { lte: value });
  }

  /**
   * Adds a less-than condition for a field.
   *
   * @param key - Field key in the payload
   * @param value - Maximum value (exclusive)
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.fieldLt('quantity', 100);
   * ```
   */
  fieldLt(key: string, value: number): this {
    return this.fieldRange(key, { lt: value });
  }

  /**
   * Adds a between condition for a field (inclusive range).
   *
   * @param key - Field key in the payload
   * @param min - Minimum value (inclusive)
   * @param max - Maximum value (inclusive)
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.fieldBetween('age', 18, 65);
   * ```
   */
  fieldBetween(key: string, min: number, max: number): this {
    if (min > max) {
      throw new Error(
        `Invalid range for field '${key}': min (${min}) > max (${max})`
      );
    }
    return this.fieldRange(key, { gte: min, lte: max });
  }

  // ==========================================================================
  // Geographic Methods
  // ==========================================================================

  /**
   * Adds a geographic radius condition for a field.
   *
   * @param key - Field key containing GeoPoint data
   * @param lat - Center latitude (-90 to 90)
   * @param lon - Center longitude (-180 to 180)
   * @param radiusMeters - Radius in meters
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * // Find locations within 5km of New York City
   * builder.geoRadius('location', 40.7128, -74.0060, 5000);
   * ```
   */
  geoRadius(
    key: string,
    lat: number,
    lon: number,
    radiusMeters: number
  ): this {
    const center: GeoPoint = { lat, lon };
    if (!isValidGeoPoint(center)) {
      throw new Error(
        `Invalid geographic coordinates: lat=${lat}, lon=${lon}`
      );
    }
    if (radiusMeters <= 0) {
      throw new Error(`Radius must be positive, got ${radiusMeters}`);
    }
    const geoRadius: GeoRadius = { center, radiusMeters };
    const condition: FieldCondition = {
      key,
      geoRadius,
    };
    this.filter.must.push({ type: 'Field', condition });
    return this;
  }

  /**
   * Adds a geographic bounding box condition for a field.
   *
   * @param key - Field key containing GeoPoint data
   * @param topLeft - Top-left corner of the bounding box
   * @param bottomRight - Bottom-right corner of the bounding box
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.geoBoundingBox(
   *   'location',
   *   { lat: 40.8, lon: -74.1 },  // Top-left
   *   { lat: 40.7, lon: -74.0 }   // Bottom-right
   * );
   * ```
   */
  geoBoundingBox(key: string, topLeft: GeoPoint, bottomRight: GeoPoint): this {
    if (!isValidGeoPoint(topLeft)) {
      throw new Error(
        `Invalid top-left coordinates: lat=${topLeft.lat}, lon=${topLeft.lon}`
      );
    }
    if (!isValidGeoPoint(bottomRight)) {
      throw new Error(
        `Invalid bottom-right coordinates: lat=${bottomRight.lat}, lon=${bottomRight.lon}`
      );
    }
    if (topLeft.lat < bottomRight.lat) {
      throw new Error(
        'Invalid bounding box: top latitude must be >= bottom latitude'
      );
    }
    const geoBoundingBox: GeoBoundingBox = { topLeft, bottomRight };
    const condition: FieldCondition = {
      key,
      geoBoundingBox,
    };
    this.filter.must.push({ type: 'Field', condition });
    return this;
  }

  // ==========================================================================
  // Existence Check Methods
  // ==========================================================================

  /**
   * Adds a condition that checks if a field exists (is not empty).
   *
   * @param key - Field key in the payload
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.fieldExists('description');
   * ```
   */
  fieldExists(key: string): this {
    const condition: FieldCondition = {
      key,
      isEmpty: false,
    };
    this.filter.must.push({ type: 'Field', condition });
    return this;
  }

  /**
   * Adds a condition that checks if a field is null.
   *
   * @param key - Field key in the payload
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.fieldIsNull('deletedAt');
   * ```
   */
  fieldIsNull(key: string): this {
    const condition: FieldCondition = {
      key,
      isNull: true,
    };
    this.filter.must.push({ type: 'Field', condition });
    return this;
  }

  /**
   * Adds a condition that checks if a field is not null.
   *
   * @param key - Field key in the payload
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.fieldIsNotNull('publishedAt');
   * ```
   */
  fieldIsNotNull(key: string): this {
    const condition: FieldCondition = {
      key,
      isNull: false,
    };
    this.filter.must.push({ type: 'Field', condition });
    return this;
  }

  // ==========================================================================
  // Special Conditions
  // ==========================================================================

  /**
   * Adds a condition that filters by point IDs.
   *
   * @param ids - Array of point IDs (UUID strings or numeric IDs)
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.hasId(['uuid-1', 'uuid-2', 'uuid-3']);
   * builder.hasId([1, 2, 3]);
   * ```
   */
  hasId(ids: PointId[]): this {
    if (ids.length === 0) {
      throw new Error('hasId requires at least one ID');
    }
    for (const id of ids) {
      if (!isValidPointId(id)) {
        throw new Error(`Invalid point ID: ${id}`);
      }
    }
    const condition: HasIdCondition = { ids };
    this.filter.must.push({ type: 'HasId', condition });
    return this;
  }

  /**
   * Adds a nested filter for array element matching.
   *
   * @param key - Field key containing an array
   * @param nestedFilter - Filter to apply to array elements
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * const variantFilter = new FilterBuilder()
   *   .fieldMatch('color', 'red')
   *   .fieldGte('stock', 1)
   *   .build();
   *
   * builder.nested('variants', variantFilter);
   * ```
   */
  nested(key: string, nestedFilter: Filter): this {
    // Check nesting depth to prevent stack overflow
    const depth = this.calculateFilterDepth(nestedFilter);
    if (depth > MAX_NESTED_DEPTH) {
      throw new Error(
        `Nested filter depth (${depth}) exceeds maximum (${MAX_NESTED_DEPTH})`
      );
    }

    const condition: NestedCondition = {
      key,
      filter: nestedFilter,
    };
    this.filter.must.push({ type: 'Nested', condition });
    return this;
  }

  // ==========================================================================
  // Boolean Logic Methods
  // ==========================================================================

  /**
   * Combines this filter with another using OR logic.
   *
   * Moves all must conditions from the other builder into should conditions.
   *
   * @param otherBuilder - Another filter builder to combine with
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * const categoryFilter = new FilterBuilder()
   *   .fieldMatch('category', 'electronics');
   *
   * const brandFilter = new FilterBuilder()
   *   .fieldMatch('brand', 'apple');
   *
   * // Match electronics OR apple brand
   * const filter = categoryFilter.or(brandFilter).build();
   * ```
   */
  or(otherBuilder: FilterBuilder): this {
    const otherFilter = otherBuilder.build();

    // Convert all must/should conditions from other filter to should conditions
    this.filter.should.push(...otherFilter.must);
    this.filter.should.push(...otherFilter.should);

    // Must_not conditions remain as must_not
    this.filter.mustNot.push(...otherFilter.mustNot);

    return this;
  }

  /**
   * Adds a condition to the must_not list (NOT logic).
   *
   * @param condition - Condition to negate
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * const deletedCondition: Condition = {
   *   type: 'Field',
   *   condition: { key: 'status', match: { type: 'Keyword', value: 'deleted' } }
   * };
   * builder.not(deletedCondition);
   * ```
   */
  not(condition: Condition): this {
    this.filter.mustNot.push(condition);
    return this;
  }

  /**
   * Sets the minimum number of should conditions that must match.
   *
   * @param count - Minimum number of should conditions to match
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder
   *   .should(condition1)
   *   .should(condition2)
   *   .should(condition3)
   *   .minShouldMatch(2); // At least 2 of the 3 should conditions must match
   * ```
   */
  minShouldMatch(count: number): this {
    if (count < 1) {
      throw new Error('minShouldMatch count must be at least 1');
    }
    if (count > this.filter.should.length) {
      throw new Error(
        `minShouldMatch count (${count}) exceeds number of should conditions (${this.filter.should.length})`
      );
    }
    this.filter.minShould = {
      conditions: [...this.filter.should],
      minCount: count,
    };
    return this;
  }

  /**
   * Adds a condition to the should list (OR logic).
   *
   * @param condition - Condition to add to should list
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * const condition: Condition = {
   *   type: 'Field',
   *   condition: { key: 'priority', match: { type: 'Keyword', value: 'high' } }
   * };
   * builder.should(condition);
   * ```
   */
  should(condition: Condition): this {
    this.filter.should.push(condition);
    return this;
  }

  /**
   * Adds a condition to the must list (AND logic).
   *
   * @param condition - Condition to add to must list
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * const condition: Condition = {
   *   type: 'Field',
   *   condition: { key: 'enabled', match: { type: 'Bool', value: true } }
   * };
   * builder.must(condition);
   * ```
   */
  must(condition: Condition): this {
    this.filter.must.push(condition);
    return this;
  }

  // ==========================================================================
  // Build and Validation Methods
  // ==========================================================================

  /**
   * Builds and returns the final filter.
   *
   * @returns The constructed Filter object
   *
   * @example
   * ```typescript
   * const filter = builder
   *   .fieldMatch('status', 'active')
   *   .fieldGte('price', 10)
   *   .build();
   * ```
   */
  build(): Filter {
    return { ...this.filter };
  }

  /**
   * Validates the filter structure.
   *
   * Checks for:
   * - Empty filters
   * - Invalid field keys
   * - Invalid ranges
   * - Invalid geographic coordinates
   * - Conflicting conditions
   *
   * @returns Validation result with errors and warnings
   *
   * @example
   * ```typescript
   * const result = builder.validate();
   * if (!result.isValid) {
   *   console.error('Filter validation failed:', result.errors);
   * }
   * ```
   */
  validate(): ValidationResult {
    const errors: FilterValidationError[] = [];
    const warnings: FilterValidationError[] = [];

    // Check if filter is completely empty
    if (
      this.filter.must.length === 0 &&
      this.filter.should.length === 0 &&
      this.filter.mustNot.length === 0
    ) {
      warnings.push({
        message: 'Filter is empty (no conditions specified)',
        code: FilterValidationErrorCode.EmptyFilter,
      });
    }

    // Validate all conditions
    this.validateConditions(this.filter.must, errors, warnings);
    this.validateConditions(this.filter.should, errors, warnings);
    this.validateConditions(this.filter.mustNot, errors, warnings);

    // Validate minShould
    if (this.filter.minShould) {
      if (this.filter.minShould.minCount > this.filter.should.length) {
        errors.push({
          message: `minShould count (${this.filter.minShould.minCount}) exceeds number of should conditions (${this.filter.should.length})`,
          code: FilterValidationErrorCode.ConflictingConditions,
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  // ==========================================================================
  // Private Helper Methods
  // ==========================================================================

  /**
   * Converts a primitive value to MatchValue.
   */
  private toMatchValue(value: boolean | number | string): MatchValue {
    if (typeof value === 'boolean') {
      return { type: 'Bool', value };
    }
    if (typeof value === 'number') {
      return { type: 'Integer', value };
    }
    return { type: 'Keyword', value };
  }

  /**
   * Validates an array of conditions.
   */
  private validateConditions(
    conditions: Condition[],
    errors: FilterValidationError[],
    warnings: FilterValidationError[]
  ): void {
    for (const condition of conditions) {
      if (condition.type === 'Field') {
        this.validateFieldCondition(condition.condition, errors, warnings);
      } else if (condition.type === 'HasId') {
        this.validateHasIdCondition(condition.condition, errors);
      } else if (condition.type === 'Nested') {
        this.validateNestedCondition(condition.condition, errors, warnings);
      } else if (condition.type === 'Filter') {
        // Recursively validate nested filter
        const builder = new FilterBuilder(condition.filter);
        const result = builder.validate();
        errors.push(...result.errors);
        warnings.push(...result.warnings);
      }
    }
  }

  /**
   * Validates a field condition.
   */
  private validateFieldCondition(
    condition: FieldCondition,
    errors: FilterValidationError[],
    warnings: FilterValidationError[]
  ): void {
    // Validate key
    if (!condition.key || condition.key.trim() === '') {
      errors.push({
        field: condition.key,
        message: 'Field key cannot be empty',
        code: FilterValidationErrorCode.InvalidFieldKey,
      });
    }

    // Validate range
    if (condition.range && !isValidRange(condition.range)) {
      errors.push({
        field: condition.key,
        message: 'Invalid range specification',
        code: FilterValidationErrorCode.InvalidRange,
      });
    }

    // Validate geo coordinates
    if (condition.geoRadius) {
      if (!isValidGeoPoint(condition.geoRadius.center)) {
        errors.push({
          field: condition.key,
          message: 'Invalid geographic coordinates for geoRadius',
          code: FilterValidationErrorCode.InvalidGeoCoordinates,
        });
      }
      if (condition.geoRadius.radiusMeters <= 0) {
        errors.push({
          field: condition.key,
          message: 'Radius must be positive',
          code: FilterValidationErrorCode.InvalidGeoCoordinates,
        });
      }
    }

    if (condition.geoBoundingBox) {
      const { topLeft, bottomRight } = condition.geoBoundingBox;
      if (!isValidGeoPoint(topLeft) || !isValidGeoPoint(bottomRight)) {
        errors.push({
          field: condition.key,
          message: 'Invalid geographic coordinates for geoBoundingBox',
          code: FilterValidationErrorCode.InvalidGeoCoordinates,
        });
      }
    }

    // Validate match
    if (condition.match?.type === 'Keywords' && condition.match.values.length === 0) {
      errors.push({
        field: condition.key,
        message: 'Match array cannot be empty',
        code: FilterValidationErrorCode.EmptyMatchArray,
      });
    }
  }

  /**
   * Validates a hasId condition.
   */
  private validateHasIdCondition(
    condition: HasIdCondition,
    errors: FilterValidationError[]
  ): void {
    if (condition.ids.length === 0) {
      errors.push({
        message: 'HasId condition requires at least one ID',
        code: FilterValidationErrorCode.InvalidPointId,
      });
    }
    for (const id of condition.ids) {
      if (!isValidPointId(id)) {
        errors.push({
          message: `Invalid point ID: ${id}`,
          code: FilterValidationErrorCode.InvalidPointId,
        });
      }
    }
  }

  /**
   * Validates a nested condition.
   */
  private validateNestedCondition(
    condition: NestedCondition,
    errors: FilterValidationError[],
    warnings: FilterValidationError[]
  ): void {
    if (!condition.key || condition.key.trim() === '') {
      errors.push({
        field: condition.key,
        message: 'Nested condition key cannot be empty',
        code: FilterValidationErrorCode.InvalidFieldKey,
      });
    }

    // Check nesting depth
    const depth = this.calculateFilterDepth(condition.filter);
    if (depth > MAX_NESTED_DEPTH) {
      errors.push({
        field: condition.key,
        message: `Nested filter depth (${depth}) exceeds maximum (${MAX_NESTED_DEPTH})`,
        code: FilterValidationErrorCode.MaxNestedDepthExceeded,
      });
    }

    // Recursively validate nested filter
    const builder = new FilterBuilder(condition.filter);
    const result = builder.validate();
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }

  /**
   * Calculates the maximum depth of a filter (for nested filters).
   */
  private calculateFilterDepth(filter: Filter, currentDepth = 1): number {
    let maxDepth = currentDepth;

    const allConditions = [
      ...filter.must,
      ...filter.should,
      ...filter.mustNot,
    ];

    for (const condition of allConditions) {
      if (condition.type === 'Nested') {
        const nestedDepth = this.calculateFilterDepth(
          condition.condition.filter,
          currentDepth + 1
        );
        maxDepth = Math.max(maxDepth, nestedDepth);
      } else if (condition.type === 'Filter') {
        const nestedDepth = this.calculateFilterDepth(
          condition.filter,
          currentDepth + 1
        );
        maxDepth = Math.max(maxDepth, nestedDepth);
      }
    }

    return maxDepth;
  }
}

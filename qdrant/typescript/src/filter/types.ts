/**
 * Qdrant filter type definitions following SPARC specification.
 *
 * Provides type-safe filter construction for payload filtering in vector searches.
 */

// ============================================================================
// Core Filter Types
// ============================================================================

/**
 * Geographic coordinate representation.
 */
export interface GeoPoint {
  /** Latitude in degrees (-90 to 90) */
  lat: number;
  /** Longitude in degrees (-180 to 180) */
  lon: number;
}

/**
 * Geographic bounding box for geo filtering.
 */
export interface GeoBoundingBox {
  /** Top-left corner of the bounding box */
  topLeft: GeoPoint;
  /** Bottom-right corner of the bounding box */
  bottomRight: GeoPoint;
}

/**
 * Geographic radius for geo filtering.
 */
export interface GeoRadius {
  /** Center point of the radius */
  center: GeoPoint;
  /** Radius in meters */
  radiusMeters: number;
}

/**
 * Numeric range for filtering.
 */
export interface Range {
  /** Greater than or equal to */
  gte?: number;
  /** Greater than (exclusive) */
  gt?: number;
  /** Less than or equal to */
  lte?: number;
  /** Less than (exclusive) */
  lt?: number;
}

/**
 * Match value types for field conditions.
 */
export type MatchValue =
  | { type: 'Bool'; value: boolean }
  | { type: 'Integer'; value: number }
  | { type: 'Keyword'; value: string }
  | { type: 'Keywords'; values: string[] };

/**
 * Field condition for payload filtering.
 *
 * Supports various condition types:
 * - Match: exact value matching
 * - Range: numeric range filtering
 * - Geo: geographic filtering (radius or bounding box)
 * - IsEmpty: field existence check
 * - IsNull: null value check
 */
export interface FieldCondition {
  /** Field key in the payload */
  key: string;
  /** Match value condition (exact match or match any) */
  match?: MatchValue;
  /** Numeric range condition */
  range?: Range;
  /** Geographic bounding box condition */
  geoBoundingBox?: GeoBoundingBox;
  /** Geographic radius condition */
  geoRadius?: GeoRadius;
  /** Check if field is empty (false) or non-empty (true) */
  isEmpty?: boolean;
  /** Check if field is null (true) or not null (false) */
  isNull?: boolean;
}

/**
 * HasId condition for filtering by point IDs.
 */
export interface HasIdCondition {
  /** Point IDs to match (UUID strings or numeric IDs) */
  ids: (string | number)[];
}

/**
 * Nested condition for filtering on array elements.
 *
 * Allows applying filters to elements within array fields.
 */
export interface NestedCondition {
  /** Path to the nested array field */
  key: string;
  /** Filter to apply to array elements */
  filter: Filter;
}

/**
 * Union of all condition types.
 */
export type Condition =
  | { type: 'Field'; condition: FieldCondition }
  | { type: 'HasId'; condition: HasIdCondition }
  | { type: 'Nested'; condition: NestedCondition }
  | { type: 'Filter'; filter: Filter };

/**
 * MinShould condition for minimum number of should conditions to match.
 */
export interface MinShould {
  /** Conditions to evaluate */
  conditions: Condition[];
  /** Minimum number of conditions that must match */
  minCount: number;
}

/**
 * Filter structure for Qdrant searches.
 *
 * Supports boolean logic with must (AND), should (OR), and must_not (NOT).
 */
export interface Filter {
  /** Conditions that MUST all match (AND logic) */
  must: Condition[];
  /** Conditions where at least one SHOULD match (OR logic) */
  should: Condition[];
  /** Conditions that MUST NOT match (NOT logic) */
  mustNot: Condition[];
  /** Minimum number of should conditions to match */
  minShould?: MinShould;
}

// ============================================================================
// Validation Types
// ============================================================================

/**
 * Validation error for filter construction.
 */
export interface FilterValidationError {
  /** Field or condition that caused the error */
  field?: string;
  /** Error message */
  message: string;
  /** Error code for programmatic handling */
  code: FilterValidationErrorCode;
}

/**
 * Error codes for filter validation.
 */
export enum FilterValidationErrorCode {
  /** Empty filter with no conditions */
  EmptyFilter = 'EMPTY_FILTER',
  /** Invalid field key (empty or malformed) */
  InvalidFieldKey = 'INVALID_FIELD_KEY',
  /** Invalid range (e.g., min > max) */
  InvalidRange = 'INVALID_RANGE',
  /** Invalid geographic coordinates */
  InvalidGeoCoordinates = 'INVALID_GEO_COORDINATES',
  /** Invalid match value */
  InvalidMatchValue = 'INVALID_MATCH_VALUE',
  /** Empty array for match any */
  EmptyMatchArray = 'EMPTY_MATCH_ARRAY',
  /** Invalid point ID */
  InvalidPointId = 'INVALID_POINT_ID',
  /** Conflicting conditions on same field */
  ConflictingConditions = 'CONFLICTING_CONDITIONS',
  /** Nested filter depth exceeds maximum */
  MaxNestedDepthExceeded = 'MAX_NESTED_DEPTH_EXCEEDED',
}

/**
 * Validation result for filter structure.
 */
export interface ValidationResult {
  /** Whether the filter is valid */
  isValid: boolean;
  /** Validation errors, if any */
  errors: FilterValidationError[];
  /** Warnings that don't prevent usage but may indicate issues */
  warnings: FilterValidationError[];
}

// ============================================================================
// Helper Types
// ============================================================================

/**
 * Point ID type (UUID string or numeric ID).
 */
export type PointId = string | number;

/**
 * Type guard to check if a value is a valid PointId.
 */
export function isValidPointId(value: unknown): value is PointId {
  return typeof value === 'string' || typeof value === 'number';
}

/**
 * Type guard to check if coordinates are valid.
 */
export function isValidGeoPoint(point: GeoPoint): boolean {
  return (
    typeof point.lat === 'number' &&
    typeof point.lon === 'number' &&
    point.lat >= -90 &&
    point.lat <= 90 &&
    point.lon >= -180 &&
    point.lon <= 180
  );
}

/**
 * Type guard to check if a range is valid.
 */
export function isValidRange(range: Range): boolean {
  // At least one boundary must be set
  if (
    range.gte === undefined &&
    range.gt === undefined &&
    range.lte === undefined &&
    range.lt === undefined
  ) {
    return false;
  }

  // Check for conflicting boundaries
  if (range.gte !== undefined && range.gt !== undefined) {
    return false;
  }
  if (range.lte !== undefined && range.lt !== undefined) {
    return false;
  }

  // Check that min <= max if both are set
  const min = range.gte ?? range.gt;
  const max = range.lte ?? range.lt;
  if (min !== undefined && max !== undefined) {
    if (range.gte !== undefined && range.lte !== undefined) {
      return min <= max;
    }
    if (range.gt !== undefined && range.lt !== undefined) {
      return min < max;
    }
    // Mixed inclusive/exclusive
    return min < max;
  }

  return true;
}

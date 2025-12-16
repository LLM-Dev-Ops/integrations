/**
 * Qdrant filter module - Public API exports.
 *
 * Provides type-safe filter construction for Qdrant vector searches.
 *
 * @module filter
 *
 * @example Basic usage
 * ```typescript
 * import { FilterBuilder } from '@/qdrant/filter';
 *
 * const filter = new FilterBuilder()
 *   .fieldMatch('category', 'electronics')
 *   .fieldRange('price', { gte: 100, lte: 500 })
 *   .build();
 * ```
 *
 * @example Geographic filtering
 * ```typescript
 * import { FilterBuilder } from '@/qdrant/filter';
 *
 * const filter = new FilterBuilder()
 *   .geoRadius('location', 40.7128, -74.0060, 5000)
 *   .build();
 * ```
 *
 * @example Nested filtering
 * ```typescript
 * import { FilterBuilder } from '@/qdrant/filter';
 *
 * const variantFilter = new FilterBuilder()
 *   .fieldMatch('color', 'red')
 *   .fieldGte('stock', 1)
 *   .build();
 *
 * const filter = new FilterBuilder()
 *   .nested('variants', variantFilter)
 *   .build();
 * ```
 *
 * @example Complex boolean logic
 * ```typescript
 * import { FilterBuilder } from '@/qdrant/filter';
 *
 * const categoryFilter = new FilterBuilder()
 *   .fieldMatch('category', 'electronics');
 *
 * const brandFilter = new FilterBuilder()
 *   .fieldMatchAny('brand', ['apple', 'samsung']);
 *
 * // Electronics OR (apple/samsung brand)
 * const filter = categoryFilter
 *   .or(brandFilter)
 *   .fieldGte('rating', 4.0)
 *   .build();
 * ```
 */

// ============================================================================
// Core Builder Export
// ============================================================================

export { FilterBuilder } from './builder.js';

// ============================================================================
// Type Exports
// ============================================================================

export type {
  Condition,
  FieldCondition,
  Filter,
  FilterValidationError,
  GeoBoundingBox,
  GeoPoint,
  GeoRadius,
  HasIdCondition,
  MatchValue,
  MinShould,
  NestedCondition,
  PointId,
  Range,
  ValidationResult,
} from './types.js';

export { FilterValidationErrorCode } from './types.js';

// ============================================================================
// Type Guards Export
// ============================================================================

export { isValidGeoPoint, isValidPointId, isValidRange } from './types.js';

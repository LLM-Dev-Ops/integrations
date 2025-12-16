/**
 * FilterBuilder usage examples demonstrating all features.
 *
 * These examples showcase the various ways to construct filters for Qdrant searches.
 */

import { FilterBuilder } from './builder.js';
import type { Condition, Filter } from './types.js';

// ============================================================================
// Basic Examples
// ============================================================================

/**
 * Example 1: Simple field matching
 */
export function basicFieldMatchExample(): Filter {
  return new FilterBuilder()
    .fieldMatch('category', 'electronics')
    .fieldMatch('status', 'active')
    .fieldMatch('inStock', true)
    .build();
}

/**
 * Example 2: Match any (OR within field)
 */
export function matchAnyExample(): Filter {
  return new FilterBuilder()
    .fieldMatchAny('brand', ['apple', 'samsung', 'google'])
    .fieldMatch('type', 'smartphone')
    .build();
}

// ============================================================================
// Range Examples
// ============================================================================

/**
 * Example 3: Numeric range filtering
 */
export function rangeFilterExample(): Filter {
  return new FilterBuilder()
    .fieldRange('price', { gte: 100, lte: 500 })
    .fieldRange('rating', { gt: 4.0 })
    .build();
}

/**
 * Example 4: Convenience range methods
 */
export function rangeConvenienceExample(): Filter {
  return new FilterBuilder()
    .fieldGte('age', 18)
    .fieldLte('price', 1000)
    .fieldBetween('rating', 3.5, 5.0)
    .build();
}

// ============================================================================
// Geographic Examples
// ============================================================================

/**
 * Example 5: Geographic radius search
 */
export function geoRadiusExample(): Filter {
  // Find locations within 5km of New York City
  return new FilterBuilder()
    .geoRadius('location', 40.7128, -74.0060, 5000)
    .fieldMatch('type', 'restaurant')
    .build();
}

/**
 * Example 6: Geographic bounding box search
 */
export function geoBoundingBoxExample(): Filter {
  // Find locations within a rectangular area
  return new FilterBuilder()
    .geoBoundingBox(
      'location',
      { lat: 40.8, lon: -74.1 },  // Top-left
      { lat: 40.7, lon: -74.0 }   // Bottom-right
    )
    .fieldMatch('category', 'hotel')
    .build();
}

// ============================================================================
// Existence Check Examples
// ============================================================================

/**
 * Example 7: Field existence and null checks
 */
export function existenceCheckExample(): Filter {
  return new FilterBuilder()
    .fieldExists('description')
    .fieldIsNotNull('publishedAt')
    .fieldIsNull('deletedAt')
    .build();
}

// ============================================================================
// Point ID Examples
// ============================================================================

/**
 * Example 8: Filter by point IDs
 */
export function pointIdFilterExample(): Filter {
  return new FilterBuilder()
    .hasId(['uuid-1', 'uuid-2', 'uuid-3'])
    .build();
}

/**
 * Example 9: Filter by numeric IDs
 */
export function numericIdFilterExample(): Filter {
  return new FilterBuilder()
    .hasId([1, 2, 3, 4, 5])
    .build();
}

// ============================================================================
// Nested Filter Examples
// ============================================================================

/**
 * Example 10: Nested filter for array elements
 */
export function nestedFilterExample(): Filter {
  // Create filter for array elements
  const variantFilter = new FilterBuilder()
    .fieldMatch('color', 'red')
    .fieldGte('stock', 1)
    .build();

  // Apply to nested array field
  return new FilterBuilder()
    .fieldMatch('category', 'clothing')
    .nested('variants', variantFilter)
    .build();
}

/**
 * Example 11: Deep nested filters
 */
export function deepNestedExample(): Filter {
  // Level 2 filter
  const attributeFilter = new FilterBuilder()
    .fieldMatch('name', 'size')
    .fieldMatch('value', 'large')
    .build();

  // Level 1 filter
  const variantFilter = new FilterBuilder()
    .fieldMatch('sku', 'ABC123')
    .nested('attributes', attributeFilter)
    .build();

  // Top level filter
  return new FilterBuilder()
    .fieldMatch('productType', 'apparel')
    .nested('variants', variantFilter)
    .build();
}

// ============================================================================
// Boolean Logic Examples
// ============================================================================

/**
 * Example 12: Combining filters with OR
 */
export function orCombinationExample(): Filter {
  const categoryFilter = new FilterBuilder()
    .fieldMatch('category', 'electronics');

  const brandFilter = new FilterBuilder()
    .fieldMatch('brand', 'apple');

  // Match electronics OR apple brand
  return categoryFilter.or(brandFilter).build();
}

/**
 * Example 13: NOT logic
 */
export function notLogicExample(): Filter {
  const deletedCondition: Condition = {
    type: 'Field',
    condition: {
      key: 'status',
      match: { type: 'Keyword', value: 'deleted' }
    }
  };

  return new FilterBuilder()
    .fieldMatch('category', 'electronics')
    .not(deletedCondition)  // Exclude deleted items
    .build();
}

/**
 * Example 14: Should with minimum match
 */
export function minShouldMatchExample(): Filter {
  const condition1: Condition = {
    type: 'Field',
    condition: { key: 'premium', match: { type: 'Bool', value: true } }
  };
  const condition2: Condition = {
    type: 'Field',
    condition: { key: 'verified', match: { type: 'Bool', value: true } }
  };
  const condition3: Condition = {
    type: 'Field',
    condition: { key: 'featured', match: { type: 'Bool', value: true } }
  };

  return new FilterBuilder()
    .should(condition1)
    .should(condition2)
    .should(condition3)
    .minShouldMatch(2)  // At least 2 of the 3 must match
    .build();
}

// ============================================================================
// Complex Real-World Examples
// ============================================================================

/**
 * Example 15: E-commerce product search
 */
export function ecommerceSearchExample(): Filter {
  return new FilterBuilder()
    .fieldMatch('category', 'electronics')
    .fieldMatchAny('brand', ['apple', 'samsung', 'sony'])
    .fieldBetween('price', 100, 1000)
    .fieldGte('rating', 4.0)
    .fieldIsNotNull('availability')
    .fieldExists('images')
    .build();
}

/**
 * Example 16: Location-based search with multiple criteria
 */
export function locationBasedSearchExample(): Filter {
  return new FilterBuilder()
    .geoRadius('location', 40.7128, -74.0060, 10000) // 10km radius
    .fieldMatch('type', 'restaurant')
    .fieldGte('rating', 4.5)
    .fieldMatch('openNow', true)
    .fieldMatchAny('cuisine', ['italian', 'japanese', 'french'])
    .build();
}

/**
 * Example 17: Document search with metadata
 */
export function documentSearchExample(): Filter {
  return new FilterBuilder()
    .fieldMatchAny('documentType', ['article', 'blog', 'documentation'])
    .fieldGte('publishedDate', 1640000000) // Unix timestamp
    .fieldMatch('language', 'en')
    .fieldExists('summary')
    .fieldIsNull('archived')
    .build();
}

/**
 * Example 18: Multi-condition with OR logic
 */
export function multiConditionOrExample(): Filter {
  // High priority OR urgent
  const priorityFilter = new FilterBuilder()
    .fieldMatch('priority', 'high');

  const urgentFilter = new FilterBuilder()
    .fieldMatch('urgent', true);

  return priorityFilter
    .or(urgentFilter)
    .fieldMatch('status', 'open')
    .fieldIsNotNull('assignee')
    .build();
}

/**
 * Example 19: Real estate search
 */
export function realEstateSearchExample(): Filter {
  return new FilterBuilder()
    .fieldMatch('propertyType', 'apartment')
    .fieldBetween('bedrooms', 2, 4)
    .fieldGte('bathrooms', 2)
    .fieldBetween('price', 200000, 500000)
    .geoRadius('location', 37.7749, -122.4194, 20000) // 20km from SF
    .fieldMatch('petFriendly', true)
    .fieldExists('parking')
    .build();
}

/**
 * Example 20: User profile matching
 */
export function userProfileMatchingExample(): Filter {
  const skillsFilter = new FilterBuilder()
    .fieldMatchAny('name', ['javascript', 'typescript', 'react'])
    .fieldGte('years', 2)
    .build();

  return new FilterBuilder()
    .fieldMatch('active', true)
    .fieldBetween('experienceYears', 3, 10)
    .nested('skills', skillsFilter)
    .fieldIsNotNull('linkedinProfile')
    .geoRadius('location', 51.5074, -0.1278, 50000) // 50km from London
    .build();
}

// ============================================================================
// Validation Examples
// ============================================================================

/**
 * Example 21: Validation with error handling
 */
export function validationExample(): { filter?: Filter; errors?: string[] } {
  const builder = new FilterBuilder()
    .fieldMatch('category', 'electronics')
    .fieldBetween('price', 100, 500);

  const validation = builder.validate();

  if (!validation.isValid) {
    return {
      errors: validation.errors.map((e: { message: string; code: string }) => `${e.message} (${e.code})`)
    };
  }

  if (validation.warnings.length > 0) {
    console.warn('Validation warnings:', validation.warnings);
  }

  return { filter: builder.build() };
}

/**
 * Example 22: Handling invalid filter construction
 */
export function invalidFilterExample(): void {
  try {
    // This will throw an error: min > max
    new FilterBuilder()
      .fieldBetween('price', 1000, 100)
      .build();
  } catch (error) {
    console.error('Filter construction failed:', (error as Error).message);
    // "Invalid range for field 'price': min (1000) > max (100)"
  }

  try {
    // This will throw an error: empty array
    new FilterBuilder()
      .fieldMatchAny('categories', [])
      .build();
  } catch (error) {
    console.error('Filter construction failed:', (error as Error).message);
    // "fieldMatchAny requires at least one value"
  }

  try {
    // This will throw an error: invalid coordinates
    new FilterBuilder()
      .geoRadius('location', 100, 200, 5000) // lat > 90, lon > 180
      .build();
  } catch (error) {
    console.error('Filter construction failed:', (error as Error).message);
    // "Invalid geographic coordinates: lat=100, lon=200"
  }
}

// ============================================================================
// Advanced Pattern Examples
// ============================================================================

/**
 * Example 23: Building filters programmatically
 */
export function programmaticFilterExample(
  categories: string[],
  priceRange: { min: number; max: number },
  mustHaveImages: boolean
): Filter {
  const builder = new FilterBuilder();

  // Add category filter if categories provided
  if (categories.length > 0) {
    if (categories.length === 1) {
      builder.fieldMatch('category', categories[0]);
    } else {
      builder.fieldMatchAny('category', categories);
    }
  }

  // Add price range
  builder.fieldBetween('price', priceRange.min, priceRange.max);

  // Conditionally add image requirement
  if (mustHaveImages) {
    builder.fieldExists('images');
  }

  return builder.build();
}

/**
 * Example 24: Reusable filter components
 */
export function reusableFilterComponentsExample(): Filter {
  // Common filters that can be reused
  const activeItemsFilter = new FilterBuilder()
    .fieldMatch('active', true)
    .fieldIsNull('deletedAt');

  const highQualityFilter = new FilterBuilder()
    .fieldGte('rating', 4.5)
    .fieldGte('reviewCount', 10);

  // Combine reusable components
  return new FilterBuilder()
    .must({ type: 'Filter', filter: activeItemsFilter.build() })
    .must({ type: 'Filter', filter: highQualityFilter.build() })
    .fieldMatch('featured', true)
    .build();
}

/**
 * Example 25: Time-based filtering
 */
export function timeBasedFilterExample(): Filter {
  const now = Date.now() / 1000; // Unix timestamp in seconds
  const oneDayAgo = now - 86400;
  const oneWeekAgo = now - 604800;

  return new FilterBuilder()
    .fieldGte('createdAt', oneWeekAgo)
    .fieldLte('createdAt', now)
    .fieldGte('lastModified', oneDayAgo)
    .build();
}

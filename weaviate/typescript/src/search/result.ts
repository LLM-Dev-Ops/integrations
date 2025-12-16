/**
 * Search result handling and parsing
 *
 * Provides utilities for parsing and filtering search results.
 *
 * @module search/result
 */

import type { SearchResult, SearchHit } from '../types/search.js';
import type { Properties, PropertyValue } from '../types/property.js';
import { parseSearchResult, parseSearchHit } from '../graphql/parser.js';

/**
 * Parses a GraphQL search result
 *
 * Wrapper around the GraphQL parser with additional error handling.
 *
 * @param graphqlResponse - Raw GraphQL response data
 * @param className - Class name being queried
 * @returns Parsed search result
 *
 * @example
 * ```typescript
 * const result = parseSearchResultSafe(response, 'Article');
 * console.log(`Found ${result.objects.length} results`);
 * ```
 */
export function parseSearchResultSafe(
  graphqlResponse: unknown,
  className: string
): SearchResult {
  try {
    return parseSearchResult(graphqlResponse as Record<string, unknown>, className);
  } catch (error) {
    // Return empty result on parse error
    return {
      objects: [],
      totalCount: 0,
    };
  }
}

/**
 * Parses a single search hit
 *
 * Wrapper around the GraphQL parser with additional error handling.
 *
 * @param data - Raw hit data
 * @param className - Class name
 * @returns Parsed search hit or null if parsing fails
 *
 * @example
 * ```typescript
 * const hit = parseSearchHitSafe(data, 'Article');
 * if (hit) {
 *   console.log(hit.properties.title);
 * }
 * ```
 */
export function parseSearchHitSafe(
  data: Record<string, unknown>,
  className: string
): SearchHit | null {
  try {
    return parseSearchHit(data, className);
  } catch (error) {
    return null;
  }
}

/**
 * Filters properties from a search hit
 *
 * Returns only the requested properties from a properties object.
 *
 * @param properties - Full properties object
 * @param requested - Array of property names to include
 * @returns Filtered properties
 *
 * @example
 * ```typescript
 * const filtered = filterProperties(
 *   { title: 'Hello', content: 'World', author: 'John' },
 *   ['title', 'author']
 * );
 * // { title: 'Hello', author: 'John' }
 * ```
 */
export function filterProperties(
  properties: Properties,
  requested: string[]
): Properties {
  if (!requested || requested.length === 0) {
    return properties;
  }

  const filtered: Properties = {};
  for (const key of requested) {
    if (key in properties) {
      filtered[key] = properties[key];
    }
  }
  return filtered;
}

/**
 * Extracts a specific property value from a search hit
 *
 * @param hit - Search hit
 * @param propertyName - Property to extract
 * @returns Property value or undefined
 *
 * @example
 * ```typescript
 * const title = extractProperty(hit, 'title');
 * ```
 */
export function extractProperty(
  hit: SearchHit,
  propertyName: string
): PropertyValue | undefined {
  return hit.properties[propertyName];
}

/**
 * Sorts search hits by a property value
 *
 * @param hits - Array of search hits
 * @param propertyName - Property to sort by
 * @param ascending - Sort order (default: true)
 * @returns Sorted array
 *
 * @example
 * ```typescript
 * const sorted = sortByProperty(hits, 'title', true);
 * ```
 */
export function sortByProperty(
  hits: SearchHit[],
  propertyName: string,
  ascending = true
): SearchHit[] {
  return [...hits].sort((a, b) => {
    const aVal = a.properties[propertyName];
    const bVal = b.properties[propertyName];

    if (aVal === undefined && bVal === undefined) return 0;
    if (aVal === undefined) return ascending ? 1 : -1;
    if (bVal === undefined) return ascending ? -1 : 1;

    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return ascending
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal);
    }

    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return ascending ? aVal - bVal : bVal - aVal;
    }

    return 0;
  });
}

/**
 * Sorts search hits by relevance score
 *
 * @param hits - Array of search hits
 * @param descending - Sort order (default: true for highest score first)
 * @returns Sorted array
 *
 * @example
 * ```typescript
 * const sorted = sortByScore(hits); // Highest score first
 * ```
 */
export function sortByScore(
  hits: SearchHit[],
  descending = true
): SearchHit[] {
  return [...hits].sort((a, b) => {
    const aScore = a.score ?? a.certainty ?? 0;
    const bScore = b.score ?? b.certainty ?? 0;
    return descending ? bScore - aScore : aScore - bScore;
  });
}

/**
 * Sorts search hits by distance
 *
 * @param hits - Array of search hits
 * @param ascending - Sort order (default: true for closest first)
 * @returns Sorted array
 *
 * @example
 * ```typescript
 * const sorted = sortByDistance(hits); // Closest first
 * ```
 */
export function sortByDistance(
  hits: SearchHit[],
  ascending = true
): SearchHit[] {
  return [...hits].sort((a, b) => {
    const aDist = a.distance ?? Infinity;
    const bDist = b.distance ?? Infinity;
    return ascending ? aDist - bDist : bDist - aDist;
  });
}

/**
 * Filters search hits by minimum certainty
 *
 * @param hits - Array of search hits
 * @param minCertainty - Minimum certainty threshold (0-1)
 * @returns Filtered array
 *
 * @example
 * ```typescript
 * const filtered = filterByCertainty(hits, 0.7);
 * ```
 */
export function filterByCertainty(
  hits: SearchHit[],
  minCertainty: number
): SearchHit[] {
  return hits.filter((hit) => {
    if (hit.certainty === undefined) return false;
    return hit.certainty >= minCertainty;
  });
}

/**
 * Filters search hits by maximum distance
 *
 * @param hits - Array of search hits
 * @param maxDistance - Maximum distance threshold
 * @returns Filtered array
 *
 * @example
 * ```typescript
 * const filtered = filterByDistance(hits, 0.5);
 * ```
 */
export function filterByDistance(
  hits: SearchHit[],
  maxDistance: number
): SearchHit[] {
  return hits.filter((hit) => {
    if (hit.distance === undefined) return false;
    return hit.distance <= maxDistance;
  });
}

/**
 * Filters search hits by minimum score
 *
 * @param hits - Array of search hits
 * @param minScore - Minimum score threshold
 * @returns Filtered array
 *
 * @example
 * ```typescript
 * const filtered = filterByScore(hits, 0.8);
 * ```
 */
export function filterByScore(
  hits: SearchHit[],
  minScore: number
): SearchHit[] {
  return hits.filter((hit) => {
    if (hit.score === undefined) return false;
    return hit.score >= minScore;
  });
}

/**
 * Deduplicates search hits by ID
 *
 * @param hits - Array of search hits
 * @returns Deduplicated array (keeps first occurrence)
 *
 * @example
 * ```typescript
 * const unique = deduplicateHits(hits);
 * ```
 */
export function deduplicateHits(hits: SearchHit[]): SearchHit[] {
  const seen = new Set<string>();
  return hits.filter((hit) => {
    if (seen.has(hit.id)) {
      return false;
    }
    seen.add(hit.id);
    return true;
  });
}

/**
 * Merges multiple search results
 *
 * @param results - Array of search results to merge
 * @param deduplicate - Whether to remove duplicates (default: true)
 * @returns Merged search result
 *
 * @example
 * ```typescript
 * const merged = mergeSearchResults([result1, result2], true);
 * ```
 */
export function mergeSearchResults(
  results: SearchResult[],
  deduplicate = true
): SearchResult {
  let allObjects: SearchHit[] = [];
  let totalCount = 0;

  for (const result of results) {
    allObjects = allObjects.concat(result.objects);
    totalCount += result.totalCount ?? result.objects.length;
  }

  if (deduplicate) {
    allObjects = deduplicateHits(allObjects);
    totalCount = allObjects.length;
  }

  return {
    objects: allObjects,
    totalCount,
  };
}

/**
 * Paginates search hits
 *
 * @param hits - Array of search hits
 * @param page - Page number (0-indexed)
 * @param pageSize - Number of hits per page
 * @returns Paginated array
 *
 * @example
 * ```typescript
 * const page1 = paginateHits(hits, 0, 10); // First 10 results
 * const page2 = paginateHits(hits, 1, 10); // Next 10 results
 * ```
 */
export function paginateHits(
  hits: SearchHit[],
  page: number,
  pageSize: number
): SearchHit[] {
  const start = page * pageSize;
  const end = start + pageSize;
  return hits.slice(start, end);
}

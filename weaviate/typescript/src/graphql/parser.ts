/**
 * GraphQL response parser
 *
 * Parses GraphQL responses and converts them to typed TypeScript objects.
 */

import type { UUID, Properties, PropertyValue } from '../types/property.js';
import type { Vector } from '../types/vector.js';
import type { WeaviateObject } from '../types/object.js';
import type { SearchResult, SearchHit, SearchGroup } from '../types/search.js';
import type {
  AggregateResult,
  AggregateGroup,
  AggregateMeta,
  AggregateValue,
} from '../types/aggregate.js';
import { createUUID } from '../types/property.js';

/**
 * Parses a GraphQL Get query response
 *
 * @param response - Raw GraphQL response data
 * @param className - Class name being queried
 * @returns Parsed search result
 *
 * @example
 * ```typescript
 * const data = await executor.execute(query);
 * const result = parseGraphQLResponse(data, 'Article');
 * ```
 */
export function parseGraphQLResponse<T = SearchResult>(
  response: unknown,
  className: string
): T {
  if (!response || typeof response !== 'object') {
    throw new Error('Invalid GraphQL response: not an object');
  }

  const data = response as Record<string, unknown>;

  // Check if it's a Get query
  if ('Get' in data) {
    return parseSearchResult(data, className) as T;
  }

  // Check if it's an Aggregate query
  if ('Aggregate' in data) {
    return parseAggregateResult(data, className) as T;
  }

  throw new Error('Unknown GraphQL response type');
}

/**
 * Parses a Get query result into a SearchResult
 *
 * @param data - Raw response data
 * @param className - Class name
 * @returns SearchResult
 */
export function parseSearchResult(
  data: Record<string, unknown>,
  className: string
): SearchResult {
  const getData = data.Get as Record<string, unknown>;
  if (!getData) {
    throw new Error('Missing Get field in response');
  }

  const classData = getData[className];
  if (!Array.isArray(classData)) {
    throw new Error(`Missing or invalid ${className} field in Get response`);
  }

  const objects = classData.map((obj) => parseSearchHit(obj, className));

  return {
    objects,
    totalCount: objects.length,
  };
}

/**
 * Parses a single search hit
 *
 * @param data - Raw object data
 * @param className - Class name
 * @returns SearchHit
 */
export function parseSearchHit(
  data: Record<string, unknown>,
  className: string
): SearchHit {
  const additional = data._additional as Record<string, unknown> | undefined;

  // Extract properties (everything except _additional)
  const properties: Properties = {};
  for (const [key, value] of Object.entries(data)) {
    if (key !== '_additional') {
      properties[key] = parsePropertyValue(value);
    }
  }

  // Build search hit
  const hit: SearchHit = {
    id: parseUUID(additional?.id),
    className,
    properties,
  };

  // Add optional fields from _additional
  if (additional) {
    if (additional.vector) {
      hit.vector = parseVector(additional.vector);
    }

    if (typeof additional.certainty === 'number') {
      hit.certainty = additional.certainty;
    }

    if (typeof additional.distance === 'number') {
      hit.distance = additional.distance;
    }

    if (typeof additional.score === 'number') {
      hit.score = additional.score;
    }

    if (typeof additional.explainScore === 'string') {
      hit.explainScore = additional.explainScore;
    }

    // Store any other additional fields
    const knownFields = new Set([
      'id',
      'vector',
      'certainty',
      'distance',
      'score',
      'explainScore',
    ]);
    const otherFields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(additional)) {
      if (!knownFields.has(key)) {
        otherFields[key] = value;
      }
    }
    if (Object.keys(otherFields).length > 0) {
      hit.additional = otherFields;
    }
  }

  return hit;
}

/**
 * Parses an Aggregate query result
 *
 * @param data - Raw response data
 * @param className - Class name
 * @returns AggregateResult
 */
export function parseAggregateResult(
  data: Record<string, unknown>,
  className: string
): AggregateResult {
  const aggregateData = data.Aggregate as Record<string, unknown>;
  if (!aggregateData) {
    throw new Error('Missing Aggregate field in response');
  }

  const classData = aggregateData[className];
  if (!Array.isArray(classData)) {
    throw new Error(
      `Missing or invalid ${className} field in Aggregate response`
    );
  }

  const groups: AggregateGroup[] = [];
  let meta: AggregateMeta | undefined;

  for (const groupData of classData) {
    const group = parseAggregateGroup(
      groupData as Record<string, unknown>
    );
    groups.push(group);

    // Extract meta from first group (all groups have same meta count)
    if (!meta && groupData.meta) {
      meta = {
        count: (groupData.meta as Record<string, unknown>).count as number,
      };
    }
  }

  return {
    groups,
    meta,
  };
}

/**
 * Parses an aggregate group
 *
 * @param data - Raw group data
 * @returns AggregateGroup
 */
function parseAggregateGroup(data: Record<string, unknown>): AggregateGroup {
  const aggregations: Record<string, AggregateValue> = {};
  let groupedBy: Properties | undefined;
  let count = 0;

  for (const [key, value] of Object.entries(data)) {
    if (key === 'meta') {
      const meta = value as Record<string, unknown>;
      count = (meta.count as number) ?? 0;
    } else if (key === 'groupedBy') {
      const grouped = value as Record<string, unknown>;
      groupedBy = {
        [grouped.path as string]: grouped.value as PropertyValue,
      };
    } else {
      // Aggregation field
      aggregations[key] = parseAggregateValue(
        value as Record<string, unknown>
      );
    }
  }

  return {
    groupedBy,
    aggregations,
    count,
  };
}

/**
 * Parses an aggregate value
 *
 * @param data - Raw aggregate data
 * @returns AggregateValue
 */
function parseAggregateValue(
  data: Record<string, unknown>
): AggregateValue {
  // If it has numeric aggregation fields
  if ('mean' in data || 'sum' in data || 'median' in data) {
    return {
      count: data.count as number | undefined,
      sum: data.sum as number | undefined,
      mean: data.mean as number | undefined,
      median: data.median as number | undefined,
      mode: data.mode as number | undefined,
      minimum: data.minimum as number | undefined,
      maximum: data.maximum as number | undefined,
    };
  }

  // If it has text aggregation fields
  if ('topOccurrences' in data || 'type' in data) {
    return {
      count: data.count as number | undefined,
      type: data.type as any,
      topOccurrences: data.topOccurrences as any,
    };
  }

  // If it has boolean aggregation fields
  if ('totalTrue' in data || 'totalFalse' in data) {
    return {
      count: data.count as number | undefined,
      totalTrue: data.totalTrue as number | undefined,
      totalFalse: data.totalFalse as number | undefined,
      percentageTrue: data.percentageTrue as number | undefined,
      percentageFalse: data.percentageFalse as number | undefined,
    };
  }

  // If it has reference aggregation
  if ('pointingTo' in data) {
    return {
      pointingTo: data.pointingTo as number | undefined,
      type: data.type as string | undefined,
    };
  }

  // Single value
  if ('count' in data && Object.keys(data).length === 1) {
    return data.count as number;
  }

  return data as AggregateValue;
}

/**
 * Parses a WeaviateObject from GraphQL response
 *
 * @param data - Raw object data
 * @returns WeaviateObject
 */
export function parseObject(data: Record<string, unknown>): WeaviateObject {
  const additional = data._additional as Record<string, unknown> | undefined;

  // Extract properties
  const properties: Properties = {};
  for (const [key, value] of Object.entries(data)) {
    if (key !== '_additional' && key !== 'id' && key !== 'class') {
      properties[key] = parsePropertyValue(value);
    }
  }

  const obj: WeaviateObject = {
    id: parseUUID(data.id ?? additional?.id),
    className: (data.class as string) ?? 'unknown',
    properties,
  };

  if (additional?.vector) {
    obj.vector = parseVector(additional.vector);
  }

  if (additional?.creationTimeUnix) {
    obj.creationTime = parseUnixTimestamp(
      additional.creationTimeUnix as number
    );
  }

  if (additional?.lastUpdateTimeUnix) {
    obj.updateTime = parseUnixTimestamp(
      additional.lastUpdateTimeUnix as number
    );
  }

  return obj;
}

/**
 * Parses a property value from GraphQL
 *
 * @param value - Raw property value
 * @returns Typed property value
 */
function parsePropertyValue(value: unknown): PropertyValue {
  if (value === null || value === undefined) {
    return null;
  }

  if (Array.isArray(value)) {
    return value.map((v) => parsePropertyValue(v)) as PropertyValue;
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;

    // Check for beacon (cross-reference)
    if ('beacon' in obj) {
      return [obj] as PropertyValue; // References are always arrays
    }

    // Return as-is (could be GeoCoordinates, PhoneNumber, etc.)
    return obj as PropertyValue;
  }

  return value as PropertyValue;
}

/**
 * Parses a UUID from various formats
 *
 * @param value - UUID value
 * @returns UUID
 */
function parseUUID(value: unknown): UUID {
  if (typeof value === 'string') {
    return createUUID(value);
  }

  throw new Error(`Invalid UUID: ${value}`);
}

/**
 * Parses a vector from GraphQL response
 *
 * @param value - Vector value
 * @returns Vector array
 */
function parseVector(value: unknown): Vector {
  if (Array.isArray(value)) {
    return value as Vector;
  }

  throw new Error('Invalid vector format');
}

/**
 * Parses a Unix timestamp (milliseconds) to Date
 *
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Date object
 */
function parseUnixTimestamp(timestamp: number): Date {
  return new Date(timestamp);
}

/**
 * Parses search results with groups
 *
 * @param data - Raw response data
 * @param className - Class name
 * @returns SearchResult with groups
 */
export function parseGroupedSearchResult(
  data: Record<string, unknown>,
  className: string
): SearchResult {
  const getData = data.Get as Record<string, unknown>;
  if (!getData) {
    throw new Error('Missing Get field in response');
  }

  const classData = getData[className];
  if (!Array.isArray(classData)) {
    throw new Error(`Missing or invalid ${className} field in Get response`);
  }

  const groups: SearchGroup[] = [];
  const allObjects: SearchHit[] = [];

  for (const groupData of classData) {
    const group = parseSearchGroup(groupData as Record<string, unknown>, className);
    groups.push(group);
    allObjects.push(...group.hits);
  }

  return {
    objects: allObjects,
    groups,
    totalCount: allObjects.length,
  };
}

/**
 * Parses a search group
 */
function parseSearchGroup(
  data: Record<string, unknown>,
  className: string
): SearchGroup {
  const groupedBy = data._additional?.group as Record<string, unknown>;

  const hits: SearchHit[] = [];
  if (data.hits && Array.isArray(data.hits)) {
    for (const hit of data.hits) {
      hits.push(parseSearchHit(hit as Record<string, unknown>, className));
    }
  }

  return {
    groupedBy: {
      path: (groupedBy?.groupedBy?.path as string[]) ?? [],
      value: groupedBy?.groupedBy?.value as unknown,
    },
    hits,
    maxDistance: groupedBy?.maxDistance as number | undefined,
    minDistance: groupedBy?.minDistance as number | undefined,
    numberOfObjects: hits.length,
  };
}

/**
 * Aggregation result parsing
 *
 * Parses GraphQL aggregation responses into typed result structures.
 */

import type {
  AggregateResult,
  AggregateGroup,
  AggregateValue,
  NumericAggregation,
  TextAggregation,
  BooleanAggregation,
  DateAggregation,
  ReferenceAggregation,
  OccurrenceCount,
  TypeCount,
  Aggregation,
} from '../types/aggregate.js';
import type { Properties, PropertyValue } from '../types/property.js';

/**
 * Parses a GraphQL aggregation response
 *
 * @param data - Raw GraphQL response data
 * @param className - Name of the class that was aggregated
 * @returns Parsed aggregation result
 *
 * @example
 * ```typescript
 * const data = {
 *   Aggregate: {
 *     Article: [
 *       {
 *         meta: { count: 150 },
 *         groupedBy: { path: ["category"], value: "Technology" },
 *         wordCount: { mean: 850, count: 150 }
 *       }
 *     ]
 *   }
 * };
 *
 * const result = parseAggregateResult(data, "Article");
 * ```
 */
export function parseAggregateResult(
  data: any,
  className: string
): AggregateResult {
  // Navigate to the aggregation data
  const aggregateData = data?.Aggregate?.[className];

  if (!aggregateData || !Array.isArray(aggregateData)) {
    return {
      groups: [],
      meta: { count: 0 },
    };
  }

  // Parse each group
  const groups = aggregateData.map((groupData: any) =>
    parseAggregateGroup(groupData)
  );

  // Extract overall meta count (from first group if available)
  const meta = aggregateData[0]?.meta
    ? { count: aggregateData[0].meta.count }
    : undefined;

  return {
    groups,
    meta,
  };
}

/**
 * Parses a single aggregation group
 *
 * @param data - Raw group data from GraphQL
 * @returns Parsed aggregation group
 */
export function parseAggregateGroup(data: any): AggregateGroup {
  const group: AggregateGroup = {
    aggregations: {},
    count: data.meta?.count ?? 0,
  };

  // Parse groupedBy values
  if (data.groupedBy) {
    group.groupedBy = parseGroupedBy(data.groupedBy);
  }

  // Parse aggregation fields
  for (const [key, value] of Object.entries(data)) {
    // Skip meta and groupedBy
    if (key === 'meta' || key === 'groupedBy') {
      continue;
    }

    // Parse the aggregation value
    group.aggregations[key] = parsePropertyAggregation(value);
  }

  return group;
}

/**
 * Parses groupedBy field into Properties
 *
 * @param groupedBy - Raw groupedBy data
 * @returns Properties object
 */
function parseGroupedBy(groupedBy: any): Properties {
  const properties: Properties = {};

  if (Array.isArray(groupedBy)) {
    // Array of { path, value } objects
    for (const item of groupedBy) {
      if (item.path && item.path.length > 0) {
        const propertyName = item.path[item.path.length - 1];
        properties[propertyName] = parsePropertyValue(item.value);
      }
    }
  } else if (groupedBy.path && groupedBy.value !== undefined) {
    // Single { path, value } object
    const propertyName = groupedBy.path[groupedBy.path.length - 1];
    properties[propertyName] = parsePropertyValue(groupedBy.value);
  }

  return properties;
}

/**
 * Parses a property value from groupedBy
 *
 * @param value - Raw value
 * @returns Parsed property value
 */
function parsePropertyValue(value: any): PropertyValue {
  if (value === null || value === undefined) {
    return null;
  }

  // Try to parse as date
  if (typeof value === 'string' && isISODateString(value)) {
    return new Date(value);
  }

  return value;
}

/**
 * Parses aggregation results for a single property
 *
 * @param data - Raw aggregation data for the property
 * @returns Parsed aggregate value
 */
function parsePropertyAggregation(data: any): AggregateValue {
  if (data === null || data === undefined) {
    return null;
  }

  // Check what type of aggregation this is based on fields present
  const hasNumeric =
    'mean' in data || 'sum' in data || 'median' in data || 'mode' in data;
  const hasText = 'topOccurrences' in data || 'type' in data;
  const hasBoolean = 'totalTrue' in data || 'totalFalse' in data;
  const hasReference = 'pointingTo' in data;

  if (hasNumeric) {
    return extractNumericAggregation(data);
  }

  if (hasBoolean) {
    return extractBooleanAggregation(data);
  }

  if (hasText) {
    return extractTextAggregation(data);
  }

  if (hasReference) {
    return extractReferenceAggregation(data);
  }

  // Check if it has date-like fields
  if ('minimum' in data || 'maximum' in data) {
    // Could be numeric or date - check the actual values
    if (
      typeof data.minimum === 'string' &&
      isISODateString(data.minimum)
    ) {
      return extractDateAggregation(data);
    }
    return extractNumericAggregation(data);
  }

  // Fallback - return as-is
  return data;
}

/**
 * Extracts numeric aggregation results
 *
 * @param data - Raw numeric aggregation data
 * @returns NumericAggregation
 */
export function extractNumericAggregation(data: any): NumericAggregation {
  return {
    count: data.count,
    sum: data.sum,
    mean: data.mean,
    median: data.median,
    mode: data.mode,
    minimum: data.minimum,
    maximum: data.maximum,
  };
}

/**
 * Extracts text aggregation results
 *
 * @param data - Raw text aggregation data
 * @returns TextAggregation
 */
export function extractTextAggregation(data: any): TextAggregation {
  const result: TextAggregation = {
    count: data.count,
  };

  if (data.type) {
    result.type = extractTypeCount(data.type);
  }

  if (data.topOccurrences) {
    result.topOccurrences = extractTopOccurrences(data.topOccurrences);
  }

  return result;
}

/**
 * Extracts boolean aggregation results
 *
 * @param data - Raw boolean aggregation data
 * @returns BooleanAggregation
 */
export function extractBooleanAggregation(data: any): BooleanAggregation {
  return {
    count: data.count,
    totalTrue: data.totalTrue,
    totalFalse: data.totalFalse,
    percentageTrue: data.percentageTrue,
    percentageFalse: data.percentageFalse,
  };
}

/**
 * Extracts date aggregation results
 *
 * @param data - Raw date aggregation data
 * @returns DateAggregation
 */
export function extractDateAggregation(data: any): DateAggregation {
  return {
    count: data.count,
    minimum: data.minimum ? new Date(data.minimum) : undefined,
    maximum: data.maximum ? new Date(data.maximum) : undefined,
    mode: data.mode ? new Date(data.mode) : undefined,
    median: data.median ? new Date(data.median) : undefined,
  };
}

/**
 * Extracts reference aggregation results
 *
 * @param data - Raw reference aggregation data
 * @returns ReferenceAggregation
 */
function extractReferenceAggregation(data: any): ReferenceAggregation {
  return {
    pointingTo: data.pointingTo,
    type: data.type,
  };
}

/**
 * Extracts top occurrences from raw data
 *
 * @param data - Raw top occurrences data
 * @returns Array of occurrence counts
 */
export function extractTopOccurrences(data: any): OccurrenceCount[] {
  if (!Array.isArray(data)) {
    return [];
  }

  return data.map((item: any) => ({
    value: parsePropertyValue(item.value),
    count: item.occurs ?? 0,
  }));
}

/**
 * Extracts type counts from raw data
 *
 * @param data - Raw type count data
 * @returns Array of type counts
 */
function extractTypeCount(data: any): TypeCount[] {
  if (!Array.isArray(data)) {
    return [];
  }

  return data.map((item: any) => ({
    type: item.type ?? 'unknown',
    count: item.count ?? 0,
  }));
}

/**
 * Checks if a string appears to be an ISO date string
 *
 * @param str - String to check
 * @returns True if the string looks like an ISO date
 */
function isISODateString(str: string): boolean {
  // Basic check for ISO 8601 format
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(str);
}

/**
 * Parses aggregation value based on aggregation type
 *
 * Used by the builder to help parse expected results.
 *
 * @param data - Raw aggregation data
 * @param aggregationType - The type of aggregation
 * @returns Parsed aggregate value
 */
export function parseAggregateValue(
  data: any,
  aggregationType: Aggregation
): AggregateValue {
  switch (aggregationType) {
    case Aggregation.Count:
    case Aggregation.Sum:
    case Aggregation.Mean:
    case Aggregation.Median:
    case Aggregation.Mode:
    case Aggregation.Minimum:
    case Aggregation.Maximum:
      return extractNumericAggregation(data);

    case Aggregation.TopOccurrences:
      return extractTopOccurrences(data);

    case Aggregation.Type:
      return extractTextAggregation(data);

    case Aggregation.PointingTo:
      return extractReferenceAggregation(data);

    default:
      return data;
  }
}

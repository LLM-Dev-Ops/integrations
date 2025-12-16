/**
 * GraphQL query builder for aggregations
 *
 * Builds GraphQL queries for Weaviate aggregation operations.
 */

import type { AggregateQuery, AggregateField, Aggregation } from '../types/aggregate.js';
import type { WhereFilter } from '../types/filter.js';
import { serializeFilterGraphQL } from '../graphql/filter-builder.js';

/**
 * Builds a complete aggregation GraphQL query
 *
 * @param query - The aggregation query configuration
 * @returns GraphQL query string
 *
 * @example
 * ```typescript
 * const query: AggregateQuery = {
 *   className: "Article",
 *   groupBy: ["category"],
 *   fields: [
 *     { property: "wordCount", aggregations: [Aggregation.Mean, Aggregation.Sum] }
 *   ]
 * };
 *
 * const graphql = buildAggregateQuery(query);
 * ```
 */
export function buildAggregateQuery(query: AggregateQuery): string {
  const parts: string[] = [];

  // Build groupBy clause
  if (query.groupBy && query.groupBy.length > 0) {
    const paths = query.groupBy.map((p) => `"${escapeString(p)}"`).join(', ');
    parts.push(`groupBy: [${paths}]`);
  }

  // Build where clause
  if (query.filter) {
    const whereClause = buildWhereClause(query.filter);
    parts.push(`where: ${whereClause}`);
  }

  // Build tenant clause
  if (query.tenant) {
    parts.push(`tenant: "${escapeString(query.tenant)}"`);
  }

  // Build objectLimit clause
  if (query.objectLimit !== undefined) {
    parts.push(`objectLimit: ${query.objectLimit}`);
  }

  // Build limit clause
  if (query.limit !== undefined) {
    parts.push(`limit: ${query.limit}`);
  }

  const argsClause = parts.length > 0 ? `(${parts.join(', ')})` : '';

  // Build field selections
  const fieldClauses = query.fields.map((f) => buildAggregateField(f)).join('\n      ');

  // Build meta and groupedBy selections
  const metaSelection = 'meta { count }';
  const groupedBySelection =
    query.groupBy && query.groupBy.length > 0 ? 'groupedBy { path value }' : '';

  // Compose full query
  return `{
  Aggregate {
    ${query.className}${argsClause} {
      ${metaSelection}
      ${groupedBySelection}
      ${fieldClauses}
    }
  }
}`;
}

/**
 * Builds a GraphQL field clause for a single aggregation field
 *
 * @param field - The aggregation field configuration
 * @returns GraphQL field string
 *
 * @example
 * ```typescript
 * const field: AggregateField = {
 *   property: "price",
 *   aggregations: [Aggregation.Mean, Aggregation.Minimum, Aggregation.Maximum]
 * };
 *
 * const graphql = buildAggregateField(field);
 * // Returns: "price { mean minimum maximum }"
 * ```
 */
export function buildAggregateField(field: AggregateField): string {
  const aggClauses = field.aggregations
    .map((agg) => buildAggregationClause(agg, field.topOccurrencesConfig))
    .join(' ');

  return `${field.property} { ${aggClauses} }`;
}

/**
 * Builds a GraphQL clause for a single aggregation operation
 *
 * @param aggregation - The aggregation type
 * @param topOccurrencesConfig - Optional config for TopOccurrences
 * @returns GraphQL aggregation clause
 *
 * @example
 * ```typescript
 * buildAggregationClause(Aggregation.Mean); // "mean"
 * buildAggregationClause(Aggregation.TopOccurrences, { limit: 5 }); // "topOccurrences(limit: 5) { value occurs }"
 * ```
 */
export function buildAggregationClause(
  aggregation: Aggregation,
  topOccurrencesConfig?: { limit: number }
): string {
  switch (aggregation) {
    case Aggregation.Count:
      return 'count';
    case Aggregation.Sum:
      return 'sum';
    case Aggregation.Mean:
      return 'mean';
    case Aggregation.Median:
      return 'median';
    case Aggregation.Mode:
      return 'mode';
    case Aggregation.Minimum:
      return 'minimum';
    case Aggregation.Maximum:
      return 'maximum';
    case Aggregation.Type:
      return 'type';
    case Aggregation.TopOccurrences: {
      const limit = topOccurrencesConfig?.limit ?? 5;
      return `topOccurrences(limit: ${limit}) { value occurs }`;
    }
    case Aggregation.PointingTo:
      return 'pointingTo';
    default:
      throw new Error(`Unknown aggregation type: ${aggregation}`);
  }
}

/**
 * Builds a where clause from a filter
 *
 * @param filter - The filter to serialize
 * @returns GraphQL where clause string
 */
export function buildWhereClause(filter: WhereFilter): string {
  return serializeFilterGraphQL(filter);
}

/**
 * Escapes special characters in strings for GraphQL
 *
 * @param str - String to escape
 * @returns Escaped string
 */
function escapeString(str: string): string {
  return str
    .replace(/\\/g, '\\\\') // Backslash
    .replace(/"/g, '\\"') // Double quote
    .replace(/\n/g, '\\n') // Newline
    .replace(/\r/g, '\\r') // Carriage return
    .replace(/\t/g, '\\t'); // Tab
}

/**
 * Builds a simple count query
 *
 * @param className - Name of the class
 * @param filter - Optional filter
 * @param tenant - Optional tenant
 * @returns GraphQL query string
 */
export function buildCountQuery(
  className: string,
  filter?: WhereFilter,
  tenant?: string
): string {
  const parts: string[] = [];

  if (filter) {
    const whereClause = buildWhereClause(filter);
    parts.push(`where: ${whereClause}`);
  }

  if (tenant) {
    parts.push(`tenant: "${escapeString(tenant)}"`);
  }

  const argsClause = parts.length > 0 ? `(${parts.join(', ')})` : '';

  return `{
  Aggregate {
    ${className}${argsClause} {
      meta { count }
    }
  }
}`;
}

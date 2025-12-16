/**
 * GraphQL query builders
 *
 * Fluent builders for constructing GraphQL queries for Get and Aggregate operations.
 */

import type { WhereFilter } from '../types/filter.js';
import type { Vector } from '../types/vector.js';
import type { UUID } from '../types/property.js';
import type { MoveParams, FusionType, GroupByConfig } from '../types/search.js';
import type { Aggregation } from '../types/aggregate.js';
import { serializeFilterGraphQL } from './filter-builder.js';
import {
  buildNearVectorClause,
  buildNearTextClause,
  buildNearObjectClause,
  buildHybridClause,
  buildBm25Clause,
  buildGroupByClause,
  buildAutocutClause,
} from './search-builder.js';

/**
 * Builder for GraphQL Get queries
 *
 * Provides a fluent interface for constructing search queries.
 *
 * @example
 * ```typescript
 * const query = new GetQueryBuilder('Article')
 *   .nearVector([0.1, 0.2, 0.3], { certainty: 0.7 })
 *   .where(filter)
 *   .limit(10)
 *   .properties(['title', 'content'])
 *   .additional(['id', 'distance'])
 *   .build();
 * ```
 */
export class GetQueryBuilder {
  private _className?: string;
  private _searchClause?: string;
  private _whereClause?: string;
  private _limitValue?: number;
  private _offsetValue?: number;
  private _properties: string[] = [];
  private _additionalFields: string[] = [];
  private _tenantName?: string;
  private _groupByConfig?: GroupByConfig;
  private _autocutValue?: number;

  /**
   * Creates a new Get query builder
   *
   * @param className - Optional class name (can be set later)
   */
  constructor(className?: string) {
    this._className = className;
  }

  /**
   * Sets the class name
   */
  className(name: string): this {
    this._className = name;
    return this;
  }

  /**
   * Adds a nearVector search clause
   *
   * @param vector - Query vector
   * @param options - Search options (certainty, distance)
   */
  nearVector(
    vector: Vector,
    options?: { certainty?: number; distance?: number }
  ): this {
    this._searchClause = buildNearVectorClause(
      vector,
      options?.certainty,
      options?.distance
    );
    return this;
  }

  /**
   * Adds a nearText search clause
   *
   * @param concepts - Text concepts to search for
   * @param options - Search options
   */
  nearText(
    concepts: string[],
    options?: {
      certainty?: number;
      distance?: number;
      moveTo?: MoveParams;
      moveAway?: MoveParams;
    }
  ): this {
    this._searchClause = buildNearTextClause(
      concepts,
      options?.certainty,
      options?.distance,
      options?.moveTo,
      options?.moveAway
    );
    return this;
  }

  /**
   * Adds a nearObject search clause
   *
   * @param id - Object UUID
   * @param className - Object class name
   * @param options - Search options
   */
  nearObject(
    id: UUID,
    className: string,
    options?: { certainty?: number; distance?: number }
  ): this {
    this._searchClause = buildNearObjectClause(
      id,
      className,
      options?.certainty,
      options?.distance
    );
    return this;
  }

  /**
   * Adds a hybrid search clause
   *
   * @param query - Text query
   * @param options - Search options
   */
  hybrid(
    query: string,
    options?: {
      vector?: Vector;
      alpha?: number;
      fusionType?: FusionType;
    }
  ): this {
    this._searchClause = buildHybridClause(
      query,
      options?.vector,
      options?.alpha,
      options?.fusionType
    );
    return this;
  }

  /**
   * Adds a BM25 search clause
   *
   * @param query - Text query
   * @param properties - Properties to search in
   */
  bm25(query: string, properties?: string[]): this {
    this._searchClause = buildBm25Clause(query, properties);
    return this;
  }

  /**
   * Adds a where filter clause
   *
   * @param filter - Filter to apply
   */
  where(filter: WhereFilter): this {
    this._whereClause = `where: ${serializeFilterGraphQL(filter)}`;
    return this;
  }

  /**
   * Sets the limit
   *
   * @param limit - Maximum number of results
   */
  limit(limit: number): this {
    this._limitValue = limit;
    return this;
  }

  /**
   * Sets the offset
   *
   * @param offset - Number of results to skip
   */
  offset(offset: number): this {
    this._offsetValue = offset;
    return this;
  }

  /**
   * Sets the properties to return
   *
   * @param properties - Array of property names
   */
  properties(properties: string[]): this {
    this._properties = properties;
    return this;
  }

  /**
   * Sets additional fields to return
   *
   * @param fields - Array of additional field names
   *
   * Common fields: 'id', 'vector', 'certainty', 'distance', 'score',
   * 'explainScore', 'creationTimeUnix', 'lastUpdateTimeUnix'
   */
  additional(fields: string[]): this {
    this._additionalFields = fields;
    return this;
  }

  /**
   * Sets the tenant name
   *
   * @param tenant - Tenant name for multi-tenant collections
   */
  tenant(tenant: string): this {
    this._tenantName = tenant;
    return this;
  }

  /**
   * Sets group by configuration
   *
   * @param config - Group by configuration
   */
  groupBy(config: GroupByConfig): this {
    this._groupByConfig = config;
    return this;
  }

  /**
   * Sets autocut value
   *
   * @param autocut - Autocut threshold
   */
  autocut(autocut: number): this {
    this._autocutValue = autocut;
    return this;
  }

  /**
   * Builds the GraphQL query string
   *
   * @returns Complete GraphQL query
   */
  build(): string {
    if (!this._className) {
      throw new Error('Class name is required');
    }

    // Build arguments
    const args: string[] = [];

    if (this._searchClause) {
      args.push(this._searchClause);
    }

    if (this._whereClause) {
      args.push(this._whereClause);
    }

    if (this._limitValue !== undefined) {
      args.push(`limit: ${this._limitValue}`);
    }

    if (this._offsetValue !== undefined && this._offsetValue > 0) {
      args.push(`offset: ${this._offsetValue}`);
    }

    if (this._tenantName) {
      args.push(`tenant: "${this._tenantName}"`);
    }

    if (this._groupByConfig) {
      args.push(
        buildGroupByClause(
          this._groupByConfig.path,
          this._groupByConfig.groups,
          this._groupByConfig.objectsPerGroup
        )
      );
    }

    if (this._autocutValue !== undefined) {
      args.push(buildAutocutClause(this._autocutValue));
    }

    const argsStr = args.length > 0 ? `(${args.join(', ')})` : '';

    // Build fields
    const fields: string[] = [...this._properties];

    if (this._additionalFields.length > 0) {
      const additionalStr = this._additionalFields.join(' ');
      fields.push(`_additional { ${additionalStr} }`);
    }

    const fieldsStr = fields.join(' ');

    // Compose query
    return `{
  Get {
    ${this._className}${argsStr} {
      ${fieldsStr}
    }
  }
}`;
  }
}

/**
 * Builder for GraphQL Aggregate queries
 *
 * Provides a fluent interface for constructing aggregation queries.
 *
 * @example
 * ```typescript
 * const query = new AggregateQueryBuilder('Product')
 *   .groupBy(['category'])
 *   .field('price', [Aggregation.Mean, Aggregation.Count])
 *   .where(filter)
 *   .build();
 * ```
 */
export class AggregateQueryBuilder {
  private _className?: string;
  private _groupByPaths?: string[];
  private _whereClause?: string;
  private _tenantName?: string;
  private _fields: Map<string, string[]> = new Map();

  /**
   * Creates a new Aggregate query builder
   *
   * @param className - Optional class name
   */
  constructor(className?: string) {
    this._className = className;
  }

  /**
   * Sets the class name
   */
  className(name: string): this {
    this._className = name;
    return this;
  }

  /**
   * Sets properties to group by
   *
   * @param paths - Array of property paths
   */
  groupBy(paths: string[]): this {
    this._groupByPaths = paths;
    return this;
  }

  /**
   * Adds a where filter clause
   *
   * @param filter - Filter to apply
   */
  where(filter: WhereFilter): this {
    this._whereClause = `where: ${serializeFilterGraphQL(filter)}`;
    return this;
  }

  /**
   * Sets the tenant name
   *
   * @param tenant - Tenant name
   */
  tenant(tenant: string): this {
    this._tenantName = tenant;
    return this;
  }

  /**
   * Adds a field to aggregate
   *
   * @param property - Property name
   * @param aggregations - Aggregation operations
   */
  field(property: string, aggregations: Aggregation[]): this {
    const aggStrings = aggregations.map((agg) => {
      if (agg === Aggregation.TopOccurrences) {
        return 'topOccurrences(limit: 5) { value occurs }';
      }
      return agg;
    });

    this._fields.set(property, aggStrings);
    return this;
  }

  /**
   * Builds the GraphQL query string
   *
   * @returns Complete GraphQL query
   */
  build(): string {
    if (!this._className) {
      throw new Error('Class name is required');
    }

    // Build arguments
    const args: string[] = [];

    if (this._groupByPaths && this._groupByPaths.length > 0) {
      const pathsStr = this._groupByPaths.map((p) => `"${p}"`).join(', ');
      args.push(`groupBy: [${pathsStr}]`);
    }

    if (this._whereClause) {
      args.push(this._whereClause);
    }

    if (this._tenantName) {
      args.push(`tenant: "${this._tenantName}"`);
    }

    const argsStr = args.length > 0 ? `(${args.join(', ')})` : '';

    // Build fields
    const fields: string[] = ['meta { count }'];

    if (this._groupByPaths && this._groupByPaths.length > 0) {
      fields.push('groupedBy { path value }');
    }

    // Add aggregation fields
    for (const [property, aggregations] of this._fields) {
      const aggStr = aggregations.join(' ');
      fields.push(`${property} { ${aggStr} }`);
    }

    const fieldsStr = fields.join('\n      ');

    // Compose query
    return `{
  Aggregate {
    ${this._className}${argsStr} {
      ${fieldsStr}
    }
  }
}`;
  }
}

/**
 * Creates a new Get query builder
 *
 * @param className - Class name
 * @returns GetQueryBuilder instance
 */
export function createGetQueryBuilder(className?: string): GetQueryBuilder {
  return new GetQueryBuilder(className);
}

/**
 * Creates a new Aggregate query builder
 *
 * @param className - Class name
 * @returns AggregateQueryBuilder instance
 */
export function createAggregateQueryBuilder(
  className?: string
): AggregateQueryBuilder {
  return new AggregateQueryBuilder(className);
}

/**
 * GraphQL module usage examples
 *
 * This file demonstrates various usage patterns for the GraphQL module.
 * These are examples only - not runnable tests.
 */

import {
  GetQueryBuilder,
  AggregateQueryBuilder,
  GraphQLExecutor,
  parseGraphQLResponse,
  parseAggregateResult,
} from './index.js';
import { FilterOperator } from '../types/filter.js';
import { Aggregation } from '../types/aggregate.js';
import { FusionType } from '../types/search.js';
import type { UUID } from '../types/property.js';

/**
 * Example 1: Basic vector similarity search
 */
export function example1_VectorSearch() {
  const query = new GetQueryBuilder('Article')
    .nearVector([0.1, 0.2, 0.3, 0.4], { certainty: 0.7 })
    .limit(10)
    .properties(['title', 'content', 'publishDate'])
    .additional(['id', 'distance', 'certainty'])
    .build();

  console.log('Example 1 - Vector Search Query:');
  console.log(query);
  /*
  Output:
  {
    Get {
      Article(
        nearVector: { vector: [0.1, 0.2, 0.3, 0.4], certainty: 0.7 }
        limit: 10
      ) {
        title content publishDate
        _additional { id distance certainty }
      }
    }
  }
  */
}

/**
 * Example 2: Semantic text search with move parameters
 */
export function example2_NearText() {
  const query = new GetQueryBuilder('Article')
    .nearText(['artificial intelligence', 'machine learning'], {
      certainty: 0.7,
      moveTo: {
        concepts: ['neural networks', 'deep learning'],
        force: 0.5,
      },
      moveAway: {
        concepts: ['statistics'],
        force: 0.3,
      },
    })
    .limit(20)
    .properties(['title', 'summary', 'author'])
    .additional(['id', 'certainty'])
    .build();

  console.log('Example 2 - Near Text Query:');
  console.log(query);
}

/**
 * Example 3: Hybrid search (combining keyword and vector)
 */
export function example3_HybridSearch() {
  const query = new GetQueryBuilder('Product')
    .hybrid('laptop computer', {
      alpha: 0.5, // 50% vector, 50% keyword
      fusionType: FusionType.RankedFusion,
    })
    .limit(15)
    .properties(['name', 'description', 'price'])
    .additional(['id', 'score', 'explainScore'])
    .build();

  console.log('Example 3 - Hybrid Search Query:');
  console.log(query);
}

/**
 * Example 4: BM25 keyword search
 */
export function example4_BM25Search() {
  const query = new GetQueryBuilder('Document')
    .bm25('open source software', ['title', 'content'])
    .limit(10)
    .properties(['title', 'content', 'tags'])
    .additional(['id', 'score'])
    .build();

  console.log('Example 4 - BM25 Search Query:');
  console.log(query);
}

/**
 * Example 5: Search with complex filters
 */
export function example5_FilteredSearch() {
  const query = new GetQueryBuilder('Product')
    .nearVector([0.5, 0.6, 0.7])
    .where({
      operator: 'And',
      operands: [
        {
          operator: 'Operand',
          operand: {
            path: ['price'],
            operator: FilterOperator.LessThan,
            value: 1000,
          },
        },
        {
          operator: 'Operand',
          operand: {
            path: ['inStock'],
            operator: FilterOperator.Equal,
            value: true,
          },
        },
        {
          operator: 'Or',
          operands: [
            {
              operator: 'Operand',
              operand: {
                path: ['category'],
                operator: FilterOperator.Equal,
                value: 'Electronics',
              },
            },
            {
              operator: 'Operand',
              operand: {
                path: ['category'],
                operator: FilterOperator.Equal,
                value: 'Computers',
              },
            },
          ],
        },
      ],
    })
    .limit(10)
    .properties(['name', 'price', 'category'])
    .additional(['id', 'distance'])
    .build();

  console.log('Example 5 - Filtered Search Query:');
  console.log(query);
}

/**
 * Example 6: Near object search (find similar to existing object)
 */
export function example6_NearObject() {
  const referenceId = '123e4567-e89b-12d3-a456-426614174000' as UUID;

  const query = new GetQueryBuilder('Article')
    .nearObject(referenceId, 'Article', { certainty: 0.7 })
    .limit(5)
    .properties(['title', 'content'])
    .additional(['id', 'certainty'])
    .build();

  console.log('Example 6 - Near Object Query:');
  console.log(query);
}

/**
 * Example 7: Multi-tenant query
 */
export function example7_MultiTenant() {
  const query = new GetQueryBuilder('Document')
    .nearVector([0.1, 0.2, 0.3])
    .tenant('customer-abc-123')
    .limit(10)
    .properties(['title', 'content'])
    .additional(['id', 'distance'])
    .build();

  console.log('Example 7 - Multi-Tenant Query:');
  console.log(query);
}

/**
 * Example 8: Grouped search results
 */
export function example8_GroupedResults() {
  const query = new GetQueryBuilder('Article')
    .nearVector([0.1, 0.2, 0.3])
    .groupBy({
      path: ['category'],
      groups: 5,
      objectsPerGroup: 3,
    })
    .properties(['title', 'category'])
    .additional(['id', 'distance'])
    .build();

  console.log('Example 8 - Grouped Results Query:');
  console.log(query);
}

/**
 * Example 9: Aggregation by category
 */
export function example9_Aggregation() {
  const query = new AggregateQueryBuilder('Product')
    .groupBy(['category'])
    .field('price', [
      Aggregation.Mean,
      Aggregation.Minimum,
      Aggregation.Maximum,
      Aggregation.Count,
    ])
    .field('rating', [Aggregation.Mean, Aggregation.Median])
    .build();

  console.log('Example 9 - Aggregation Query:');
  console.log(query);
  /*
  Output:
  {
    Aggregate {
      Product(groupBy: ["category"]) {
        meta { count }
        groupedBy { path value }
        price { mean minimum maximum count }
        rating { mean median }
      }
    }
  }
  */
}

/**
 * Example 10: Aggregation with filter
 */
export function example10_FilteredAggregation() {
  const query = new AggregateQueryBuilder('Order')
    .groupBy(['status'])
    .where({
      operator: 'And',
      operands: [
        {
          operator: 'Operand',
          operand: {
            path: ['orderDate'],
            operator: FilterOperator.GreaterThan,
            value: new Date('2024-01-01'),
          },
        },
        {
          operator: 'Operand',
          operand: {
            path: ['total'],
            operator: FilterOperator.GreaterThan,
            value: 100,
          },
        },
      ],
    })
    .field('total', [Aggregation.Sum, Aggregation.Mean, Aggregation.Count])
    .build();

  console.log('Example 10 - Filtered Aggregation Query:');
  console.log(query);
}

/**
 * Example 11: Count query (simple aggregation)
 */
export function example11_CountQuery() {
  const query = new AggregateQueryBuilder('Article')
    .where({
      operator: 'Operand',
      operand: {
        path: ['status'],
        operator: FilterOperator.Equal,
        value: 'published',
      },
    })
    .build();

  console.log('Example 11 - Count Query:');
  console.log(query);
  /*
  Output:
  {
    Aggregate {
      Article(where: { path: ["status"], operator: Equal, valueText: "published" }) {
        meta { count }
        groupedBy { path value }
      }
    }
  }
  */
}

/**
 * Example 12: Top occurrences aggregation
 */
export function example12_TopOccurrences() {
  const query = new AggregateQueryBuilder('Article')
    .field('category', [Aggregation.TopOccurrences])
    .field('tags', [Aggregation.TopOccurrences])
    .build();

  console.log('Example 12 - Top Occurrences Query:');
  console.log(query);
}

/**
 * Example 13: Geo-spatial filter
 */
export function example13_GeoFilter() {
  const query = new GetQueryBuilder('Restaurant')
    .nearVector([0.1, 0.2, 0.3])
    .where({
      operator: 'Operand',
      operand: {
        path: ['location'],
        operator: FilterOperator.WithinGeoRange,
        value: {
          latitude: 37.7749,
          longitude: -122.4194,
          distanceKm: 5,
        },
      },
    })
    .limit(10)
    .properties(['name', 'address', 'cuisine'])
    .additional(['id', 'distance'])
    .build();

  console.log('Example 13 - Geo Filter Query:');
  console.log(query);
}

/**
 * Example 14: Array contains filter
 */
export function example14_ArrayContains() {
  const query = new GetQueryBuilder('Article')
    .nearVector([0.1, 0.2, 0.3])
    .where({
      operator: 'Operand',
      operand: {
        path: ['tags'],
        operator: FilterOperator.ContainsAny,
        value: ['javascript', 'typescript', 'nodejs'],
      },
    })
    .limit(10)
    .properties(['title', 'tags'])
    .additional(['id', 'distance'])
    .build();

  console.log('Example 14 - Array Contains Query:');
  console.log(query);
}

/**
 * Example 15: Pagination with offset
 */
export function example15_Pagination() {
  const page = 2;
  const pageSize = 10;
  const offset = (page - 1) * pageSize;

  const query = new GetQueryBuilder('Article')
    .nearVector([0.1, 0.2, 0.3])
    .limit(pageSize)
    .offset(offset)
    .properties(['title', 'summary'])
    .additional(['id', 'distance'])
    .build();

  console.log('Example 15 - Pagination Query:');
  console.log(query);
}

/**
 * Example 16: Autocut (adaptive result limiting)
 */
export function example16_Autocut() {
  const query = new GetQueryBuilder('Article')
    .nearVector([0.1, 0.2, 0.3])
    .autocut(1)
    .properties(['title', 'content'])
    .additional(['id', 'distance'])
    .build();

  console.log('Example 16 - Autocut Query:');
  console.log(query);
}

/**
 * Example 17: Complete execution flow
 */
export async function example17_ExecutionFlow() {
  // Note: This is pseudo-code showing the flow
  const httpClient = {
    post: async <T>(path: string, body: unknown): Promise<T> => {
      // HTTP implementation here
      return {} as T;
    },
  };

  // Build query
  const query = new GetQueryBuilder('Article')
    .nearVector([0.1, 0.2, 0.3])
    .limit(10)
    .properties(['title', 'content'])
    .additional(['id', 'distance'])
    .build();

  // Create executor
  const executor = new GraphQLExecutor({
    transport: httpClient,
  });

  // Execute query
  try {
    const data = await executor.execute(query);

    // Parse response
    const result = parseGraphQLResponse(data, 'Article');

    // Access results
    console.log(`Found ${result.objects.length} articles`);
    for (const hit of result.objects) {
      console.log(`- ${hit.properties.title} (distance: ${hit.distance})`);
    }
  } catch (error) {
    console.error('Query failed:', error);
  }
}

/**
 * Example 18: Parsing aggregation results
 */
export async function example18_AggregationParsing() {
  const httpClient = {
    post: async <T>(_path: string, _body: unknown): Promise<T> => {
      return {} as T;
    },
  };

  const query = new AggregateQueryBuilder('Product')
    .groupBy(['category'])
    .field('price', [Aggregation.Mean, Aggregation.Count])
    .build();

  const executor = new GraphQLExecutor({ transport: httpClient });

  try {
    const data = await executor.execute(query);
    const result = parseAggregateResult(data, 'Product');

    // Access aggregation results
    console.log(`Total count: ${result.meta?.count}`);
    for (const group of result.groups) {
      console.log(
        `Category: ${group.groupedBy?.category}, ` +
          `Average price: ${group.aggregations.price.mean}, ` +
          `Count: ${group.aggregations.price.count}`
      );
    }
  } catch (error) {
    console.error('Aggregation failed:', error);
  }
}

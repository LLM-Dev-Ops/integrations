/**
 * Aggregation examples
 *
 * Demonstrates various aggregation patterns and use cases.
 */

import { AggregateService, AggregateQueryBuilder } from './index.js';
import { Aggregation } from '../types/aggregate.js';
import { FilterOperator } from '../types/filter.js';
import type { GraphQLExecutor } from '../graphql/executor.js';

/**
 * Example: Simple count
 */
export async function exampleSimpleCount(
  service: AggregateService
): Promise<void> {
  // Count all articles
  const total = await service.count('Article');
  console.log(`Total articles: ${total}`);

  // Count with filter
  const published = await service.count('Article', {
    operator: 'Operand',
    operand: {
      path: ['status'],
      operator: FilterOperator.Equal,
      value: 'published',
    },
  });
  console.log(`Published articles: ${published}`);
}

/**
 * Example: Numeric aggregations
 */
export async function exampleNumericAggregations(
  service: AggregateService
): Promise<void> {
  const query = AggregateQueryBuilder.forClass('Product')
    .field('price', [
      Aggregation.Mean,
      Aggregation.Minimum,
      Aggregation.Maximum,
      Aggregation.Count,
    ])
    .filter({
      operator: 'Operand',
      operand: {
        path: ['inStock'],
        operator: FilterOperator.Equal,
        value: true,
      },
    })
    .build();

  const result = await service.aggregate(query);
  const priceStats = result.groups[0].aggregations.price;

  if (typeof priceStats === 'object' && priceStats !== null && 'mean' in priceStats) {
    console.log('Price Statistics:');
    console.log(`  Average: $${priceStats.mean}`);
    console.log(`  Range: $${priceStats.minimum} - $${priceStats.maximum}`);
    console.log(`  Products: ${priceStats.count}`);
  }
}

/**
 * Example: Grouping
 */
export async function exampleGrouping(
  service: AggregateService
): Promise<void> {
  const query = AggregateQueryBuilder.forClass('Product')
    .groupBy(['category'])
    .field('price', [Aggregation.Mean, Aggregation.Count])
    .field('views', [Aggregation.Sum])
    .filter({
      operator: 'Operand',
      operand: {
        path: ['inStock'],
        operator: FilterOperator.Equal,
        value: true,
      },
    })
    .build();

  const result = await service.aggregate(query);

  console.log('Statistics by Category:');
  for (const group of result.groups) {
    const category = group.groupedBy?.category;
    const priceStats = group.aggregations.price;
    const totalViews = group.aggregations.views;

    if (
      typeof priceStats === 'object' &&
      priceStats !== null &&
      'mean' in priceStats
    ) {
      console.log(`\n${category}:`);
      console.log(`  Average price: $${priceStats.mean}`);
      console.log(`  Products: ${priceStats.count}`);
      console.log(`  Total views: ${totalViews}`);
    }
  }
}

/**
 * Example: Top occurrences
 */
export async function exampleTopOccurrences(
  service: AggregateService
): Promise<void> {
  const query = AggregateQueryBuilder.forClass('Article')
    .field('tags', [Aggregation.TopOccurrences], 10)
    .build();

  const result = await service.aggregate(query);
  const tagsData = result.groups[0].aggregations.tags;

  if (
    typeof tagsData === 'object' &&
    tagsData !== null &&
    'topOccurrences' in tagsData &&
    Array.isArray(tagsData.topOccurrences)
  ) {
    console.log('Top 10 Tags:');
    for (const occurrence of tagsData.topOccurrences) {
      console.log(`  ${occurrence.value}: ${occurrence.count} articles`);
    }
  }
}

/**
 * Example: Multi-property aggregation
 */
export async function exampleMultiProperty(
  service: AggregateService
): Promise<void> {
  const query = AggregateQueryBuilder.forClass('Article')
    .field('wordCount', [
      Aggregation.Mean,
      Aggregation.Minimum,
      Aggregation.Maximum,
    ])
    .field('views', [Aggregation.Sum, Aggregation.Mean])
    .field('likes', [Aggregation.Sum])
    .field('publishDate', [Aggregation.Minimum, Aggregation.Maximum])
    .filter({
      operator: 'Operand',
      operand: {
        path: ['year'],
        operator: FilterOperator.GreaterThan,
        value: 2020,
      },
    })
    .build();

  const result = await service.aggregate(query);
  const group = result.groups[0];

  console.log('Article Statistics (2020+):');
  console.log(`  Total articles: ${group.count}`);

  const wordCount = group.aggregations.wordCount;
  if (typeof wordCount === 'object' && wordCount !== null && 'mean' in wordCount) {
    console.log(`  Average word count: ${wordCount.mean}`);
    console.log(`  Word count range: ${wordCount.minimum} - ${wordCount.maximum}`);
  }

  const views = group.aggregations.views;
  if (typeof views === 'object' && views !== null && 'sum' in views) {
    console.log(`  Total views: ${views.sum}`);
    console.log(`  Average views: ${views.mean}`);
  }
}

/**
 * Example: Complex grouping with multiple dimensions
 */
export async function exampleComplexGrouping(
  service: AggregateService
): Promise<void> {
  const query = AggregateQueryBuilder.forClass('Article')
    .groupBy(['category', 'status'])
    .field('wordCount', [Aggregation.Mean, Aggregation.Count])
    .field('views', [Aggregation.Sum])
    .limit(20)
    .build();

  const result = await service.aggregate(query);

  console.log('Statistics by Category and Status:');
  for (const group of result.groups) {
    const category = group.groupedBy?.category;
    const status = group.groupedBy?.status;
    const wordCount = group.aggregations.wordCount;

    if (typeof wordCount === 'object' && wordCount !== null && 'mean' in wordCount) {
      console.log(`\n${category} - ${status}:`);
      console.log(`  Articles: ${wordCount.count}`);
      console.log(`  Average length: ${wordCount.mean} words`);
    }
  }
}

/**
 * Example: Date aggregations
 */
export async function exampleDateAggregations(
  service: AggregateService
): Promise<void> {
  const query = AggregateQueryBuilder.forClass('Article')
    .field('publishDate', [
      Aggregation.Minimum,
      Aggregation.Maximum,
      Aggregation.Count,
    ])
    .build();

  const result = await service.aggregate(query);
  const dateStats = result.groups[0].aggregations.publishDate;

  if (typeof dateStats === 'object' && dateStats !== null && 'minimum' in dateStats) {
    console.log('Publication Date Range:');
    console.log(`  First article: ${dateStats.minimum}`);
    console.log(`  Latest article: ${dateStats.maximum}`);
    console.log(`  Total articles: ${dateStats.count}`);
  }
}

/**
 * Example: Boolean aggregations
 */
export async function exampleBooleanAggregations(
  service: AggregateService
): Promise<void> {
  const query = AggregateQueryBuilder.forClass('Product')
    .field('inStock', [Aggregation.Count])
    .build();

  const result = await service.aggregate(query);
  const stockData = result.groups[0].aggregations.inStock;

  if (typeof stockData === 'object' && stockData !== null) {
    if ('totalTrue' in stockData && 'totalFalse' in stockData) {
      console.log('Stock Status:');
      console.log(`  In stock: ${stockData.totalTrue}`);
      console.log(`  Out of stock: ${stockData.totalFalse}`);
      console.log(`  In stock %: ${stockData.percentageTrue}%`);
    }
  }
}

/**
 * Example: Multi-tenant aggregation
 */
export async function exampleMultiTenant(
  service: AggregateService
): Promise<void> {
  const tenants = ['customer-123', 'customer-456', 'customer-789'];

  for (const tenant of tenants) {
    const count = await service.count('Article', undefined, tenant);
    console.log(`${tenant}: ${count} articles`);
  }
}

/**
 * Example: Aggregation with complex filter
 */
export async function exampleComplexFilter(
  service: AggregateService
): Promise<void> {
  const query = AggregateQueryBuilder.forClass('Article')
    .field('views', [Aggregation.Sum, Aggregation.Mean])
    .field('likes', [Aggregation.Sum])
    .filter({
      operator: 'And',
      operands: [
        {
          operator: 'Operand',
          operand: {
            path: ['status'],
            operator: FilterOperator.Equal,
            value: 'published',
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
                value: 'Technology',
              },
            },
            {
              operator: 'Operand',
              operand: {
                path: ['category'],
                operator: FilterOperator.Equal,
                value: 'Science',
              },
            },
          ],
        },
        {
          operator: 'Operand',
          operand: {
            path: ['year'],
            operator: FilterOperator.GreaterThanEqual,
            value: 2023,
          },
        },
      ],
    })
    .build();

  const result = await service.aggregate(query);
  const group = result.groups[0];

  console.log('Published Tech/Science Articles (2023+):');
  console.log(`  Total: ${group.count}`);

  const views = group.aggregations.views;
  if (typeof views === 'object' && views !== null && 'sum' in views) {
    console.log(`  Total views: ${views.sum}`);
    console.log(`  Average views: ${views.mean}`);
  }
}

/**
 * Example: Using aggregateProperty helper
 */
export async function exampleAggregateProperty(
  service: AggregateService
): Promise<void> {
  const result = await service.aggregateProperty(
    'Product',
    'price',
    [Aggregation.Mean, Aggregation.Minimum, Aggregation.Maximum],
    {
      operator: 'Operand',
      operand: {
        path: ['category'],
        operator: FilterOperator.Equal,
        value: 'Electronics',
      },
    }
  );

  const priceStats = result.groups[0].aggregations.price;

  if (typeof priceStats === 'object' && priceStats !== null && 'mean' in priceStats) {
    console.log('Electronics Price Range:');
    console.log(`  Average: $${priceStats.mean}`);
    console.log(`  Min: $${priceStats.minimum}`);
    console.log(`  Max: $${priceStats.maximum}`);
  }
}

/**
 * Example: Pagination with grouping
 */
export async function examplePagination(
  service: AggregateService
): Promise<void> {
  // Get top 10 categories by article count
  const query = AggregateQueryBuilder.forClass('Article')
    .groupBy(['category'])
    .field('wordCount', [Aggregation.Count, Aggregation.Mean])
    .limit(10)
    .build();

  const result = await service.aggregate(query);

  console.log('Top 10 Categories:');
  for (const group of result.groups) {
    const category = group.groupedBy?.category;
    const wordCount = group.aggregations.wordCount;

    if (typeof wordCount === 'object' && wordCount !== null && 'count' in wordCount) {
      console.log(
        `  ${category}: ${wordCount.count} articles, avg ${wordCount.mean} words`
      );
    }
  }
}

/**
 * Runs all examples
 */
export async function runAllExamples(
  executor: GraphQLExecutor
): Promise<void> {
  const service = new AggregateService({
    graphqlExecutor: executor,
  });

  console.log('=== Simple Count ===');
  await exampleSimpleCount(service);

  console.log('\n=== Numeric Aggregations ===');
  await exampleNumericAggregations(service);

  console.log('\n=== Grouping ===');
  await exampleGrouping(service);

  console.log('\n=== Top Occurrences ===');
  await exampleTopOccurrences(service);

  console.log('\n=== Multi-Property Aggregation ===');
  await exampleMultiProperty(service);

  console.log('\n=== Complex Grouping ===');
  await exampleComplexGrouping(service);

  console.log('\n=== Date Aggregations ===');
  await exampleDateAggregations(service);

  console.log('\n=== Boolean Aggregations ===');
  await exampleBooleanAggregations(service);

  console.log('\n=== Multi-Tenant ===');
  await exampleMultiTenant(service);

  console.log('\n=== Complex Filter ===');
  await exampleComplexFilter(service);

  console.log('\n=== Aggregate Property Helper ===');
  await exampleAggregateProperty(service);

  console.log('\n=== Pagination ===');
  await examplePagination(service);
}

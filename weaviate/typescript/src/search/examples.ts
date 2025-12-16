/**
 * Search module examples
 *
 * Demonstrates usage of the search service and related utilities.
 */

import type { SearchService } from './service.js';
import type { NearVectorQuery, HybridQuery } from './types.js';
import { FusionType } from './types.js';
import {
  createSearchIterator,
  filterByCertainty,
  sortByScore,
  mergeSearchResults,
} from './index.js';

/**
 * Example 1: Basic vector search
 */
export async function exampleNearVectorSearch(
  searchService: SearchService
): Promise<void> {
  // Create a vector search query
  const query: NearVectorQuery = {
    className: 'Article',
    vector: [0.1, 0.2, 0.3, 0.4, 0.5], // Your embedding vector
    limit: 10,
    certainty: 0.7, // Minimum similarity threshold
    properties: ['title', 'content', 'author'],
    includeVector: false,
  };

  // Execute search
  const results = await searchService.nearVector('Article', query);

  console.log(`Found ${results.objects.length} results`);
  for (const hit of results.objects) {
    console.log(`- ${hit.properties.title} (certainty: ${hit.certainty})`);
  }
}

/**
 * Example 2: Text semantic search
 */
export async function exampleNearTextSearch(
  searchService: SearchService
): Promise<void> {
  // Search using text concepts (requires a text vectorizer)
  const results = await searchService.nearText('Article', {
    className: 'Article',
    concepts: ['artificial intelligence', 'machine learning'],
    limit: 10,
    certainty: 0.7,
    properties: ['title', 'content'],
    // Move towards specific concepts
    moveTo: {
      concepts: ['deep learning', 'neural networks'],
      force: 0.5,
    },
    // Move away from others
    moveAway: {
      concepts: ['traditional programming'],
      force: 0.3,
    },
  });

  console.log(`Found ${results.objects.length} results`);
}

/**
 * Example 3: Hybrid search (BM25 + Vector)
 */
export async function exampleHybridSearch(
  searchService: SearchService
): Promise<void> {
  const query: HybridQuery = {
    className: 'Article',
    query: 'machine learning tutorial',
    alpha: 0.5, // 50% vector, 50% BM25
    limit: 10,
    fusionType: FusionType.RankedFusion,
    properties: ['title', 'content'],
  };

  const results = await searchService.hybrid('Article', query);

  console.log(`Found ${results.objects.length} results`);
  for (const hit of results.objects) {
    console.log(`- ${hit.properties.title} (score: ${hit.score})`);
  }
}

/**
 * Example 4: BM25 keyword search
 */
export async function exampleBM25Search(
  searchService: SearchService
): Promise<void> {
  const results = await searchService.bm25('Article', {
    className: 'Article',
    query: 'machine learning',
    properties: ['title', 'content'], // Search in these fields
    limit: 10,
    returnProperties: ['title', 'author'],
  });

  console.log(`Found ${results.objects.length} results`);
}

/**
 * Example 5: Object similarity search
 */
export async function exampleNearObjectSearch(
  searchService: SearchService
): Promise<void> {
  // Find objects similar to a specific object
  const results = await searchService.nearObject('Article', {
    className: 'Article',
    id: '123e4567-e89b-12d3-a456-426614174000' as any, // UUID
    limit: 10,
    certainty: 0.7,
    properties: ['title', 'content'],
  });

  console.log(`Found ${results.objects.length} similar articles`);
}

/**
 * Example 6: Paginated search with iterator
 */
export async function examplePaginatedSearch(
  searchService: SearchService
): Promise<void> {
  const query: NearVectorQuery = {
    className: 'Article',
    vector: [0.1, 0.2, 0.3, 0.4, 0.5],
    limit: 100, // Total results wanted
    properties: ['title'],
  };

  // Create iterator with page size of 20
  const iterator = createSearchIterator(searchService, 'Article', query, {
    pageSize: 20,
    maxResults: 100,
  });

  // Iterate through results in chunks
  let totalProcessed = 0;
  for await (const hits of iterator) {
    totalProcessed += hits.length;
    console.log(`Processed batch of ${hits.length} results`);

    // Process each hit
    for (const hit of hits) {
      console.log(`  - ${hit.properties.title}`);
    }
  }

  console.log(`Total processed: ${totalProcessed}`);
}

/**
 * Example 7: Manual pagination
 */
export async function exampleManualPagination(
  searchService: SearchService
): Promise<void> {
  const baseQuery: NearVectorQuery = {
    className: 'Article',
    vector: [0.1, 0.2, 0.3, 0.4, 0.5],
    limit: 20,
    properties: ['title'],
  };

  const iterator = createSearchIterator(searchService, 'Article', baseQuery, {
    pageSize: 20,
  });

  // Fetch first page
  const firstPage = await iterator.next();
  console.log(`First page: ${firstPage.value.length} results`);

  // Fetch second page
  const secondPage = await iterator.next();
  console.log(`Second page: ${secondPage.value.length} results`);

  // Check if more results available
  if (iterator.hasMore()) {
    console.log('More results available');
  }
}

/**
 * Example 8: Result filtering and sorting
 */
export async function exampleResultProcessing(
  searchService: SearchService
): Promise<void> {
  const results = await searchService.nearVector('Article', {
    className: 'Article',
    vector: [0.1, 0.2, 0.3, 0.4, 0.5],
    limit: 50,
    properties: ['title', 'content'],
  });

  // Filter by certainty
  const highQuality = filterByCertainty(results.objects, 0.8);
  console.log(`High quality results: ${highQuality.length}`);

  // Sort by score
  const sorted = sortByScore(highQuality);
  console.log(`Top result: ${sorted[0].properties.title}`);
}

/**
 * Example 9: Multi-tenant search
 */
export async function exampleMultiTenantSearch(
  searchService: SearchService
): Promise<void> {
  const results = await searchService.nearVector('Article', {
    className: 'Article',
    vector: [0.1, 0.2, 0.3, 0.4, 0.5],
    limit: 10,
    tenant: 'tenant-123', // Specify tenant
    properties: ['title'],
  });

  console.log(`Found ${results.objects.length} results for tenant`);
}

/**
 * Example 10: Search with filters
 */
export async function exampleSearchWithFilters(
  searchService: SearchService
): Promise<void> {
  const results = await searchService.nearVector('Article', {
    className: 'Article',
    vector: [0.1, 0.2, 0.3, 0.4, 0.5],
    limit: 10,
    filter: {
      operator: 'And',
      operands: [
        {
          operator: 'Operand',
          operand: {
            path: ['author'],
            operator: 'Equal' as any,
            value: 'John Doe',
          },
        },
        {
          operator: 'Operand',
          operand: {
            path: ['wordCount'],
            operator: 'GreaterThan' as any,
            value: 1000,
          },
        },
      ],
    },
    properties: ['title', 'author', 'wordCount'],
  });

  console.log(`Found ${results.objects.length} filtered results`);
}

/**
 * Example 11: Grouped search results
 */
export async function exampleGroupedSearch(
  searchService: SearchService
): Promise<void> {
  const results = await searchService.nearVector('Article', {
    className: 'Article',
    vector: [0.1, 0.2, 0.3, 0.4, 0.5],
    limit: 10,
    groupBy: {
      path: ['category'],
      groups: 3, // Return top 3 groups
      objectsPerGroup: 5, // 5 objects per group
    },
    properties: ['title', 'category'],
  });

  if (results.groups) {
    for (const group of results.groups) {
      console.log(`Group: ${group.groupedBy.value}`);
      console.log(`  Objects: ${group.hits.length}`);
    }
  }
}

/**
 * Example 12: Adaptive hybrid search
 */
export async function exampleAdaptiveHybridSearch(
  searchService: SearchService
): Promise<void> {
  // Import the helper
  const { determineOptimalAlpha } = await import('./hybrid.js');

  const userQuery = 'comprehensive guide to neural networks';

  // Automatically determine optimal alpha based on query
  const alpha = determineOptimalAlpha(userQuery);

  const results = await searchService.hybrid('Article', {
    className: 'Article',
    query: userQuery,
    alpha, // Use adaptive alpha
    limit: 10,
    fusionType: FusionType.RankedFusion,
    properties: ['title', 'content'],
  });

  console.log(`Search with alpha=${alpha}: ${results.objects.length} results`);
}

/**
 * Example 13: Merging results from multiple searches
 */
export async function exampleMergeResults(
  searchService: SearchService
): Promise<void> {
  // Run multiple searches
  const vectorResults = await searchService.nearVector('Article', {
    className: 'Article',
    vector: [0.1, 0.2, 0.3, 0.4, 0.5],
    limit: 10,
    properties: ['title'],
  });

  const textResults = await searchService.nearText('Article', {
    className: 'Article',
    concepts: ['machine learning'],
    limit: 10,
    properties: ['title'],
  });

  // Merge and deduplicate
  const merged = mergeSearchResults([vectorResults, textResults], true);

  console.log(`Merged ${merged.objects.length} unique results`);
}

/**
 * Example 14: Collecting all results
 */
export async function exampleCollectAllResults(
  searchService: SearchService
): Promise<void> {
  const query: NearVectorQuery = {
    className: 'Article',
    vector: [0.1, 0.2, 0.3, 0.4, 0.5],
    limit: 100,
    properties: ['title'],
  };

  const iterator = createSearchIterator(searchService, 'Article', query, {
    pageSize: 20,
    maxResults: 100,
  });

  // Collect all results at once (warning: loads all into memory)
  const allResults = await iterator.collect();

  console.log(`Collected ${allResults.length} total results`);
}

/**
 * Example 15: Error handling
 */
export async function exampleErrorHandling(
  searchService: SearchService
): Promise<void> {
  try {
    const results = await searchService.nearVector('Article', {
      className: 'Article',
      vector: [0.1, 0.2, 0.3], // Might be wrong dimensions
      limit: 10,
      properties: ['title'],
    });

    console.log(`Found ${results.objects.length} results`);
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Search failed: ${error.message}`);

      // Handle specific error types
      if (error.message.includes('dimension')) {
        console.error('Vector dimension mismatch');
      } else if (error.message.includes('class not found')) {
        console.error('Class does not exist');
      }
    }
  }
}

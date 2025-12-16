/**
 * Point Operations Examples
 *
 * Demonstrates how to use the Qdrant point operations module
 */

import {
  PointsClient,
  createPointsClient,
  type Point,
  type Filter,
  type HttpClient,
} from '../src/points/index.js';

/**
 * Mock HTTP client for demonstration
 */
class MockHttpClient implements HttpClient {
  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: { params?: Record<string, string>; headers?: Record<string, string> }
  ): Promise<T> {
    console.log(`${method} ${path}`, body);
    // This would normally make an actual HTTP request
    return {} as T;
  }
}

/**
 * Example 1: Basic upsert operations
 */
async function basicUpsertExample() {
  const client = createPointsClient({
    httpClient: new MockHttpClient(),
    collectionName: 'documents',
  });

  // Upsert single batch of points
  const points: Point[] = [
    {
      id: 1,
      vector: [0.1, 0.2, 0.3, 0.4],
      payload: {
        title: 'First document',
        category: 'news',
        published: '2024-01-01',
      },
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440000',
      vector: [0.5, 0.6, 0.7, 0.8],
      payload: {
        title: 'Second document',
        category: 'blog',
        published: '2024-01-02',
      },
    },
  ];

  const result = await client.upsert(points);
  console.log('Upsert result:', result);
}

/**
 * Example 2: Batch upsert with progress tracking
 */
async function batchUpsertExample() {
  const client = createPointsClient({
    httpClient: new MockHttpClient(),
    collectionName: 'large_collection',
  });

  // Create a large batch of points
  const largePointsBatch: Point[] = Array.from({ length: 1000 }, (_, i) => ({
    id: i,
    vector: Array.from({ length: 384 }, () => Math.random()),
    payload: {
      index: i,
      category: i % 2 === 0 ? 'even' : 'odd',
    },
  }));

  // Batch upsert with progress tracking
  const result = await client.upsertBatch(largePointsBatch, 100, {
    maxConcurrency: 5,
    onProgress: (processed, total) => {
      const percentage = ((processed / total) * 100).toFixed(2);
      console.log(`Progress: ${processed}/${total} (${percentage}%)`);
    },
    onBatchComplete: (batchIndex, batchResult) => {
      console.log(`Batch ${batchIndex} completed:`, batchResult);
    },
    onBatchError: (batchIndex, error) => {
      console.error(`Batch ${batchIndex} failed:`, error.message);
    },
  });

  console.log('Batch upsert completed:', result);
}

/**
 * Example 3: Sparse vectors (for hybrid search)
 */
async function sparseVectorExample() {
  const client = createPointsClient({
    httpClient: new MockHttpClient(),
    collectionName: 'hybrid_search',
  });

  const points: Point[] = [
    {
      id: 1,
      vector: {
        indices: [0, 5, 10, 15],
        values: [0.8, 0.6, 0.4, 0.2],
      },
      payload: {
        text: 'Sparse vector example',
      },
    },
  ];

  await client.upsert(points);
}

/**
 * Example 4: Named vectors (multiple vectors per point)
 */
async function namedVectorsExample() {
  const client = createPointsClient({
    httpClient: new MockHttpClient(),
    collectionName: 'multi_vector',
  });

  const points: Point[] = [
    {
      id: 1,
      vector: {
        image: [0.1, 0.2, 0.3, 0.4],
        text: [0.5, 0.6, 0.7, 0.8],
      },
      payload: {
        description: 'Multi-modal document',
      },
    },
  ];

  await client.upsert(points);
}

/**
 * Example 5: Get points by ID
 */
async function getPointsExample() {
  const client = createPointsClient({
    httpClient: new MockHttpClient(),
    collectionName: 'documents',
  });

  // Get points with payload and vectors
  const points = await client.get([1, 2, 3]);
  console.log('Retrieved points:', points);

  // Get points without vectors (payload only)
  const pointsWithoutVectors = await client.get([1, 2, 3], true, false);
  console.log('Points without vectors:', pointsWithoutVectors);
}

/**
 * Example 6: Delete points
 */
async function deletePointsExample() {
  const client = createPointsClient({
    httpClient: new MockHttpClient(),
    collectionName: 'documents',
  });

  // Delete by IDs
  const deleteResult = await client.delete([1, 2, 3]);
  console.log('Delete result:', deleteResult);

  // Delete by filter
  const filter: Filter = {
    must: [
      {
        key: 'category',
        match: { value: 'outdated' },
      },
    ],
  };

  const deleteByFilterResult = await client.deleteByFilter(filter);
  console.log('Delete by filter result:', deleteByFilterResult);
}

/**
 * Example 7: Scroll through points with pagination
 */
async function scrollExample() {
  const client = createPointsClient({
    httpClient: new MockHttpClient(),
    collectionName: 'documents',
  });

  // First page
  const page1 = await client.scroll({
    limit: 10,
    withPayload: true,
    withVectors: false,
  });
  console.log('First page:', page1.points.length, 'points');

  // Second page (using offset from first page)
  if (page1.nextOffset) {
    const page2 = await client.scroll({
      limit: 10,
      offset: page1.nextOffset,
      withPayload: true,
      withVectors: false,
    });
    console.log('Second page:', page2.points.length, 'points');
  }

  // Scroll with filter
  const filteredPage = await client.scroll({
    filter: {
      must: [
        {
          key: 'category',
          match: { value: 'news' },
        },
      ],
    },
    limit: 20,
  });
  console.log('Filtered results:', filteredPage.points.length, 'points');
}

/**
 * Example 8: Advanced filtering
 */
async function advancedFilteringExample() {
  const client = createPointsClient({
    httpClient: new MockHttpClient(),
    collectionName: 'documents',
  });

  // Complex filter with multiple conditions
  const filter: Filter = {
    must: [
      {
        key: 'category',
        match: { value: 'news' },
      },
      {
        key: 'views',
        range: {
          gte: 100,
          lte: 1000,
        },
      },
    ],
    should: [
      {
        key: 'featured',
        match: { value: true },
      },
      {
        key: 'trending',
        match: { value: true },
      },
    ],
    must_not: [
      {
        key: 'status',
        match: { value: 'archived' },
      },
    ],
  };

  const results = await client.scroll({ filter, limit: 50 });
  console.log('Advanced filter results:', results.points.length, 'points');
}

/**
 * Example 9: Count points
 */
async function countExample() {
  const client = createPointsClient({
    httpClient: new MockHttpClient(),
    collectionName: 'documents',
  });

  // Count all points
  const totalCount = await client.count();
  console.log('Total points:', totalCount);

  // Count with filter
  const activeCount = await client.count({
    must: [
      {
        key: 'status',
        match: { value: 'active' },
      },
    ],
  });
  console.log('Active points:', activeCount);
}

/**
 * Example 10: Geo-location filtering
 */
async function geoFilteringExample() {
  const client = createPointsClient({
    httpClient: new MockHttpClient(),
    collectionName: 'locations',
  });

  // Geo-radius filter
  const nearbyResults = await client.scroll({
    filter: {
      must: [
        {
          key: 'location',
          geo_radius: {
            center: {
              lon: -122.4194,
              lat: 37.7749,
            },
            radius: 5000, // 5km radius
          },
        },
      ],
    },
    limit: 20,
  });
  console.log('Nearby locations:', nearbyResults.points.length);

  // Geo-bounding box filter
  const boxResults = await client.scroll({
    filter: {
      must: [
        {
          key: 'location',
          geo_bounding_box: {
            top_left: {
              lon: -122.5,
              lat: 37.8,
            },
            bottom_right: {
              lon: -122.3,
              lat: 37.7,
            },
          },
        },
      ],
    },
    limit: 20,
  });
  console.log('Locations in bounding box:', boxResults.points.length);
}

/**
 * Example 11: Ordered scrolling
 */
async function orderedScrollExample() {
  const client = createPointsClient({
    httpClient: new MockHttpClient(),
    collectionName: 'documents',
  });

  // Scroll with ordering
  const results = await client.scroll({
    orderBy: {
      key: 'published_date',
      direction: 'desc',
    },
    limit: 20,
  });
  console.log('Ordered results:', results.points.length);
}

/**
 * Example 12: Complete workflow - ETL pipeline
 */
async function etlPipelineExample() {
  const client = createPointsClient({
    httpClient: new MockHttpClient(),
    collectionName: 'embeddings',
  });

  // Step 1: Generate embeddings (simulated)
  console.log('Step 1: Generating embeddings...');
  const documents = ['doc1', 'doc2', 'doc3', 'doc4', 'doc5'];
  const points: Point[] = documents.map((doc, i) => ({
    id: i,
    vector: Array.from({ length: 384 }, () => Math.random()),
    payload: {
      content: doc,
      indexed_at: new Date().toISOString(),
    },
  }));

  // Step 2: Batch upsert
  console.log('Step 2: Uploading embeddings...');
  const upsertResult = await client.upsertBatch(points, 100, {
    maxConcurrency: 3,
    onProgress: (processed, total) => {
      console.log(`Uploaded ${processed}/${total} documents`);
    },
  });
  console.log('Upload complete:', upsertResult);

  // Step 3: Verify upload
  console.log('Step 3: Verifying upload...');
  const count = await client.count();
  console.log('Total documents indexed:', count);

  // Step 4: Retrieve and validate
  console.log('Step 4: Retrieving sample...');
  const sample = await client.scroll({ limit: 2 });
  console.log('Sample documents:', sample.points.length);
}

// Run examples
async function runExamples() {
  console.log('=== Point Operations Examples ===\n');

  try {
    await basicUpsertExample();
    await sparseVectorExample();
    await namedVectorsExample();
    await getPointsExample();
    await deletePointsExample();
    await scrollExample();
    await advancedFilteringExample();
    await countExample();
    await geoFilteringExample();
    await orderedScrollExample();
    await etlPipelineExample();
    // Note: batchUpsertExample commented out to avoid long execution
    // await batchUpsertExample();

    console.log('\n=== All examples completed successfully ===');
  } catch (error) {
    console.error('Error running examples:', error);
  }
}

// Uncomment to run examples
// runExamples();

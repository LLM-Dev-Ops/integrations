/**
 * Example usage of the Qdrant CollectionClient.
 *
 * This example demonstrates:
 * - Creating collections with different configurations
 * - Using the builder pattern
 * - Working with single-vector and multi-vector collections
 * - Checking collection existence
 * - Getting collection information
 * - Updating collection parameters
 * - Deleting collections
 */

import {
  CollectionClient,
  Distance,
  CollectionConfig,
  type QdrantClientInterface,
} from '../src/collection/index.js';

/**
 * Mock QdrantClient for demonstration purposes.
 * In a real application, you would use the actual QdrantClient.
 */
class MockQdrantClient implements QdrantClientInterface {
  async request<T>(method: string, path: string, body?: any): Promise<T> {
    console.log(`${method} ${path}`);
    if (body) {
      console.log('Body:', JSON.stringify(body, null, 2));
    }

    // Mock responses based on the endpoint
    if (method === 'GET' && path.includes('/exists')) {
      return { result: { exists: false } } as T;
    }

    if (method === 'GET' && !path.includes('/exists')) {
      return {
        result: {
          status: 'green',
          optimizerStatus: { ok: true },
          pointsCount: 1000,
          segmentsCount: 2,
          vectorsCount: 1000,
          indexedVectorsCount: 1000,
          config: {
            params: {
              vectors: {
                size: 384,
                distance: 'Cosine',
              },
              shardNumber: 1,
              replicationFactor: 1,
              onDiskPayload: false,
            },
            hnswConfig: {
              m: 16,
              efConstruct: 100,
              fullScanThreshold: 20000,
              maxIndexingThreads: 0,
              onDisk: false,
              payloadM: 16,
            },
            optimizerConfig: {
              deletedThreshold: 0.2,
              vacuumMinVectorNumber: 1000,
              defaultSegmentNumber: 0,
              maxSegmentSize: 200000,
              memmapThreshold: 50000,
              indexingThreshold: 20000,
              flushIntervalSec: 5,
              maxOptimizationThreads: 1,
            },
            walConfig: {
              walCapacityMb: 32,
              walSegmentsAhead: 0,
            },
          },
        },
      } as T;
    }

    return { result: true, status: 'ok' } as T;
  }

  getBaseUrl(): string {
    return 'http://localhost:6333';
  }
}

/**
 * Example 1: Create a simple collection with default configuration
 */
async function example1_SimpleCollection() {
  console.log('\n=== Example 1: Simple Collection ===\n');

  const client = new MockQdrantClient();
  const collection = new CollectionClient(client, 'my_simple_collection');

  // Create collection with basic configuration
  await collection.create({
    vectors: {
      size: 384,
      distance: Distance.Cosine,
    },
  });

  console.log('✓ Collection created successfully\n');
}

/**
 * Example 2: Create a collection using the builder pattern
 */
async function example2_BuilderPattern() {
  console.log('\n=== Example 2: Builder Pattern ===\n');

  const client = new MockQdrantClient();
  const collection = new CollectionClient(client, 'my_optimized_collection');

  // Build configuration with fluent API
  const config = CollectionConfig.defaultWithSize(768)
    .withDistance(Distance.Euclidean)
    .withHnsw(32, 200)
    .withScalarQuantization(0.99, true)
    .withOnDisk(true)
    .withOnDiskPayload(true)
    .withReplicationFactor(2)
    .withWriteConsistency('majority')
    .build();

  await collection.create(config);

  console.log('✓ Optimized collection created successfully\n');
}

/**
 * Example 3: Create a multi-vector collection
 */
async function example3_MultiVectorCollection() {
  console.log('\n=== Example 3: Multi-Vector Collection ===\n');

  const client = new MockQdrantClient();
  const collection = new CollectionClient(client, 'my_multimodal_collection');

  // Create collection with multiple named vector spaces
  await collection.createWithNamedVectors(
    new Map([
      [
        'text',
        {
          size: 384,
          distance: Distance.Cosine,
          onDisk: false,
        },
      ],
      [
        'image',
        {
          size: 512,
          distance: Distance.Euclidean,
          onDisk: true,
        },
      ],
      [
        'audio',
        {
          size: 256,
          distance: Distance.Dot,
        },
      ],
    ])
  );

  console.log('✓ Multi-vector collection created successfully\n');
}

/**
 * Example 4: Check collection existence and get info
 */
async function example4_CollectionInfo() {
  console.log('\n=== Example 4: Collection Info ===\n');

  const client = new MockQdrantClient();
  const collection = new CollectionClient(client, 'existing_collection');

  // Check if collection exists
  const exists = await collection.exists();
  console.log(`Collection exists: ${exists}\n`);

  if (exists) {
    // Get detailed information
    const info = await collection.info();
    console.log('Collection Information:');
    console.log(`  Status: ${info.status}`);
    console.log(`  Points: ${info.pointsCount}`);
    console.log(`  Vectors: ${info.vectorsCount}`);
    console.log(`  Indexed Vectors: ${info.indexedVectorsCount}`);
    console.log(`  Segments: ${info.segmentsCount}`);
    console.log(`  Optimizer Status: ${info.optimizerStatus.ok ? 'OK' : 'Error'}`);
  }

  console.log('\n✓ Collection info retrieved successfully\n');
}

/**
 * Example 5: Update collection parameters
 */
async function example5_UpdateCollection() {
  console.log('\n=== Example 5: Update Collection ===\n');

  const client = new MockQdrantClient();
  const collection = new CollectionClient(client, 'my_collection');

  // Update replication and consistency settings
  await collection.updateParams({
    params: {
      replicationFactor: 3,
      writeConsistencyFactor: 'quorum',
    },
  });

  console.log('✓ Replication settings updated\n');

  // Update optimizer configuration
  await collection.updateParams({
    optimizersConfig: {
      deletedThreshold: 0.3,
      vacuumMinVectorNumber: 1000,
      maxOptimizationThreads: 2,
    },
  });

  console.log('✓ Optimizer settings updated\n');
}

/**
 * Example 6: Advanced configuration with quantization
 */
async function example6_AdvancedConfiguration() {
  console.log('\n=== Example 6: Advanced Configuration ===\n');

  const client = new MockQdrantClient();
  const collection = new CollectionClient(client, 'my_advanced_collection');

  // Create collection with product quantization
  const config = CollectionConfig.defaultWithSize(1536)
    .withDistance(Distance.Cosine)
    .withHnsw(16, 100)
    .withProductQuantization('x16', false)
    .withShardNumber(4)
    .build();

  await collection.create(config);

  console.log('✓ Advanced collection with product quantization created\n');

  // Alternative: Binary quantization
  const binaryConfig = CollectionConfig.defaultWithSize(768)
    .withDistance(Distance.Cosine)
    .withBinaryQuantization(true)
    .build();

  const binaryCollection = new CollectionClient(client, 'binary_collection');
  await binaryCollection.create(binaryConfig);

  console.log('✓ Collection with binary quantization created\n');
}

/**
 * Example 7: Delete a collection
 */
async function example7_DeleteCollection() {
  console.log('\n=== Example 7: Delete Collection ===\n');

  const client = new MockQdrantClient();
  const collection = new CollectionClient(client, 'temporary_collection');

  // Create a temporary collection
  await collection.create({
    vectors: {
      size: 128,
      distance: Distance.Cosine,
    },
  });

  console.log('✓ Temporary collection created\n');

  // Delete the collection
  await collection.delete();

  console.log('✓ Collection deleted successfully\n');
}

/**
 * Run all examples
 */
async function runAllExamples() {
  console.log('Qdrant Collection Client Examples');
  console.log('==================================');

  try {
    await example1_SimpleCollection();
    await example2_BuilderPattern();
    await example3_MultiVectorCollection();
    await example4_CollectionInfo();
    await example5_UpdateCollection();
    await example6_AdvancedConfiguration();
    await example7_DeleteCollection();

    console.log('\n✓ All examples completed successfully!');
  } catch (error) {
    console.error('\n✗ Error running examples:', error);
    throw error;
  }
}

// Run examples if this file is executed directly
// Note: Uncomment the following to run when executing directly
// runAllExamples().catch((error) => {
//   console.error('Fatal error:', error);
//   process.exit(1);
// });

export {
  example1_SimpleCollection,
  example2_BuilderPattern,
  example3_MultiVectorCollection,
  example4_CollectionInfo,
  example5_UpdateCollection,
  example6_AdvancedConfiguration,
  example7_DeleteCollection,
};

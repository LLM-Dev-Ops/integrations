/**
 * Embeddings Example
 *
 * This example demonstrates:
 * - Generating single embeddings
 * - Batch embedding generation
 * - Different task types (retrieval, classification, etc.)
 * - Using embeddings for semantic similarity
 *
 * Prerequisites:
 * - Set the GEMINI_API_KEY environment variable
 *
 * Usage:
 * ```bash
 * export GEMINI_API_KEY="your-api-key"
 * npm run build
 * node dist/examples/embeddings.js
 * ```
 */

import { createClientFromEnv } from '../src/index.js';

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    magnitudeA += a[i] * a[i];
    magnitudeB += b[i] * b[i];
  }

  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  return dotProduct / (magnitudeA * magnitudeB);
}

/**
 * Example 1: Generate a single embedding
 */
async function exampleSingleEmbedding(): Promise<number[]> {
  console.log('\n=== Example 1: Single Embedding ===\n');

  const client = createClientFromEnv();

  const text = 'What is the capital of France?';
  console.log(`Generating embedding for: "${text}"\n`);

  const response = await client.embeddings.embed('models/text-embedding-004', {
    content: {
      parts: [{ text }],
    },
    taskType: 'RETRIEVAL_QUERY',
  });

  console.log('Embedding generated successfully!');
  console.log(`Dimensions: ${response.embedding.values.length}`);
  console.log(`First 5 values: [${response.embedding.values.slice(0, 5).join(', ')}...]`);

  return response.embedding.values;
}

/**
 * Example 2: Batch embeddings
 */
async function exampleBatchEmbeddings(): Promise<number[][]> {
  console.log('\n=== Example 2: Batch Embeddings ===\n');

  const client = createClientFromEnv();

  const texts = [
    'Paris is the capital of France.',
    'London is the capital of the United Kingdom.',
    'Berlin is the capital of Germany.',
    'Madrid is the capital of Spain.',
    'Rome is the capital of Italy.',
  ];

  console.log('Generating embeddings for multiple texts...');
  console.log(`Number of texts: ${texts.length}\n`);

  const requests = texts.map((text) => ({
    content: {
      parts: [{ text }],
    },
    taskType: 'RETRIEVAL_DOCUMENT' as const,
  }));

  const response = await client.embeddings.batchEmbed('models/text-embedding-004', requests);

  console.log('Batch embeddings generated successfully!');
  console.log(`Number of embeddings: ${response.embeddings.length}`);

  if (response.embeddings.length > 0) {
    console.log(`Embedding dimensions: ${response.embeddings[0].values.length}`);
  }

  // Show first few values of each embedding
  console.log('\nFirst 3 values of each embedding:');
  for (let i = 0; i < response.embeddings.length; i++) {
    const values = response.embeddings[i].values;
    console.log(`${i + 1}. [${values.slice(0, 3).join(', ')}...]`);
  }

  return response.embeddings.map((emb) => emb.values);
}

/**
 * Example 3: Different task types
 */
async function exampleTaskTypes(): Promise<void> {
  console.log('\n=== Example 3: Different Task Types ===\n');

  const client = createClientFromEnv();

  const text = 'Machine learning is a subset of artificial intelligence.';

  // Task types available:
  // - RETRIEVAL_QUERY: For search queries
  // - RETRIEVAL_DOCUMENT: For documents in a corpus
  // - SEMANTIC_SIMILARITY: For similarity comparison
  // - CLASSIFICATION: For text classification
  // - CLUSTERING: For clustering similar texts

  const taskTypes = [
    'RETRIEVAL_QUERY',
    'RETRIEVAL_DOCUMENT',
    'SEMANTIC_SIMILARITY',
    'CLASSIFICATION',
    'CLUSTERING',
  ] as const;

  console.log(`Generating embeddings with different task types for:`);
  console.log(`"${text}"\n`);

  for (const taskType of taskTypes) {
    const response = await client.embeddings.embed('models/text-embedding-004', {
      content: {
        parts: [{ text }],
      },
      taskType,
    });

    console.log(`Task Type: ${taskType}`);
    console.log(`  Dimensions: ${response.embedding.values.length}`);
    console.log(`  First 3 values: [${response.embedding.values.slice(0, 3).join(', ')}...]`);
    console.log();
  }
}

/**
 * Example 4: Semantic similarity comparison
 */
async function exampleSemanticSimilarity(): Promise<void> {
  console.log('\n=== Example 4: Semantic Similarity ===\n');

  const client = createClientFromEnv();

  // Base query
  const query = 'What is the capital city of France?';

  // Similar and dissimilar sentences
  const sentences = [
    'Paris is the capital of France.',
    'The capital of France is Paris.',
    'France has Paris as its capital city.',
    'I love eating pizza for dinner.',
    'The weather is sunny today.',
  ];

  console.log(`Query: "${query}"\n`);
  console.log('Comparing with sentences:\n');

  // Generate embedding for query
  const queryResponse = await client.embeddings.embed('models/text-embedding-004', {
    content: {
      parts: [{ text: query }],
    },
    taskType: 'RETRIEVAL_QUERY',
  });

  const queryEmbedding = queryResponse.embedding.values;

  // Generate embeddings for sentences
  const sentenceRequests = sentences.map((text) => ({
    content: {
      parts: [{ text }],
    },
    taskType: 'RETRIEVAL_DOCUMENT' as const,
  }));

  const sentencesResponse = await client.embeddings.batchEmbed(
    'models/text-embedding-004',
    sentenceRequests
  );

  // Calculate similarities
  console.log('Similarity scores:\n');

  const similarities = sentencesResponse.embeddings.map((emb, index) => ({
    sentence: sentences[index],
    similarity: cosineSimilarity(queryEmbedding, emb.values),
  }));

  // Sort by similarity (descending)
  similarities.sort((a, b) => b.similarity - a.similarity);

  for (const { sentence, similarity } of similarities) {
    const percentage = (similarity * 100).toFixed(2);
    const bar = '█'.repeat(Math.floor(similarity * 50));
    console.log(`${percentage}% ${bar}`);
    console.log(`  "${sentence}"`);
    console.log();
  }
}

/**
 * Example 5: Text clustering
 */
async function exampleClustering(): Promise<void> {
  console.log('\n=== Example 5: Text Clustering ===\n');

  const client = createClientFromEnv();

  // Documents on different topics
  const documents = [
    // Technology
    'Artificial intelligence is transforming many industries.',
    'Machine learning models require large datasets for training.',
    'Neural networks are inspired by biological brain structure.',
    // Cooking
    'Baking bread requires flour, water, yeast, and salt.',
    'Italian cuisine is known for pasta, pizza, and risotto.',
    'Proper knife skills are essential for any chef.',
    // Sports
    'Basketball is played with two teams of five players.',
    'Soccer is the most popular sport in the world.',
    'Tennis matches can last for several hours.',
  ];

  console.log('Generating embeddings for clustering...');
  console.log(`Number of documents: ${documents.length}\n`);

  const requests = documents.map((text) => ({
    content: {
      parts: [{ text }],
    },
    taskType: 'CLUSTERING' as const,
  }));

  const response = await client.embeddings.batchEmbed('models/text-embedding-004', requests);

  console.log('Computing pairwise similarities...\n');

  // Compute similarity matrix
  const embeddings = response.embeddings.map((emb) => emb.values);

  console.log('Documents grouped by similarity:\n');

  // Simple clustering: find most similar documents
  const processed = new Set<number>();

  for (let i = 0; i < documents.length; i++) {
    if (processed.has(i)) continue;

    const cluster = [i];
    processed.add(i);

    for (let j = i + 1; j < documents.length; j++) {
      if (processed.has(j)) continue;

      const similarity = cosineSimilarity(embeddings[i], embeddings[j]);
      if (similarity > 0.6) {
        // Threshold for clustering
        cluster.push(j);
        processed.add(j);
      }
    }

    console.log(`Cluster ${processed.size / cluster.length}:`);
    for (const idx of cluster) {
      console.log(`  - ${documents[idx]}`);
    }
    console.log();
  }
}

/**
 * Example 6: Using embeddings with titles
 */
async function exampleWithTitle(): Promise<void> {
  console.log('\n=== Example 6: Embeddings with Titles ===\n');

  const client = createClientFromEnv();

  const title = 'Introduction to Quantum Computing';
  const content = `Quantum computing uses quantum mechanical phenomena such as superposition
and entanglement to process information in ways that classical computers cannot.`;

  console.log(`Title: "${title}"`);
  console.log(`Content: "${content}"\n`);

  const response = await client.embeddings.embed('models/text-embedding-004', {
    content: {
      parts: [{ text: content }],
    },
    taskType: 'RETRIEVAL_DOCUMENT',
    title,
  });

  console.log('Embedding with title generated successfully!');
  console.log(`Dimensions: ${response.embedding.values.length}`);
  console.log(`First 5 values: [${response.embedding.values.slice(0, 5).join(', ')}...]`);
}

/**
 * Main function running all examples
 */
async function main(): Promise<void> {
  try {
    console.log('=== Embeddings Examples ===');

    await exampleSingleEmbedding();
    await exampleBatchEmbeddings();
    await exampleTaskTypes();
    await exampleSemanticSimilarity();
    await exampleClustering();
    await exampleWithTitle();

    console.log('\n=== All examples completed successfully! ===');
  } catch (error) {
    console.error('\nError during embeddings generation:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Run the examples
main();

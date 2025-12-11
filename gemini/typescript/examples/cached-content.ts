/**
 * Cached Content Example
 *
 * This example demonstrates:
 * - Creating cached content with TTL
 * - Using cached content in generation requests
 * - Updating cached content expiration
 * - Listing cached content
 * - Deleting cached content
 *
 * Cached content allows you to cache large context data (like documents)
 * and reuse it across multiple generation requests, reducing costs and latency.
 *
 * Prerequisites:
 * - Set the GEMINI_API_KEY environment variable
 *
 * Usage:
 * ```bash
 * export GEMINI_API_KEY="your-api-key"
 * npm run build
 * node dist/examples/cached-content.js
 * ```
 */

import { createClientFromEnv } from '../src/index.js';

/**
 * Example 1: Create cached content with TTL
 */
async function exampleCreateCachedContent(): Promise<string> {
  console.log('\n=== Example 1: Create Cached Content ===\n');

  const client = createClientFromEnv();

  // Create a large context to cache
  const systemInstruction = `You are an expert in quantum physics. You have deep knowledge of:
- Quantum mechanics principles
- Wave-particle duality
- Quantum entanglement
- Superposition
- Quantum computing
- Schrödinger's equation
- Heisenberg uncertainty principle

When answering questions, be precise, technical, and educational.`;

  const contextDocument = `# Introduction to Quantum Computing

Quantum computing is a revolutionary approach to computation that leverages quantum mechanical phenomena
such as superposition and entanglement to process information. Unlike classical computers that use bits
(0 or 1), quantum computers use quantum bits or qubits that can exist in multiple states simultaneously.

## Key Principles

### Superposition
A qubit can be in a state of 0, 1, or any quantum superposition of these states. This allows quantum
computers to process vast amounts of information simultaneously.

### Entanglement
Quantum entanglement is a phenomenon where qubits become correlated in such a way that the state of
one qubit depends on the state of another, regardless of the distance between them.

### Quantum Gates
Quantum gates manipulate qubits to perform calculations. Unlike classical logic gates, quantum gates
are reversible and operate on the probability amplitudes of quantum states.

## Applications
- Cryptography and security
- Drug discovery and molecular modeling
- Optimization problems
- Machine learning and AI
- Financial modeling`;

  console.log('Creating cached content with system instruction and context...');
  console.log(`TTL: 3600 seconds (1 hour)\n`);

  const cachedContent = await client.cachedContent.create({
    model: 'models/gemini-2.0-flash-exp',
    contents: [
      {
        role: 'user',
        parts: [{ text: contextDocument }],
      },
    ],
    systemInstruction: {
      parts: [{ text: systemInstruction }],
    },
    ttl: '3600s', // Cache for 1 hour
  });

  console.log('Cached content created successfully!');
  console.log(`Name: ${cachedContent.name}`);
  console.log(`Model: ${cachedContent.model}`);
  console.log(`Created: ${cachedContent.createTime}`);
  console.log(`Updated: ${cachedContent.updateTime}`);
  console.log(`Expires: ${cachedContent.expireTime}`);

  if (cachedContent.usageMetadata) {
    console.log(`\nUsage Metadata:`);
    console.log(`  Total Token Count: ${cachedContent.usageMetadata.totalTokenCount}`);
  }

  return cachedContent.name;
}

/**
 * Example 2: Use cached content in generation
 */
async function exampleUseCache(cacheName: string): Promise<void> {
  console.log('\n=== Example 2: Generate Content Using Cache ===\n');

  const client = createClientFromEnv();

  console.log(`Using cached content: ${cacheName}`);
  console.log('Generating response to query about quantum computing...\n');

  // Use the cached content in a generation request
  // The cache name is passed in the GenerateContentRequest
  const response = await client.content.generate('gemini-2.0-flash-exp', {
    contents: [
      {
        parts: [
          {
            text: 'Based on the context provided, explain quantum entanglement in simple terms.',
          },
        ],
      },
    ],
    // Reference the cached content by name
    cachedContent: cacheName,
  });

  if (response.candidates && response.candidates.length > 0) {
    const text = response.candidates[0].content?.parts
      .map((part) => ('text' in part ? part.text : ''))
      .join('');

    console.log('Generated Response:');
    console.log(text);

    // Show usage metadata
    if (response.usageMetadata) {
      console.log('\n--- Token Usage ---');
      console.log(`Prompt Tokens: ${response.usageMetadata.promptTokenCount}`);
      console.log(`Candidates Tokens: ${response.usageMetadata.candidatesTokenCount}`);
      console.log(`Total Tokens: ${response.usageMetadata.totalTokenCount}`);

      // Cached content usage
      if (response.usageMetadata.cachedContentTokenCount) {
        console.log(`Cached Content Tokens: ${response.usageMetadata.cachedContentTokenCount}`);
        console.log('(These tokens were served from cache, reducing cost!)');
      }
    }
  }
}

/**
 * Example 3: List cached contents
 */
async function exampleListCachedContent(): Promise<void> {
  console.log('\n=== Example 3: List Cached Contents ===\n');

  const client = createClientFromEnv();

  console.log('Listing all cached contents...\n');

  const response = await client.cachedContent.list({
    pageSize: 10,
  });

  if (response.cachedContents && response.cachedContents.length > 0) {
    console.log(`Found ${response.cachedContents.length} cached content(s):\n`);

    for (const cache of response.cachedContents) {
      console.log(`- ${cache.name}`);
      console.log(`  Model: ${cache.model}`);
      console.log(`  Created: ${cache.createTime}`);
      console.log(`  Expires: ${cache.expireTime}`);

      if (cache.usageMetadata) {
        console.log(`  Tokens: ${cache.usageMetadata.totalTokenCount}`);
      }

      console.log();
    }

    if (response.nextPageToken) {
      console.log('More cached contents available. Use nextPageToken to fetch next page.');
    }
  } else {
    console.log('No cached contents found.');
  }
}

/**
 * Example 4: Get cached content metadata
 */
async function exampleGetCachedContent(cacheName: string): Promise<void> {
  console.log('\n=== Example 4: Get Cached Content Metadata ===\n');

  const client = createClientFromEnv();

  console.log(`Fetching metadata for: ${cacheName}\n`);

  const cachedContent = await client.cachedContent.get(cacheName);

  console.log('Cached content details:');
  console.log(`Name: ${cachedContent.name}`);
  console.log(`Model: ${cachedContent.model}`);
  console.log(`Display Name: ${cachedContent.displayName || 'N/A'}`);
  console.log(`Created: ${cachedContent.createTime}`);
  console.log(`Updated: ${cachedContent.updateTime}`);
  console.log(`Expires: ${cachedContent.expireTime}`);

  if (cachedContent.usageMetadata) {
    console.log(`\nUsage Metadata:`);
    console.log(`  Total Token Count: ${cachedContent.usageMetadata.totalTokenCount}`);
  }

  console.log(`\nSystem Instruction:`);
  if (cachedContent.systemInstruction) {
    const sysText = cachedContent.systemInstruction.parts
      .map((part) => ('text' in part ? part.text : ''))
      .join('');
    console.log(sysText.substring(0, 150) + '...');
  }

  console.log(`\nContents: ${cachedContent.contents.length} item(s)`);
}

/**
 * Example 5: Update cached content expiration
 */
async function exampleUpdateCachedContent(cacheName: string): Promise<void> {
  console.log('\n=== Example 5: Update Cached Content Expiration ===\n');

  const client = createClientFromEnv();

  console.log(`Updating expiration for: ${cacheName}`);
  console.log('Extending TTL by 1 hour...\n');

  const updatedCache = await client.cachedContent.update(cacheName, {
    ttl: '7200s', // 2 hours
  });

  console.log('Cached content updated successfully!');
  console.log(`Name: ${updatedCache.name}`);
  console.log(`Updated: ${updatedCache.updateTime}`);
  console.log(`New Expiration: ${updatedCache.expireTime}`);
}

/**
 * Example 6: Create cached content with absolute expiration time
 */
async function exampleCreateWithExpireTime(): Promise<string | null> {
  console.log('\n=== Example 6: Create with Absolute Expiration Time ===\n');

  const client = createClientFromEnv();

  // Set expiration to 2 hours from now
  const expireTime = new Date(Date.now() + 2 * 60 * 60 * 1000);

  console.log('Creating cached content with absolute expiration time...');
  console.log(`Expires at: ${expireTime.toISOString()}\n`);

  try {
    const cachedContent = await client.cachedContent.create({
      model: 'models/gemini-2.0-flash-exp',
      contents: [
        {
          parts: [{ text: 'This is a short cached context for demonstration.' }],
        },
      ],
      expireTime: expireTime.toISOString(),
    });

    console.log('Cached content created successfully!');
    console.log(`Name: ${cachedContent.name}`);
    console.log(`Expires: ${cachedContent.expireTime}`);

    return cachedContent.name;
  } catch (error) {
    console.log('Note: This may fail if the model or API does not support absolute expireTime.');
    console.log('Error:', error);
    return null;
  }
}

/**
 * Example 7: Delete cached content
 */
async function exampleDeleteCachedContent(cacheName: string): Promise<void> {
  console.log('\n=== Example 7: Delete Cached Content ===\n');

  const client = createClientFromEnv();

  console.log(`Deleting cached content: ${cacheName}`);

  await client.cachedContent.delete(cacheName);

  console.log('Cached content deleted successfully!');

  // Verify deletion
  try {
    await client.cachedContent.get(cacheName);
    console.log('WARNING: Cached content still exists after deletion!');
  } catch (error) {
    console.log('Verified: Cached content no longer exists.');
  }
}

/**
 * Main function running all examples
 */
async function main(): Promise<void> {
  let cacheName1: string | null = null;
  let cacheName2: string | null = null;

  try {
    console.log('=== Cached Content Examples ===');

    // Create cached content
    cacheName1 = await exampleCreateCachedContent();

    // Use cached content
    await exampleUseCache(cacheName1);

    // List and get
    await exampleListCachedContent();
    await exampleGetCachedContent(cacheName1);

    // Update expiration
    await exampleUpdateCachedContent(cacheName1);

    // Create with absolute expiration time
    cacheName2 = await exampleCreateWithExpireTime();

    console.log('\n=== All examples completed successfully! ===');
  } catch (error) {
    console.error('\nError during cached content operations:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  } finally {
    // Clean up: Delete cached contents
    console.log('\n=== Cleanup ===\n');

    const client = createClientFromEnv();

    if (cacheName1) {
      try {
        await exampleDeleteCachedContent(cacheName1);
      } catch (error) {
        console.error(`Failed to delete ${cacheName1}:`, error);
      }
    }

    if (cacheName2) {
      try {
        await exampleDeleteCachedContent(cacheName2);
      } catch (error) {
        console.error(`Failed to delete ${cacheName2}:`, error);
      }
    }
  }
}

// Run the examples
main();

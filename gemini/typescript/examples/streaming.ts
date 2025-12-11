/**
 * Streaming Content Generation Example
 *
 * This example demonstrates:
 * - Creating a Gemini client from environment variables
 * - Using generateStream for streaming responses
 * - Handling chunks with async for...of
 * - Accumulating and printing the complete response
 *
 * Prerequisites:
 * - Set the GEMINI_API_KEY environment variable
 *
 * Usage:
 * ```bash
 * export GEMINI_API_KEY="your-api-key"
 * npm run build
 * node dist/examples/streaming.js
 * ```
 */

import { createClientFromEnv } from '../src/index.js';

/**
 * Main function demonstrating streaming content generation
 */
async function main(): Promise<void> {
  try {
    console.log('=== Streaming Content Generation Example ===\n');

    // Step 1: Create client from environment variables
    console.log('Creating Gemini client from environment...');
    const client = createClientFromEnv();
    console.log('Client created successfully.\n');

    // Step 2: Generate streaming content
    console.log('Starting streaming generation...');
    const prompt = 'Write a short story about a robot learning to paint. Keep it to 3 paragraphs.';
    console.log(`Prompt: "${prompt}"\n`);

    console.log('--- Streaming Response ---\n');

    // Accumulate the full text as chunks arrive
    let fullText = '';
    let chunkCount = 0;
    let totalTokens = 0;

    // Step 3: Process chunks with async for...of
    const stream = client.content.generateStream('gemini-2.0-flash-exp', {
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
    });

    for await (const chunk of stream) {
      chunkCount++;

      // Extract text from the chunk
      if (chunk.candidates && chunk.candidates.length > 0) {
        const candidate = chunk.candidates[0];
        const chunkText = candidate.content?.parts
          .map((part) => ('text' in part ? part.text : ''))
          .join('');

        // Print chunk as it arrives (simulating real-time streaming)
        if (chunkText) {
          process.stdout.write(chunkText);
          fullText += chunkText;
        }

        // Track usage metadata from the last chunk
        if (chunk.usageMetadata) {
          totalTokens = chunk.usageMetadata.totalTokenCount || 0;
        }
      }
    }

    // Step 4: Print summary after streaming completes
    console.log('\n\n--- Streaming Summary ---');
    console.log(`Total chunks received: ${chunkCount}`);
    console.log(`Full text length: ${fullText.length} characters`);
    console.log(`Total tokens used: ${totalTokens}`);

    console.log('\n=== Example completed successfully! ===');
  } catch (error) {
    console.error('\nError during streaming:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Run the example
main();

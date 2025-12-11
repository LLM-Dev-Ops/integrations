/**
 * Basic Content Generation Example
 *
 * This example demonstrates:
 * - Creating a Gemini client from environment variables
 * - Simple text generation with the Gemini API
 * - Handling responses and printing results
 *
 * Prerequisites:
 * - Set the GEMINI_API_KEY environment variable
 *
 * Usage:
 * ```bash
 * export GEMINI_API_KEY="your-api-key"
 * npm run build
 * node dist/examples/basic.js
 * ```
 */

import { createClientFromEnv } from '../src/index.js';

/**
 * Main function demonstrating basic content generation
 */
async function main(): Promise<void> {
  try {
    console.log('=== Basic Content Generation Example ===\n');

    // Step 1: Create client from environment variables
    console.log('Creating Gemini client from environment...');
    const client = createClientFromEnv();
    console.log('Client created successfully.\n');

    // Step 2: Generate content with a simple text prompt
    console.log('Generating content...');
    const prompt = 'Explain quantum computing in 2-3 sentences for a beginner.';
    console.log(`Prompt: "${prompt}"\n`);

    const response = await client.content.generate('gemini-2.0-flash-exp', {
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
    });

    // Step 3: Print the response
    console.log('Response received!\n');
    console.log('--- Generated Content ---');

    // Extract text from the first candidate
    if (response.candidates && response.candidates.length > 0) {
      const candidate = response.candidates[0];
      const textParts = candidate.content?.parts
        .map((part) => ('text' in part ? part.text : ''))
        .join('');

      console.log(textParts);
      console.log('\n--- Metadata ---');
      console.log(`Finish Reason: ${candidate.finishReason}`);
    }

    // Step 4: Show usage metadata if available
    if (response.usageMetadata) {
      console.log('\n--- Token Usage ---');
      console.log(`Prompt Tokens: ${response.usageMetadata.promptTokenCount}`);
      console.log(`Candidates Tokens: ${response.usageMetadata.candidatesTokenCount}`);
      console.log(`Total Tokens: ${response.usageMetadata.totalTokenCount}`);
    }

    console.log('\n=== Example completed successfully! ===');
  } catch (error) {
    console.error('Error during content generation:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
    }
    process.exit(1);
  }
}

// Run the example
main();

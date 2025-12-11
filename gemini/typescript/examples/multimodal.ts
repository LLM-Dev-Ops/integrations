/**
 * Multimodal Content Generation Example
 *
 * This example demonstrates:
 * - Text + image input (base64 encoded)
 * - Using file URIs from uploaded files
 * - Handling multimodal responses
 *
 * Prerequisites:
 * - Set the GEMINI_API_KEY environment variable
 *
 * Usage:
 * ```bash
 * export GEMINI_API_KEY="your-api-key"
 * npm run build
 * node dist/examples/multimodal.js
 * ```
 */

import { createClientFromEnv } from '../src/index.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Example 1: Generate content with base64-encoded image
 */
async function exampleWithBase64Image(): Promise<void> {
  console.log('\n=== Example 1: Text + Base64 Image ===\n');

  const client = createClientFromEnv();

  // Create a simple base64-encoded 1x1 red pixel PNG
  // In a real application, you would read an actual image file
  const redPixelBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

  console.log('Generating content with text + base64 image...');

  const response = await client.content.generate('gemini-2.0-flash-exp', {
    contents: [
      {
        parts: [
          { text: 'What do you see in this image? Describe it in detail.' },
          {
            inlineData: {
              mimeType: 'image/png',
              data: redPixelBase64,
            },
          },
        ],
      },
    ],
  });

  if (response.candidates && response.candidates.length > 0) {
    const text = response.candidates[0].content?.parts
      .map((part) => ('text' in part ? part.text : ''))
      .join('');

    console.log('Response:', text);
  }
}

/**
 * Example 2: Generate content with file URI
 */
async function exampleWithFileUri(): Promise<void> {
  console.log('\n=== Example 2: Text + File URI ===\n');

  const client = createClientFromEnv();

  // First, upload a file
  console.log('Step 1: Uploading an image file...');

  // Create a simple test image (1x1 blue pixel PNG)
  const bluePixelBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64'
  );

  const uploadedFile = await client.files.upload({
    fileData: bluePixelBytes,
    mimeType: 'image/png',
    displayName: 'test-image.png',
  });

  console.log(`File uploaded: ${uploadedFile.name}`);
  console.log(`File URI: ${uploadedFile.uri}`);
  console.log(`File state: ${uploadedFile.state}`);

  // Wait for file to become ACTIVE
  if (uploadedFile.state === 'PROCESSING') {
    console.log('\nWaiting for file to become ACTIVE...');
    const activeFile = await client.files.waitForActive(uploadedFile.name);
    console.log(`File is now ACTIVE: ${activeFile.name}`);
  }

  // Step 2: Use the file URI in generation
  console.log('\nStep 2: Generating content with file URI...');

  const response = await client.content.generate('gemini-2.0-flash-exp', {
    contents: [
      {
        parts: [
          { text: 'Describe what you see in this image.' },
          {
            fileData: {
              fileUri: uploadedFile.uri,
              mimeType: 'image/png',
            },
          },
        ],
      },
    ],
  });

  if (response.candidates && response.candidates.length > 0) {
    const text = response.candidates[0].content?.parts
      .map((part) => ('text' in part ? part.text : ''))
      .join('');

    console.log('Response:', text);
  }

  // Clean up: Delete the uploaded file
  console.log('\nStep 3: Cleaning up...');
  await client.files.delete(uploadedFile.name);
  console.log('File deleted successfully.');
}

/**
 * Example 3: Multiple images with text
 */
async function exampleWithMultipleImages(): Promise<void> {
  console.log('\n=== Example 3: Multiple Images + Text ===\n');

  const client = createClientFromEnv();

  // Create two simple test images
  const redPixelBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
  const bluePixelBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

  console.log('Generating content with multiple images...');

  const response = await client.content.generate('gemini-2.0-flash-exp', {
    contents: [
      {
        parts: [
          { text: 'Here are two images:' },
          {
            inlineData: {
              mimeType: 'image/png',
              data: redPixelBase64,
            },
          },
          { text: 'and' },
          {
            inlineData: {
              mimeType: 'image/png',
              data: bluePixelBase64,
            },
          },
          { text: 'What colors do you see?' },
        ],
      },
    ],
  });

  if (response.candidates && response.candidates.length > 0) {
    const text = response.candidates[0].content?.parts
      .map((part) => ('text' in part ? part.text : ''))
      .join('');

    console.log('Response:', text);
  }
}

/**
 * Main function running all examples
 */
async function main(): Promise<void> {
  try {
    console.log('=== Multimodal Content Generation Examples ===');

    // Run all examples
    await exampleWithBase64Image();
    await exampleWithFileUri();
    await exampleWithMultipleImages();

    console.log('\n=== All examples completed successfully! ===');
  } catch (error) {
    console.error('\nError during multimodal generation:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Run the examples
main();

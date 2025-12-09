/**
 * Vision (image analysis) example
 *
 * This example demonstrates how to send images to Claude for analysis.
 * Claude can describe images, answer questions about them, and extract information.
 *
 * ## Usage
 *
 * Provide an image file path as an argument:
 * ```bash
 * export ANTHROPIC_API_KEY=sk-ant-api03-...
 * npx tsx examples/vision.ts /path/to/image.jpg
 * ```
 */

import { createClientFromEnv } from '../src/index.js';
import { readFileSync } from 'fs';
import { extname } from 'path';

async function main() {
  console.log('Anthropic Vision Example');
  console.log('========================\n');

  const client = createClientFromEnv();

  // Get image path from command line args
  const imagePath = process.argv[2];

  if (!imagePath) {
    console.log("No image path provided. Here's how to use this example:\n");
    console.log('  npx tsx examples/vision.ts /path/to/your/image.jpg\n');
    console.log('Supported formats: .jpg, .jpeg, .png, .gif, .webp\n');
    console.log('Example questions you can ask about images:');
    console.log("  - What's in this image?");
    console.log('  - Describe this image in detail');
    console.log('  - What colors are prominent in this image?');
    console.log('  - Is there any text in this image? If so, what does it say?');
    console.log("  - What's the mood or atmosphere of this image?");
    return;
  }

  console.log(`Loading image from: ${imagePath}\n`);

  try {
    // Read image file
    const imageData = readFileSync(imagePath);

    // Determine media type from file extension
    const ext = extname(imagePath).toLowerCase();
    let mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

    switch (ext) {
      case '.jpg':
      case '.jpeg':
        mediaType = 'image/jpeg';
        break;
      case '.png':
        mediaType = 'image/png';
        break;
      case '.gif':
        mediaType = 'image/gif';
        break;
      case '.webp':
        mediaType = 'image/webp';
        break;
      default:
        throw new Error('Unsupported image format. Use .jpg, .png, .gif, or .webp');
    }

    // Encode to base64
    const base64Image = imageData.toString('base64');

    // Questions to ask about the image
    const questions = [
      "What's in this image? Describe it in detail.",
      'What are the main colors in this image?',
      'Is there any text visible in the image? If so, what does it say?',
    ];

    for (let i = 0; i < questions.length; i++) {
      const question = questions[i];
      console.log(`Question ${i + 1}: ${question}\n`);

      // Create request with image and question
      const response = await client.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType,
                  data: base64Image,
                },
              },
              {
                type: 'text',
                text: question,
              },
            ],
          },
        ],
      });

      console.log('Analyzing image...\n');
      console.log("Claude's response:");
      console.log('---');
      for (const block of response.content) {
        if (block.type === 'text') {
          console.log(block.text);
        }
      }
      console.log('---\n');

      if (i === 0) {
        // Show token usage for first request
        console.log('Token usage:');
        console.log(`  Input tokens:  ${response.usage.input_tokens}`);
        console.log(`  Output tokens: ${response.usage.output_tokens}`);
        console.log('Note: Input tokens include the image encoding (images typically use ~700-1500 tokens)\n');
      }
    }

    console.log('\n=== Tips for Vision ===');
    console.log('- Claude can analyze images in various formats (JPG, PNG, GIF, WebP)');
    console.log('- Supported image sizes: up to 5MB for images up to 1568px on longest side');
    console.log('- Claude can identify objects, read text (OCR), describe scenes, and answer questions');
    console.log('- For best results, use clear, high-quality images');
    console.log('- You can combine multiple images in a single request');

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();

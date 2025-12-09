/**
 * Streaming chat completion example
 *
 * This example demonstrates how to stream responses from Claude in real-time,
 * displaying the text as it's generated token by token.
 *
 * ## Usage
 *
 * ```bash
 * export ANTHROPIC_API_KEY=sk-ant-api03-...
 * npx tsx examples/streaming.ts
 * ```
 */

import { createClientFromEnv } from '../src/index.js';

async function main() {
  console.log('Anthropic Streaming Example');
  console.log('===========================\n');

  const client = createClientFromEnv();

  // Create a request that will stream the response
  const request = {
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 2048,
    messages: [
      {
        role: 'user' as const,
        content: 'Write a short story about a robot learning to paint. Keep it under 200 words.',
      },
    ],
    stream: true,
  };

  console.log('Asking Claude to write a story (streaming)...\n');
  console.log('Response:');
  console.log('---');

  try {
    // Create the stream
    const stream = await client.messages.stream(request);

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let messageId = '';

    // Process stream events as they arrive
    for await (const event of stream) {
      switch (event.type) {
        case 'message_start':
          messageId = event.message.id;
          totalInputTokens = event.message.usage.input_tokens;
          break;

        case 'content_block_start':
          // New content block started
          break;

        case 'content_block_delta':
          // Print text deltas as they arrive
          if (event.delta.type === 'text_delta') {
            process.stdout.write(event.delta.text);
          }
          break;

        case 'content_block_stop':
          // Content block completed
          break;

        case 'message_delta':
          totalOutputTokens = event.usage.output_tokens;
          if (event.delta.stop_reason) {
            console.log(`\n\n[Stop reason: ${event.delta.stop_reason}]`);
          }
          break;

        case 'message_stop':
          console.log('\n---\n');
          console.log('[Stream completed]');
          break;

        case 'ping':
          // Ping event to keep connection alive
          break;

        case 'error':
          console.error('\nStream error:', event.error);
          throw new Error(`Stream error: ${event.error.message}`);
      }
    }

    // Display usage statistics
    console.log('\nToken Usage:');
    console.log(`  Input tokens:  ${totalInputTokens}`);
    console.log(`  Output tokens: ${totalOutputTokens}`);
    console.log(`  Total tokens:  ${totalInputTokens + totalOutputTokens}`);
    console.log(`\nMessage ID: ${messageId}`);

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();

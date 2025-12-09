/**
 * Basic chat completion example
 *
 * This example demonstrates how to create a simple chat completion request
 * to Claude and display the response with token usage information.
 *
 * ## Usage
 *
 * Set your API key as an environment variable:
 * ```bash
 * export ANTHROPIC_API_KEY=sk-ant-api03-...
 * npx tsx examples/basic-chat.ts
 * ```
 */

import { createClientFromEnv, AnthropicError, RateLimitError, AuthenticationError } from '../src/index.js';

async function main() {
  console.log('Anthropic Basic Chat Example');
  console.log('=============================\n');

  // Create client from environment variable ANTHROPIC_API_KEY
  const client = createClientFromEnv();

  // Create a simple message request
  const request = {
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 1024,
    messages: [{ role: 'user' as const, content: 'What is the capital of France?' }],
  };

  console.log('Sending request to Claude...\n');

  try {
    // Send the request and handle the response
    const response = await client.messages.create(request);

    console.log('Response from Claude:');
    console.log('---');

    // Display each content block in the response
    response.content.forEach((block, i) => {
      console.log(`Content Block ${i + 1}:`);
      if (block.type === 'text') {
        console.log(block.text + '\n');
      }
    });

    console.log('---\n');

    // Display usage statistics
    console.log('Token Usage:');
    console.log(`  Input tokens:  ${response.usage.input_tokens}`);
    console.log(`  Output tokens: ${response.usage.output_tokens}`);
    console.log(`  Total tokens:  ${response.usage.input_tokens + response.usage.output_tokens}`);

    // Display stop reason
    if (response.stop_reason) {
      console.log(`\nStop reason: ${response.stop_reason}`);
    }

    // Display model information
    console.log(`Model: ${response.model}`);
    console.log(`Message ID: ${response.id}`);

  } catch (error) {
    console.error('Error:', error);

    // Provide specific guidance based on error type
    if (error instanceof AuthenticationError) {
      console.error('\nMake sure your ANTHROPIC_API_KEY environment variable is set correctly.');
      console.error('You can get your API key from: https://console.anthropic.com/');
    } else if (error instanceof RateLimitError) {
      console.error('\nYou\'ve hit the rate limit.');
      if (error.retryAfter) {
        console.error(`Retry after: ${error.retryAfter} seconds`);
      }
    } else if (error instanceof AnthropicError) {
      console.error(`\nAPI Error: ${error.message}`);
      if (error.status) {
        console.error(`Status code: ${error.status}`);
      }
    }

    process.exit(1);
  }
}

main();

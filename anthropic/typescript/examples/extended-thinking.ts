/**
 * Extended thinking example
 *
 * This example demonstrates how to use Claude's extended thinking feature
 * for complex reasoning tasks. Extended thinking allows Claude to "think through"
 * problems step by step before providing an answer.
 *
 * ## Usage
 *
 * ```bash
 * export ANTHROPIC_API_KEY=sk-ant-api03-...
 * npx tsx examples/extended-thinking.ts
 * ```
 */

import { createClient, AnthropicConfigBuilder } from '../src/index.js';

async function main() {
  console.log('Anthropic Extended Thinking Example');
  console.log('===================================\n');

  // Enable extended thinking beta feature
  const config = new AnthropicConfigBuilder()
    .withApiKey(process.env.ANTHROPIC_API_KEY!)
    .withBetaFeature('extended-thinking-2025-01-01')
    .build();

  const client = createClient(config);

  // A complex problem that benefits from extended thinking
  const problem = `You are designing a distributed caching system for a high-traffic e-commerce platform.
The system needs to handle 100,000 requests per second with sub-10ms latency.
Consider the following requirements:
1. Data consistency across multiple regions
2. Cache invalidation strategies
3. Memory optimization
4. Failure recovery

Design a comprehensive architecture with specific technology recommendations.`;

  console.log('Problem:');
  console.log(problem);
  console.log();

  try {
    // Create request with extended thinking enabled
    const response = await client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 16000, // Higher token limit for thinking + response
      messages: [{ role: 'user', content: problem }],
      thinking: {
        type: 'enabled',
        budget_tokens: 10000, // Allocate tokens for thinking
      },
    });

    console.log('Claude is thinking through the problem...\n');
    console.log('This may take a moment as Claude reasons through the solution.\n');

    // Display thinking process and answer
    let hasThinking = false;

    for (const block of response.content) {
      if (block.type === 'thinking') {
        hasThinking = true;
        console.log('=== Thinking Process ===');
        console.log(block.thinking);
        console.log();
      } else if (block.type === 'text') {
        if (hasThinking) {
          console.log('=== Final Answer ===');
        }
        console.log(block.text);
        console.log();
      }
    }

    // Display usage statistics
    console.log('=== Token Usage ===');
    console.log(`Input tokens:  ${response.usage.input_tokens}`);
    console.log(`Output tokens: ${response.usage.output_tokens}`);
    console.log(`Total tokens:  ${response.usage.input_tokens + response.usage.output_tokens}`);

    if (response.stop_reason) {
      console.log(`\nStop reason: ${response.stop_reason}`);
    }

    console.log('\nNote: Extended thinking allows Claude to reason through complex problems');
    console.log('before providing an answer, leading to more thorough and well-reasoned responses.');

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();

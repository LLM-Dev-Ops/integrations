/**
 * Multi-turn conversation example
 *
 * This example demonstrates how to maintain a conversation with Claude
 * across multiple turns, keeping track of the conversation history.
 *
 * ## Usage
 *
 * ```bash
 * export ANTHROPIC_API_KEY=sk-ant-api03-...
 * npx tsx examples/multi-turn.ts
 * ```
 */

import { createClientFromEnv } from '../src/index.js';
import * as readline from 'readline';

async function main() {
  console.log('Anthropic Multi-Turn Conversation Example');
  console.log('==========================================\n');
  console.log('This is an interactive chat with Claude.');
  console.log("Type your messages and press Enter. Type 'quit' or 'exit' to end.\n");

  const client = createClientFromEnv();

  // Conversation history
  const messages: any[] = [];

  // System prompt to set context
  const systemPrompt = [
    {
      type: 'text',
      text: `You are a helpful AI assistant. Be concise but friendly.
If asked about yourself, explain that you are Claude, made by Anthropic.`,
    },
  ];

  // Create readline interface for user input
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(prompt, resolve);
    });
  };

  try {
    while (true) {
      // Get user input
      const userInput = await question('\nYou: ');
      const userMessage = userInput.trim();

      // Check for exit commands
      if (userMessage.toLowerCase() === 'quit' || userMessage.toLowerCase() === 'exit') {
        console.log('\nGoodbye!');
        break;
      }

      // Skip empty messages
      if (!userMessage) {
        continue;
      }

      // Add user message to history
      messages.push({ role: 'user', content: userMessage });

      // Create request with conversation history
      try {
        process.stdout.write('\nClaude: ');

        const response = await client.messages.create({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 1024,
          messages,
          system: systemPrompt,
        });

        // Extract and display assistant's response
        let assistantText = '';

        for (const block of response.content) {
          if (block.type === 'text') {
            assistantText += block.text;
          }
        }

        console.log(assistantText);

        // Add assistant's response to history
        messages.push({ role: 'assistant', content: response.content });

        // Display token usage
        console.log(`\n[Tokens: ${response.usage.input_tokens} in, ${response.usage.output_tokens} out]`);

      } catch (error) {
        console.error('\nError:', error);
        console.error('The conversation history will be preserved. You can try again.');
        // Remove the failed user message
        messages.pop();
      }
    }

    // Display conversation summary
    console.log('\n=== Conversation Summary ===');
    console.log(`Total turns: ${messages.length / 2}`);
    console.log(`Messages in history: ${messages.length}`);

  } finally {
    rl.close();
  }
}

main();

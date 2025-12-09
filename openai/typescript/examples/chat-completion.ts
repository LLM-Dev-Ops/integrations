/**
 * Example: Basic chat completion
 */
import { createClientFromEnv, ChatCompletionRequest } from '../src/index.js';

async function main(): Promise<void> {
  const client = createClientFromEnv();

  const request: ChatCompletionRequest = {
    model: 'gpt-4',
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'What is TypeScript?' },
    ],
    temperature: 0.7,
    max_tokens: 500,
  };

  const response = await client.chat.create(request);

  console.log('Response:', response.choices[0].message.content);
  console.log('Usage:', response.usage?.total_tokens, 'tokens');
}

main().catch(console.error);

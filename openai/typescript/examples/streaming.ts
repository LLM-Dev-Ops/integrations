import { createClient } from '../src/index.js';

async function main(): Promise<void> {
  const client = createClient({
    apiKey: process.env.OPENAI_API_KEY ?? '',
  });

  console.log('Streaming chat completion...\n');

  const stream = client.chat.stream({
    model: 'gpt-4',
    messages: [
      { role: 'user', content: 'Write a short poem about TypeScript.' },
    ],
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta.content;
    if (content) {
      process.stdout.write(content);
    }
  }

  console.log('\n\nDone!');
}

main().catch(console.error);

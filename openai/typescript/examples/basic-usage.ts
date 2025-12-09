import { createClient } from '../src/index.js';

async function main(): Promise<void> {
  const client = createClient({
    apiKey: process.env.OPENAI_API_KEY ?? '',
  });

  const chatResponse = await client.chat.create({
    model: 'gpt-4',
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'What is the capital of France?' },
    ],
    temperature: 0.7,
    max_tokens: 100,
  });

  console.log('Chat Response:', chatResponse.choices[0]?.message.content);

  const embeddingResponse = await client.embeddings.create({
    model: 'text-embedding-ada-002',
    input: 'Hello, world!',
  });

  console.log('Embedding dimensions:', embeddingResponse.data[0]?.embedding.length);

  const models = await client.models.list();
  console.log('Available models:', models.data.length);
}

main().catch(console.error);

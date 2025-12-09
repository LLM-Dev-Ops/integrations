/**
 * Example: Streaming chat completion with accumulator
 */
import { createClientFromEnv, ChatCompletionStreamAccumulator } from '../src/index.js';

async function main(): Promise<void> {
  const client = createClientFromEnv();

  const stream = client.chat.stream({
    model: 'gpt-4',
    messages: [{ role: 'user', content: 'Tell me a short story about a robot.' }],
  });

  process.stdout.write('Response: ');

  const accumulator = new ChatCompletionStreamAccumulator();

  for await (const chunk of stream) {
    accumulator.process(chunk);

    const content = chunk.choices[0]?.delta?.content;
    if (content) {
      process.stdout.write(content);
    }
  }

  console.log('\n\n--- Final Response ---');
  const finalResponse = accumulator.getResponse();
  console.log('Full content:', accumulator.getContent());
  console.log('Model:', finalResponse.model);
  console.log('Finish reason:', finalResponse.choices[0].finish_reason);
}

main().catch(console.error);

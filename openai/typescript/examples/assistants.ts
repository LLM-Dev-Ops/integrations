import { createClient } from '../src/index.js';

async function main(): Promise<void> {
  const client = createClient({
    apiKey: process.env.OPENAI_API_KEY ?? '',
  });

  const assistant = await client.assistants.create({
    name: 'Math Tutor',
    instructions: 'You are a personal math tutor. Help students with their math questions.',
    model: 'gpt-4',
    tools: [{ type: 'code_interpreter' }],
  });

  console.log('Created assistant:', assistant.id);

  const thread = await client.assistants.threads.create();
  console.log('Created thread:', thread.id);

  const message = await client.assistants.messages.create(thread.id, {
    role: 'user',
    content: 'What is 25 * 17?',
  });

  console.log('Created message:', message.id);

  const run = await client.assistants.runs.create(thread.id, {
    assistant_id: assistant.id,
  });

  console.log('Created run:', run.id);

  let runStatus = run;
  while (runStatus.status === 'queued' || runStatus.status === 'in_progress') {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    runStatus = await client.assistants.runs.retrieve(thread.id, run.id);
    console.log('Run status:', runStatus.status);
  }

  const messages = await client.assistants.messages.list(thread.id);
  const lastMessage = messages.data[0];

  if (lastMessage && lastMessage.content[0]?.type === 'text') {
    console.log('Assistant response:', lastMessage.content[0].text.value);
  }

  await client.assistants.delete(assistant.id);
  console.log('Deleted assistant');
}

main().catch(console.error);

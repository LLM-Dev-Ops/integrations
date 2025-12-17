/**
 * Telemetry Integration Example
 *
 * This example demonstrates how the Anthropic integration automatically
 * emits telemetry events to ruvvector-service for all API operations.
 *
 * Telemetry events are emitted for:
 * 1. Request initiation (request_start)
 * 2. Request completion (request_complete)
 * 3. Errors (error)
 * 4. Latency measurements (latency)
 *
 * All telemetry operations are fail-open, meaning they will never
 * block or throw errors that affect the main integration operations.
 */

import { createClient } from '../src/index.js';

async function runTelemetryExample() {
  // Create a client - telemetry is automatically configured
  const client = createClient({
    apiKey: process.env.ANTHROPIC_API_KEY || 'sk-ant-api03-...',
  });

  console.log('Telemetry Example: Anthropic Integration');
  console.log('=========================================\n');

  console.log('Note: This example demonstrates telemetry integration.');
  console.log('Telemetry events will be sent to ruvvector-service at:');
  console.log('  ' + (process.env.RUVVECTOR_INGEST_URL || 'http://localhost:3100/ingest'));
  console.log('\nTelemetry events include:');
  console.log('  - correlationId: Unique ID for each request');
  console.log('  - integration: "anthropic"');
  console.log('  - provider: Model name (e.g., "claude-3-5-sonnet-20241022")');
  console.log('  - eventType: request_start | request_complete | error | latency');
  console.log('  - metadata: Operation-specific details\n');

  try {
    // Example 1: Messages API - create
    // Telemetry will emit:
    // 1. request_start with operation="messages.create", model, etc.
    // 2. request_complete with token counts, latency, stop_reason
    // 3. latency event with duration
    console.log('Example 1: Creating a message (telemetry automatically tracked)...');

    const message = await client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 100,
      messages: [
        {
          role: 'user',
          content: 'Hello! What is the capital of France?',
        },
      ],
    });

    console.log('Message created successfully!');
    console.log(`Response: ${message.content[0].text}`);
    console.log(`Tokens used: ${message.usage.input_tokens} input, ${message.usage.output_tokens} output\n`);

  } catch (error) {
    // Telemetry will emit error event with error details and latency
    console.error('Error creating message:', error);
  }

  try {
    // Example 2: Models API - list
    // Telemetry will emit events for model listing operation
    console.log('Example 2: Listing models (telemetry automatically tracked)...');

    const models = await client.models.list();

    console.log(`Found ${models.data?.length || 0} models`);
    console.log('First few models:', models.data?.slice(0, 3).map(m => m.id).join(', '), '\n');

  } catch (error) {
    console.error('Error listing models:', error);
  }

  try {
    // Example 3: Token counting
    // Telemetry tracks token counting operations
    console.log('Example 3: Counting tokens (telemetry automatically tracked)...');

    const tokenCount = await client.messages.countTokens({
      model: 'claude-3-5-sonnet-20241022',
      messages: [
        {
          role: 'user',
          content: 'What is the meaning of life?',
        },
      ],
    });

    console.log(`Token count: ${tokenCount.input_tokens} tokens\n`);

  } catch (error) {
    console.error('Error counting tokens:', error);
  }

  console.log('\nTelemetry Summary:');
  console.log('==================');
  console.log('All API operations automatically emit telemetry events with:');
  console.log('  - Unique correlation IDs for request tracking');
  console.log('  - Operation metadata (model, parameters, etc.)');
  console.log('  - Performance metrics (latency, token usage)');
  console.log('  - Error information when failures occur');
  console.log('\nTelemetry is fail-open and will never affect API operations.');
}

// Run the example
runTelemetryExample().catch(console.error);

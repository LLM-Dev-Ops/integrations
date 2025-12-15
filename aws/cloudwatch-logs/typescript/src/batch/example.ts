/**
 * Example usage of BatchBuffer
 *
 * This file demonstrates how to use the BatchBuffer for efficient log batching.
 */

import { BatchBufferImpl, BatchConfig } from './index';
import type { FlushFunction } from './buffer';
import type { InputLogEvent } from '../types/logEvent';

/**
 * Example flush function that simulates sending events to CloudWatch Logs.
 */
const exampleFlushFunction: FlushFunction = async (
  logGroup: string,
  logStream: string,
  events: InputLogEvent[],
  sequenceToken?: string
) => {
  console.log(`Flushing ${events.length} events to ${logGroup}/${logStream}`);
  console.log(`  Sequence token: ${sequenceToken || 'none'}`);
  console.log(`  First event: ${events[0]?.message.substring(0, 50)}...`);
  console.log(`  Last event: ${events[events.length - 1]?.message.substring(0, 50)}...`);

  // Simulate API call delay
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Return mock sequence token
  return {
    nextSequenceToken: `mock-token-${Date.now()}`,
  };
};

/**
 * Example 1: Basic usage with default configuration
 */
async function example1Basic() {
  console.log('\n=== Example 1: Basic Usage ===\n');

  const buffer = new BatchBufferImpl(exampleFlushFunction);
  buffer.start();

  // Add some events
  for (let i = 0; i < 5; i++) {
    await buffer.add('/app/logs', 'stream-1', {
      timestamp: Date.now(),
      message: `Event ${i + 1}: User action`,
    });
  }

  // Check metrics
  let metrics = buffer.getMetrics();
  console.log(`Buffered: ${metrics.eventsBuffered} events`);

  // Manual flush
  await buffer.flush('/app/logs', 'stream-1');

  // Check metrics after flush
  metrics = buffer.getMetrics();
  console.log(`After flush: ${metrics.eventsBuffered} events`);
  console.log(`Completed flushes: ${metrics.flushesCompleted}`);

  await buffer.stop();
}

/**
 * Example 2: Custom configuration with smaller limits
 */
async function example2CustomConfig() {
  console.log('\n=== Example 2: Custom Configuration ===\n');

  const config: BatchConfig = {
    maxEvents: 3, // Flush after 3 events (normally 10000)
    maxBytes: 1024, // Flush after 1KB (normally 1MB)
    flushIntervalMs: 1000, // Flush every 1s (normally 5s)
    maxRetries: 2,
  };

  const buffer = new BatchBufferImpl(exampleFlushFunction, config);
  buffer.start();

  // Add 5 events - should trigger auto-flush after 3
  console.log('Adding 5 events (auto-flush at 3)...');
  for (let i = 0; i < 5; i++) {
    await buffer.add('/app/logs', 'stream-2', {
      timestamp: Date.now() + i,
      message: `Event ${i + 1}: Auto-flush demo`,
    });

    const metrics = buffer.getMetrics();
    console.log(`  After event ${i + 1}: ${metrics.eventsBuffered} buffered, ${metrics.flushesCompleted} completed`);
  }

  await buffer.stop();
}

/**
 * Example 3: Structured logging
 */
async function example3Structured() {
  console.log('\n=== Example 3: Structured Logging ===\n');

  const buffer = new BatchBufferImpl(exampleFlushFunction);
  buffer.start();

  // Add structured events
  await buffer.addStructured('/app/logs', 'stream-3', {
    level: 'info',
    message: 'User logged in',
    traceId: 'trace-abc-123',
    requestId: 'req-456',
    service: 'auth-service',
    fields: {
      userId: 'user-789',
      ipAddress: '192.168.1.1',
    },
  });

  await buffer.addStructured('/app/logs', 'stream-3', {
    level: 'error',
    message: 'Database connection failed',
    traceId: 'trace-abc-123',
    requestId: 'req-456',
    service: 'user-service',
    fields: {
      error: 'Connection timeout',
      retryCount: 3,
    },
  });

  const metrics = buffer.getMetrics();
  console.log(`Buffered: ${metrics.eventsBuffered} structured events`);

  await buffer.stop();
}

/**
 * Example 4: Multiple streams
 */
async function example4MultipleStreams() {
  console.log('\n=== Example 4: Multiple Streams ===\n');

  const buffer = new BatchBufferImpl(exampleFlushFunction);
  buffer.start();

  // Add events to different streams
  await buffer.add('/app/logs', 'stream-1', {
    timestamp: Date.now(),
    message: 'Stream 1 event',
  });

  await buffer.add('/app/logs', 'stream-2', {
    timestamp: Date.now(),
    message: 'Stream 2 event',
  });

  await buffer.add('/app/logs', 'stream-3', {
    timestamp: Date.now(),
    message: 'Stream 3 event',
  });

  // Flush all streams
  console.log('Flushing all streams...');
  await buffer.flushAll();

  const metrics = buffer.getMetrics();
  console.log(`Completed flushes: ${metrics.flushesCompleted}`);

  await buffer.stop();
}

/**
 * Run all examples
 */
async function runExamples() {
  try {
    await example1Basic();
    await example2CustomConfig();
    await example3Structured();
    await example4MultipleStreams();

    console.log('\n=== All examples completed successfully ===\n');
  } catch (error) {
    console.error('Example failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  runExamples();
}

export { runExamples };

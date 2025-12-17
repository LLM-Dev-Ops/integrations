/**
 * Salesforce Events Service Usage Examples
 *
 * This file demonstrates how to use the Events service for:
 * 1. Publishing platform events
 * 2. Subscribing to events via Streaming API
 * 3. Working with the Pub/Sub API (gRPC)
 */

import {
  createSalesforceClient,
  SalesforceConfigBuilder,
} from '../src/client/index.js';
import {
  createEventService,
  createSimplePubSubClient,
  createPubSubClient,
} from '../src/services/events.js';
import { ConsoleLogger, LogLevel } from '../src/observability/index.js';

// ============================================================================
// Example 1: Publishing a Single Platform Event
// ============================================================================

async function publishSingleEvent() {
  console.log('\n=== Example 1: Publishing a Single Platform Event ===\n');

  // Create Salesforce client
  const config = new SalesforceConfigBuilder()
    .withJwtBearer({
      clientId: process.env.SF_CLIENT_ID!,
      privateKey: process.env.SF_PRIVATE_KEY!,
      username: process.env.SF_USERNAME!,
      instanceUrl: process.env.SF_INSTANCE_URL!,
    })
    .withApiVersion('v59.0')
    .build();

  const client = createSalesforceClient(config, {
    logger: new ConsoleLogger({ level: LogLevel.INFO }),
    metrics: { recordMetric: () => {}, getMetrics: () => ({}) },
    tracer: {
      withSpan: async (name, fn) => fn({ setAttribute: () => {}, setStatus: () => {}, recordException: () => {} }),
    },
  });

  // Create event service
  const eventService = createEventService(client);

  // Publish a platform event
  const result = await eventService.publish('Order_Event__e', {
    Order_Number__c: 'ORD-12345',
    Amount__c: 1500.0,
    Status__c: 'Shipped',
    Customer_Email__c: 'customer@example.com',
  });

  console.log('Event published successfully:', {
    id: result.id,
    success: result.success,
  });

  if (!result.success) {
    console.error('Errors:', result.errors);
  }
}

// ============================================================================
// Example 2: Publishing Multiple Events in a Batch
// ============================================================================

async function publishBatchEvents() {
  console.log('\n=== Example 2: Publishing Multiple Events in a Batch ===\n');

  const config = SalesforceConfigBuilder.fromEnv().build();
  const client = createSalesforceClient(config);
  const eventService = createEventService(client);

  // Prepare multiple events
  const events = [
    {
      Order_Number__c: 'ORD-12345',
      Amount__c: 1500.0,
      Status__c: 'Shipped',
    },
    {
      Order_Number__c: 'ORD-12346',
      Amount__c: 2500.0,
      Status__c: 'Pending',
    },
    {
      Order_Number__c: 'ORD-12347',
      Amount__c: 3500.0,
      Status__c: 'Delivered',
    },
  ];

  // Publish batch
  const results = await eventService.publishBatch('Order_Event__e', events);

  console.log(`Published ${results.length} events:`);
  results.forEach((result, index) => {
    console.log(`  Event ${index + 1}:`, {
      id: result.id,
      success: result.success,
      errors: result.errors.length > 0 ? result.errors : undefined,
    });
  });

  const successCount = results.filter((r) => r.success).length;
  const failureCount = results.length - successCount;
  console.log(`\nSummary: ${successCount} successful, ${failureCount} failed`);
}

// ============================================================================
// Example 3: Subscribing to Events via Streaming API (HTTP)
// ============================================================================

async function subscribeToEventsHttp() {
  console.log('\n=== Example 3: Subscribing to Events via Streaming API ===\n');

  const config = SalesforceConfigBuilder.fromEnv().build();
  const client = createSalesforceClient(config);
  const streamingClient = createSimplePubSubClient(client);

  // Subscribe to platform events
  // Replay ID: -1 (latest), -2 (earliest), or specific ID
  console.log('Starting subscription to /event/Order_Event__e...');

  try {
    let eventCount = 0;
    const maxEvents = 10; // Stop after 10 events for demo

    for await (const event of streamingClient.subscribe('/event/Order_Event__e', -1)) {
      console.log('\nReceived event:', {
        channel: event.channel,
        replayId: event.replayId,
        payload: event.data.payload,
        createdDate: event.data.event.createdDate,
      });

      // Process the event
      const orderNumber = event.data.payload.Order_Number__c;
      const status = event.data.payload.Status__c;
      console.log(`Processing order ${orderNumber} with status ${status}`);

      // Store replay ID for resuming later
      await storeReplayId(event.replayId);

      eventCount++;
      if (eventCount >= maxEvents) {
        console.log(`\nReceived ${maxEvents} events, stopping subscription...`);
        break;
      }
    }
  } catch (error) {
    console.error('Subscription error:', error);
  }
}

// ============================================================================
// Example 4: Subscribing to Change Data Capture
// ============================================================================

async function subscribeToChangeDataCapture() {
  console.log('\n=== Example 4: Subscribing to Change Data Capture ===\n');

  const config = SalesforceConfigBuilder.fromEnv().build();
  const client = createSalesforceClient(config);
  const streamingClient = createSimplePubSubClient(client);

  // Subscribe to Account changes
  console.log('Starting subscription to /data/AccountChangeEvent...');

  try {
    for await (const event of streamingClient.subscribe('/data/AccountChangeEvent', -1)) {
      const changeType = event.data.payload.changeType;
      const recordIds = event.data.payload.recordIds || [];

      console.log('\nAccount change detected:', {
        changeType, // CREATE, UPDATE, DELETE, UNDELETE
        recordIds,
        replayId: event.replayId,
      });

      // Access changed fields
      const changedFields = event.data.payload.changedFields || [];
      if (changedFields.length > 0) {
        console.log('Changed fields:', changedFields);
      }

      // Process the change
      if (changeType === 'UPDATE') {
        console.log('Account updated:', {
          Name: event.data.payload.Name,
          Industry: event.data.payload.Industry,
        });
      }
    }
  } catch (error) {
    console.error('Subscription error:', error);
  }
}

// ============================================================================
// Example 5: Resuming from a Specific Replay ID
// ============================================================================

async function resumeFromReplayId() {
  console.log('\n=== Example 5: Resuming from a Specific Replay ID ===\n');

  const config = SalesforceConfigBuilder.fromEnv().build();
  const client = createSalesforceClient(config);
  const streamingClient = createSimplePubSubClient(client);

  // Load the last stored replay ID
  const lastReplayId = await loadReplayId();
  console.log(`Resuming from replay ID: ${lastReplayId}`);

  try {
    for await (const event of streamingClient.subscribe('/event/Order_Event__e', lastReplayId)) {
      console.log('Received event:', event.data.payload);

      // Update stored replay ID
      await storeReplayId(event.replayId);
    }
  } catch (error) {
    console.error('Subscription error:', error);
  }
}

// ============================================================================
// Example 6: Using Pub/Sub API (gRPC) - Production Implementation
// ============================================================================

async function subscribeViaPubSubApi() {
  console.log('\n=== Example 6: Using Pub/Sub API (gRPC) ===\n');
  console.log('Note: This requires gRPC implementation and dependencies.\n');

  const config = SalesforceConfigBuilder.fromEnv().build();
  const client = createSalesforceClient(config);

  // This will throw an error with setup instructions
  try {
    const pubSubClient = createPubSubClient(client);

    // Subscribe to events
    for await (const message of pubSubClient.subscribe({
      topicName: '/event/Order_Event__e',
      replayPreset: 'LATEST',
      numRequested: 100,
    })) {
      // Get schema for deserialization
      const schema = await pubSubClient.getSchema(message.event.schemaId);

      // In production, use Apache Avro to deserialize:
      // import avro from 'avro-js';
      // const avroType = avro.parse(schema.schema);
      // const event = avroType.fromBuffer(message.event.payload);

      console.log('Received event:', {
        id: message.event.id,
        createdDate: message.event.createdDate,
        // event: event, // Deserialized event data
      });

      // Store replay ID for resuming
      await storeReplayIdBytes(message.replayId);
    }
  } catch (error) {
    console.error('Error:', (error as Error).message);
    console.log('\nFor production use, implement PubSubClient with:');
    console.log('1. npm install @grpc/grpc-js @grpc/proto-loader avro-js');
    console.log('2. Download pubsub_api.proto from Salesforce');
    console.log('3. Implement gRPC client with authentication');
  }
}

// ============================================================================
// Example 7: Error Handling and Retry Logic
// ============================================================================

async function publishWithErrorHandling() {
  console.log('\n=== Example 7: Error Handling and Retry Logic ===\n');

  const config = SalesforceConfigBuilder.fromEnv().build();
  const client = createSalesforceClient(config);
  const eventService = createEventService(client);

  try {
    const result = await eventService.publish('Order_Event__e', {
      Order_Number__c: 'ORD-12345',
      Amount__c: 1500.0,
      Status__c: 'Shipped',
    });

    if (!result.success) {
      console.error('Event publication failed:');
      result.errors.forEach((error) => {
        console.error(`  ${error.statusCode}: ${error.message}`);
        if (error.fields) {
          console.error(`  Fields: ${error.fields.join(', ')}`);
        }
      });
    } else {
      console.log('Event published successfully:', result.id);
    }
  } catch (error) {
    console.error('Unexpected error:', error);

    // The SalesforceClient includes automatic retry logic for retryable errors
    // Check if the error is retryable
    if ((error as any).retryable) {
      console.log('This error is retryable. The client will handle retries automatically.');
    }
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Stores the replay ID for resuming subscriptions.
 * In production, store this in a database or persistent storage.
 */
async function storeReplayId(replayId: number): Promise<void> {
  // Example: Store in Redis, database, or file system
  // await redis.set('salesforce:replay:order_events', replayId);
  console.log(`[Storage] Stored replay ID: ${replayId}`);
}

/**
 * Loads the last stored replay ID.
 */
async function loadReplayId(): Promise<number> {
  // Example: Load from Redis, database, or file system
  // return parseInt(await redis.get('salesforce:replay:order_events') || '-1');
  return -1; // Default to latest
}

/**
 * Stores binary replay ID for Pub/Sub API.
 */
async function storeReplayIdBytes(replayId: Uint8Array): Promise<void> {
  // Example: Store in database as binary blob
  console.log(`[Storage] Stored binary replay ID (${replayId.length} bytes)`);
}

// ============================================================================
// Run Examples
// ============================================================================

async function main() {
  console.log('Salesforce Events Service Examples');
  console.log('===================================');

  // Uncomment the examples you want to run:

  // await publishSingleEvent();
  // await publishBatchEvents();
  // await subscribeToEventsHttp();
  // await subscribeToChangeDataCapture();
  // await resumeFromReplayId();
  // await subscribeViaPubSubApi();
  // await publishWithErrorHandling();

  console.log('\nExamples completed!');
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

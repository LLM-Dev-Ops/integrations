/**
 * Example usage of the Airtable simulation layer.
 *
 * This file demonstrates how to use the record/replay testing functionality
 * for the Airtable API integration.
 */

import { SimulationMode } from '../config/index.js';
import {
  InteractionRecorder,
  InteractionReplayer,
  SimulationClient,
  WebhookSimulator,
  createRecorder,
  createReplayer,
  loadReplayer,
  createSimulationClient,
  type RecordedRequest,
  type RecordedResponse,
  type SimulationSession,
  type WebhookPayload,
} from './index.js';

// ============================================================================
// Example 1: Recording Interactions
// ============================================================================

async function exampleRecording() {
  console.log('=== Example 1: Recording Interactions ===\n');

  // Create a recorder with a session ID
  const recorder = createRecorder('list-records-test');

  // Record a GET request
  const request: RecordedRequest = {
    method: 'GET',
    path: '/appXXXXXXXXXXXXXX/tblYYYYYYYYYYYYYY',
    query: {
      pageSize: '10',
      view: 'Grid view',
    },
  };

  const response: RecordedResponse = {
    status: 200,
    body: {
      records: [
        {
          id: 'recZZZZZZZZZZZZZZ',
          createdTime: '2025-01-01T00:00:00.000Z',
          fields: {
            Name: 'Example Record',
            Status: 'Active',
          },
        },
      ],
    },
    headers: {
      'content-type': 'application/json',
    },
  };

  recorder.record(request, response);

  // Get the session
  const session = recorder.getSession();
  console.log('Session ID:', session.id);
  console.log('Interactions recorded:', session.interactions.length);

  // Save to file
  await recorder.save('./fixtures/list-records-test.json');
  console.log('Session saved to ./fixtures/list-records-test.json\n');
}

// ============================================================================
// Example 2: Replaying Interactions
// ============================================================================

async function exampleReplaying() {
  console.log('=== Example 2: Replaying Interactions ===\n');

  // Create a session manually (normally you'd load from a file)
  const session: SimulationSession = {
    id: 'test-session',
    interactions: [
      {
        request: {
          method: 'GET',
          path: '/appXXXXXXXXXXXXXX/tblYYYYYYYYYYYYYY',
          query: { pageSize: '10' },
        },
        response: {
          status: 200,
          body: { records: [] },
        },
        timestamp: new Date().toISOString(),
      },
    ],
  };

  const replayer = createReplayer(session);

  // Match a request
  const matchedResponse = replayer.match({
    method: 'GET',
    path: '/appXXXXXXXXXXXXXX/tblYYYYYYYYYYYYYY',
    query: { pageSize: '10' },
  });

  console.log('Matched response:', matchedResponse);
  console.log('Matched count:', replayer.getMatchedCount());
  console.log('Remaining interactions:', replayer.getRemainingCount());
  console.log('Has more interactions:', replayer.hasMoreInteractions());
  console.log();
}

// ============================================================================
// Example 3: Fuzzy Matching for Dynamic IDs
// ============================================================================

async function exampleFuzzyMatching() {
  console.log('=== Example 3: Fuzzy Matching for Dynamic IDs ===\n');

  const session: SimulationSession = {
    id: 'fuzzy-match-test',
    interactions: [
      {
        request: {
          method: 'GET',
          path: '/appAAAAAAAAAAAAAA/tblBBBBBBBBBBBBBB/recCCCCCCCCCCCCCC',
        },
        response: {
          status: 200,
          body: {
            id: 'recCCCCCCCCCCCCCC',
            fields: { Name: 'Test' },
          },
        },
        timestamp: new Date().toISOString(),
      },
    ],
  };

  const replayer = createReplayer(session);

  // This request has different IDs but same prefixes - should still match!
  const matchedResponse = replayer.match({
    method: 'GET',
    path: '/appDDDDDDDDDDDDDDD/tblEEEEEEEEEEEEEE/recFFFFFFFFFFFFFF',
  });

  console.log('Fuzzy match successful:', matchedResponse !== null);
  console.log('Response:', matchedResponse);
  console.log();
}

// ============================================================================
// Example 4: Using SimulationClient
// ============================================================================

async function exampleSimulationClient() {
  console.log('=== Example 4: Using SimulationClient ===\n');

  // Example in Replay mode
  const session: SimulationSession = {
    id: 'client-test',
    interactions: [
      {
        request: {
          method: 'POST',
          path: '/appXXXXXXXXXXXXXX/tblYYYYYYYYYYYYYY',
          body: { fields: { Name: 'New Record' } },
        },
        response: {
          status: 201,
          body: {
            id: 'recNEWNEWNEWNEWNE',
            createdTime: '2025-01-01T00:00:00.000Z',
            fields: { Name: 'New Record' },
          },
        },
        timestamp: new Date().toISOString(),
      },
    ],
  };

  const replayer = createReplayer(session);
  const client = createSimulationClient(SimulationMode.Replay, undefined, replayer);

  // Execute a request - will be matched against recorded interactions
  const response = await client.executeRequest({
    method: 'POST',
    path: '/appXXXXXXXXXXXXXX/tblYYYYYYYYYYYYYY',
    body: { fields: { Name: 'New Record' } },
  });

  console.log('Response status:', response.status);
  console.log('Response body:', response.body);
  console.log();
}

// ============================================================================
// Example 5: Webhook Simulation
// ============================================================================

async function exampleWebhookSimulation() {
  console.log('=== Example 5: Webhook Simulation ===\n');

  const simulator = new WebhookSimulator();

  // Register a webhook secret
  simulator.registerSecret('webhook-123', 'my-secret-key');

  // Create a webhook payload
  const payload: WebhookPayload = {
    base: { id: 'appXXXXXXXXXXXXXX' },
    webhook: { id: 'webhook-123' },
    timestamp: new Date().toISOString(),
    changeType: 'recordCreated',
    table: {
      id: 'tblYYYYYYYYYYYYYY',
      name: 'My Table',
    },
    record: {
      id: 'recZZZZZZZZZZZZZZ',
      cellValuesByFieldId: {
        fldAAAAAAAAAAAAAA: 'Test Value',
      },
    },
  };

  // Simulate the webhook payload
  const { headers, body } = simulator.simulatePayload('webhook-123', payload);

  console.log('Webhook headers:', headers);
  console.log('Webhook body (first 100 chars):', body.substring(0, 100) + '...');

  // Validate the signature
  const signature = headers['x-airtable-content-mac'];
  const isValid = simulator.validateSignature('webhook-123', body, signature);
  console.log('Signature valid:', isValid);
  console.log();
}

// ============================================================================
// Example 6: Complete Record/Replay Workflow
// ============================================================================

async function exampleCompleteWorkflow() {
  console.log('=== Example 6: Complete Record/Replay Workflow ===\n');

  // Step 1: Record mode - record real API interactions
  console.log('Step 1: Recording...');
  const recorder = createRecorder('complete-workflow-test');

  // Simulate recording multiple interactions
  recorder.record(
    { method: 'GET', path: '/appXXX/tblYYY' },
    { status: 200, body: { records: [] } }
  );

  recorder.record(
    { method: 'POST', path: '/appXXX/tblYYY', body: { fields: { Name: 'Test' } } },
    { status: 201, body: { id: 'recZZZ', fields: { Name: 'Test' } } }
  );

  recorder.record(
    { method: 'PATCH', path: '/appXXX/tblYYY/recZZZ', body: { fields: { Status: 'Done' } } },
    { status: 200, body: { id: 'recZZZ', fields: { Name: 'Test', Status: 'Done' } } }
  );

  const session = recorder.getSession();
  console.log('Recorded', session.interactions.length, 'interactions');

  // Step 2: Save the session
  console.log('Step 2: Saving session...');
  // await recorder.save('./fixtures/complete-workflow-test.json');

  // Step 3: Load and replay
  console.log('Step 3: Replaying...');
  const replayer = createReplayer(session);

  // Replay the interactions in order
  const response1 = replayer.match({ method: 'GET', path: '/appXXX/tblYYY' });
  console.log('Replayed GET:', response1?.status);

  const response2 = replayer.match({
    method: 'POST',
    path: '/appXXX/tblYYY',
    body: { fields: { Name: 'Test' } },
  });
  console.log('Replayed POST:', response2?.status);

  const response3 = replayer.match({
    method: 'PATCH',
    path: '/appXXX/tblYYY/recZZZ',
    body: { fields: { Status: 'Done' } },
  });
  console.log('Replayed PATCH:', response3?.status);

  console.log('Final stats - Matched:', replayer.getMatchedCount(), 'Remaining:', replayer.getRemainingCount());
  console.log();
}

// ============================================================================
// Run All Examples
// ============================================================================

async function runAllExamples() {
  try {
    await exampleRecording();
    await exampleReplaying();
    await exampleFuzzyMatching();
    await exampleSimulationClient();
    await exampleWebhookSimulation();
    await exampleCompleteWorkflow();

    console.log('All examples completed successfully!');
  } catch (error) {
    console.error('Error running examples:', error);
  }
}

// Uncomment to run examples
// runAllExamples();

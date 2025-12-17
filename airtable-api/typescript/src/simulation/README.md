# Airtable API Simulation Layer

The simulation layer provides record/replay testing capabilities for the Airtable API integration. It enables deterministic testing without making actual API calls by recording HTTP interactions and replaying them later.

## Features

- **Record Mode**: Capture real API interactions for later replay
- **Replay Mode**: Replay recorded interactions without making real API calls
- **Fuzzy Matching**: Automatically match requests with dynamic IDs (e.g., `appXXX`, `recYYY`)
- **Sequential Matching**: Match and consume interactions in order
- **Webhook Simulation**: Generate webhook payloads with HMAC signatures for testing
- **File Persistence**: Save and load sessions from JSON files

## Core Components

### 1. InteractionRecorder

Records HTTP request/response pairs during normal operation.

```typescript
import { createRecorder } from './simulation/index.js';

// Create a recorder
const recorder = createRecorder('my-test-session');

// Record an interaction
recorder.record(
  {
    method: 'GET',
    path: '/appXXX/tblYYY',
    query: { pageSize: '10' },
  },
  {
    status: 200,
    body: { records: [] },
    headers: { 'content-type': 'application/json' },
  }
);

// Save to file
await recorder.save('./fixtures/my-test-session.json');

// Get the session
const session = recorder.getSession();

// Clear recordings
recorder.clear();
```

### 2. InteractionReplayer

Replays recorded interactions for testing.

```typescript
import { loadReplayer, createReplayer } from './simulation/index.js';

// Load from file
const replayer = await loadReplayer('./fixtures/my-test-session.json');

// Or create from session object
const session = {
  id: 'test',
  interactions: [/* ... */],
};
const replayer = createReplayer(session);

// Match a request
const response = replayer.match({
  method: 'GET',
  path: '/appXXX/tblYYY',
  query: { pageSize: '10' },
});

// Check status
console.log(replayer.getMatchedCount());    // Number of matched interactions
console.log(replayer.getRemainingCount());  // Number of remaining interactions
console.log(replayer.hasMoreInteractions()); // True if more interactions available
```

### 3. SimulationClient

HTTP client wrapper that supports record/replay modes.

```typescript
import { SimulationMode } from '../config/index.js';
import { createSimulationClient, createRecorder, loadReplayer } from './simulation/index.js';

// Record mode
const recorder = createRecorder();
const recordClient = createSimulationClient(
  SimulationMode.Record,
  recorder
);

// Set the real client executor for pass-through
recordClient.setRealClientExecutor(async (options) => {
  // Your real HTTP client logic
  return { status: 200, body: {} };
});

// Execute requests (will record)
const response = await recordClient.executeRequest({
  method: 'GET',
  path: '/appXXX/tblYYY',
});

// Replay mode
const replayer = await loadReplayer('./fixtures/test.json');
const replayClient = createSimulationClient(
  SimulationMode.Replay,
  undefined,
  replayer
);

// Execute requests (will replay)
const replayedResponse = await replayClient.executeRequest({
  method: 'GET',
  path: '/appXXX/tblYYY',
});
```

### 4. WebhookSimulator

Simulates Airtable webhook payloads with HMAC signatures.

```typescript
import { WebhookSimulator } from './simulation/index.js';
import type { WebhookPayload } from '../types/index.js';

const simulator = new WebhookSimulator();

// Register webhook secrets
simulator.registerSecret('webhook-123', 'my-secret-key');

// Create a webhook payload
const payload: WebhookPayload = {
  base: { id: 'appXXX' },
  webhook: { id: 'webhook-123' },
  timestamp: new Date().toISOString(),
  changeType: 'recordCreated',
  table: {
    id: 'tblYYY',
    name: 'My Table',
  },
  record: {
    id: 'recZZZ',
    cellValuesByFieldId: {
      fldAAA: 'Test Value',
    },
  },
};

// Simulate the webhook
const { headers, body } = simulator.simulatePayload('webhook-123', payload);

// headers includes:
// - 'x-airtable-content-mac': HMAC signature
// - 'x-airtable-webhook-id': webhook ID
// - 'content-type': 'application/json'

// Validate signature
const isValid = simulator.validateSignature(
  'webhook-123',
  body,
  headers['x-airtable-content-mac']
);
```

## Fuzzy ID Matching

The replayer automatically performs fuzzy matching for Airtable IDs, allowing tests to work with different ID values as long as they have the same prefix:

```typescript
// Recorded interaction
{
  request: {
    method: 'GET',
    path: '/appAAAAAAAAAAAAAA/tblBBBBBBBBBBBBBB/recCCCCCCCCCCCCCC'
  },
  response: { status: 200, body: { id: 'recCCCCCCCCCCCCCC' } }
}

// This will match even with different IDs!
const response = replayer.match({
  method: 'GET',
  path: '/appDDDDDDDDDDDDDDD/tblEEEEEEEEEEEEEE/recFFFFFFFFFFFFFF'
});
```

Supported ID prefixes:
- `app` - Base IDs
- `tbl` - Table IDs
- `rec` - Record IDs
- `fld` - Field IDs
- `viw` - View IDs

## Session File Format

Sessions are saved as JSON files:

```json
{
  "id": "my-test-session",
  "interactions": [
    {
      "request": {
        "method": "GET",
        "path": "/appXXX/tblYYY",
        "query": { "pageSize": "10" },
        "headers": { "authorization": "Bearer [REDACTED]" }
      },
      "response": {
        "status": 200,
        "body": { "records": [] },
        "headers": { "content-type": "application/json" }
      },
      "timestamp": "2025-01-01T00:00:00.000Z"
    }
  ],
  "metadata": {
    "description": "Test session for listing records",
    "created": "2025-01-01T00:00:00.000Z"
  }
}
```

## Testing Workflow

### 1. Record Real Interactions

```typescript
import { SimulationMode } from '../config/index.js';
import { createRecorder } from './simulation/index.js';

// Set up recording
process.env.AIRTABLE_SIMULATION_MODE = 'record';
const recorder = createRecorder('integration-test');

// Run your tests against the real API
// The recorder captures all interactions

// Save the session
await recorder.save('./fixtures/integration-test.json');
```

### 2. Replay in Tests

```typescript
import { SimulationMode } from '../config/index.js';
import { loadReplayer, createSimulationClient } from './simulation/index.js';

// Set up replay
process.env.AIRTABLE_SIMULATION_MODE = 'replay';
const replayer = await loadReplayer('./fixtures/integration-test.json');
const client = createSimulationClient(SimulationMode.Replay, undefined, replayer);

// Run your tests - no real API calls will be made
// All responses come from recorded interactions
```

## Error Handling

The simulation layer throws specific errors:

- **SimulationNotInReplayError**: Thrown when trying to use simulation features outside replay mode
- **SimulationExhaustedError**: Thrown when no matching interaction is found in replay mode
- **SimulationMismatchError**: Thrown when request doesn't match expected pattern

```typescript
import {
  SimulationNotInReplayError,
  SimulationExhaustedError,
  SimulationMismatchError,
} from '../errors/index.js';

try {
  const response = await client.executeRequest(options);
} catch (error) {
  if (error instanceof SimulationExhaustedError) {
    console.error('No matching interaction found');
  }
}
```

## Best Practices

1. **Use Descriptive Session IDs**: Make it easy to identify what each session tests
   ```typescript
   const recorder = createRecorder('test-list-records-with-filtering');
   ```

2. **Record Minimal Sessions**: Only record what you need for each test
   ```typescript
   // Good - focused test
   recorder.record(request, response);

   // Bad - recording everything
   recorder.record(everySingleRequest, everySingleResponse);
   ```

3. **Add Metadata**: Document your sessions
   ```typescript
   recorder.setMetadata('description', 'Tests record listing with view filter');
   recorder.setMetadata('created', new Date().toISOString());
   ```

4. **Verify Remaining Interactions**: Ensure all recorded interactions were used
   ```typescript
   test('should use all recorded interactions', () => {
     expect(replayer.getRemainingCount()).toBe(0);
   });
   ```

5. **Organize Session Files**: Keep fixtures organized
   ```
   fixtures/
     auth/
       login-success.json
       login-failure.json
     records/
       list-records.json
       create-record.json
       update-record.json
     webhooks/
       record-created.json
       record-updated.json
   ```

## Integration with AirtableClient

The simulation layer integrates seamlessly with the main AirtableClient:

```typescript
import { AirtableConfigBuilder } from '../config/index.js';
import { SimulationMode } from '../config/index.js';

// Configure with simulation mode
const config = new AirtableConfigBuilder()
  .withToken('your-token')
  .withSimulationMode(SimulationMode.Replay)
  .build();

// The client will automatically use simulation mode
const client = new AirtableClient(config);
```

## Examples

See `example.ts` for complete working examples of all features.

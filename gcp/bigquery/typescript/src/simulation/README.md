# BigQuery Simulation Module

This module provides comprehensive testing utilities for BigQuery operations, including mock clients, query replay, and test data generation.

## Components

### 1. Types (`types.ts`)

Core types for simulation:

- `MockQueryResult`: Mock query result with schema, rows, bytes processed, and cache hit status
- `ReplayScenario`: Container for recorded queries and jobs
- `MockConfig`: Configuration for mock client behavior
- `CallHistoryEntry`: Tracks method calls for test assertions

### 2. Mock Client (`mockClient.ts`)

`MockBigQueryClient` provides a drop-in replacement for the real BigQuery client:

```typescript
import { MockBigQueryClient } from './simulation';

// Create a mock client
const client = new MockBigQueryClient({
  defaultLatencyMs: 100,  // Simulate 100ms latency
  failureRate: 0.1,       // 10% failure rate
});

// Register mock query results
client.registerQueryResult(
  'SELECT * FROM users',
  {
    schema: { fields: [{ name: 'id', type: FieldType.INTEGER }] },
    rows: [{ f: [{ v: 1 }] }],
    totalBytesProcessed: BigInt(1024),
    cacheHit: false,
  }
);

// Use like a real client
const response = await client.query({ query: 'SELECT * FROM users' });

// Assert on call history
const calls = client.getCallsTo('query');
expect(calls).toHaveLength(1);
```

**Features:**
- String and regex pattern matching for queries
- Configurable latency simulation
- Failure mode for testing error handling
- Call history tracking for assertions
- Support for datasets, tables, and jobs

### 3. Replay Client (`replay.ts`)

Record and replay queries for deterministic testing:

```typescript
import { RecordingClient, ReplayClient, saveScenario, loadScenario } from './simulation';

// Record queries from a real client
const recorder = new RecordingClient();

// After executing queries, get the scenario
const scenario = recorder.getScenario();

// Save to file for later use
await saveScenario(scenario, './test-scenarios/user-queries.json');

// Load and replay
const loadedScenario = await loadScenario('./test-scenarios/user-queries.json');
const replayClient = new ReplayClient(loadedScenario);

// Replays return the exact recorded results
const response = await replayClient.query({ query: 'SELECT * FROM users' });
```

**Features:**
- Record real query executions
- Save/load scenarios to/from JSON files
- Deterministic replay for consistent tests
- Query normalization for flexible matching

### 4. Test Data Generator (`generator.ts`)

Generate schemas and test data:

```typescript
import { generateSchema, generateRows, generateJob, randomValue } from './simulation';

// Generate a random schema with 5 fields
const schema = generateSchema(5);

// Generate 100 rows matching the schema
const rows = generateRows(schema, 100);

// Generate a mock job
const job = generateJob('DONE');

// Generate random values for specific types
const stringValue = randomValue(FieldType.STRING);
const intValue = randomValue(FieldType.INTEGER);
const timestamp = randomValue(FieldType.TIMESTAMP);
```

**Features:**
- Schema generation with configurable field count and nesting depth
- Row generation matching any schema
- Support for all BigQuery field types
- Random value generation
- Mock job generation with realistic statistics

## Usage Examples

### Testing Query Execution

```typescript
import { MockBigQueryClient } from './simulation';

describe('BigQuery Query Service', () => {
  let client: MockBigQueryClient;

  beforeEach(() => {
    client = new MockBigQueryClient();
  });

  it('should execute a query and return results', async () => {
    // Arrange
    client.registerQueryResult(/SELECT.*FROM users/, {
      schema: { fields: [{ name: 'id', type: FieldType.INTEGER }] },
      rows: [{ f: [{ v: 1 }] }, { f: [{ v: 2 }] }],
      totalBytesProcessed: BigInt(2048),
      cacheHit: false,
    });

    // Act
    const response = await client.query({ query: 'SELECT * FROM users' });

    // Assert
    expect(response.rows).toHaveLength(2);
    expect(response.totalBytesProcessed).toBe(BigInt(2048));
  });

  it('should handle byte limit exceeded', async () => {
    // Arrange
    client.registerQueryResult('SELECT *', {
      schema: { fields: [] },
      rows: [],
      totalBytesProcessed: BigInt(1000000),
      cacheHit: false,
    });

    // Act & Assert
    await expect(
      client.query({
        query: 'SELECT *',
        maximumBytesBilled: BigInt(1000),
      })
    ).rejects.toThrow('exceeded maximum bytes billed');
  });
});
```

### Testing with Replay Scenarios

```typescript
import { ReplayClient, loadScenario } from './simulation';

describe('Query Replay', () => {
  it('should replay recorded queries', async () => {
    // Load a pre-recorded scenario
    const scenario = await loadScenario('./fixtures/user-scenario.json');
    const client = new ReplayClient(scenario);

    // Execute queries - results come from the recording
    const response = await client.query({ query: 'SELECT * FROM users' });

    expect(response.rows).toBeDefined();
    expect(response.cacheHit).toBe(true); // Matches recorded value
  });
});
```

### Generating Test Data

```typescript
import { generateSchema, generateRows } from './simulation';

describe('Data Processing', () => {
  it('should process various data types', () => {
    // Generate a schema with nested fields
    const schema = generateSchema(10, 2); // 10 fields, nesting depth 2

    // Generate test data
    const rows = generateRows(schema, 1000);

    // Test your processing logic
    const processed = processRows(rows, schema);

    expect(processed).toHaveLength(1000);
  });
});
```

## Integration with Real Client

While not yet implemented, the mock client is designed to implement the same interface as the real `BigQueryClient`, allowing seamless substitution in tests:

```typescript
// Production code
interface BigQueryClient {
  query(request: QueryRequest): Promise<QueryResponse>;
  getJob(jobId: string): Promise<Job>;
  // ... other methods
}

// In tests, use MockBigQueryClient
// In production, use real BigQueryClient
const client: BigQueryClient = process.env.NODE_ENV === 'test'
  ? new MockBigQueryClient()
  : new BigQueryClientImpl(config);
```

## Best Practices

1. **Use regex patterns for flexible matching**: Match query patterns instead of exact strings
2. **Record real scenarios**: Use RecordingClient to capture actual query behavior
3. **Simulate realistic latency**: Set `defaultLatencyMs` to match production behavior
4. **Test error cases**: Use `setFailureMode()` to test error handling
5. **Assert on call history**: Verify the correct methods were called with expected parameters

## File Structure

```
simulation/
├── index.ts           # Re-exports all public APIs
├── types.ts           # Core simulation types
├── mockClient.ts      # Mock BigQuery client implementation
├── replay.ts          # Query recording and replay
├── generator.ts       # Test data generation utilities
└── README.md          # This file
```

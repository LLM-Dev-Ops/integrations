# ECR Simulation Module

The simulation module provides comprehensive testing capabilities for the Amazon ECR integration without requiring AWS credentials or making actual API calls.

## Features

- **Mock Registry**: In-memory repository and image storage
- **Mock Client**: Full ECR API simulation with configurable behavior
- **Error Injection**: Simulate various error conditions
- **Latency Injection**: Simulate network delays and timeouts
- **Operation Recording**: Capture real API interactions
- **Replay Engine**: Deterministic testing from recordings

## Components

### MockRegistry

In-memory data structure that simulates ECR repository and image storage.

```typescript
import { MockRegistry, MockRepository, MockImage } from './simulation';
import { TagMutability, ScanType } from './types';

const registry = new MockRegistry();

// Add repository
const repo: MockRepository = {
  name: 'my-app',
  uri: '123456789012.dkr.ecr.us-east-1.amazonaws.com/my-app',
  arn: 'arn:aws:ecr:us-east-1:123456789012:repository/my-app',
  registryId: '123456789012',
  createdAt: new Date(),
  imageTagMutability: TagMutability.Immutable,
  imageScanningConfiguration: {
    scanOnPush: true,
    scanType: ScanType.Basic,
  },
};

registry.addRepository(repo);

// Add image
const image: MockImage = {
  digest: 'sha256:abc123...',
  tags: ['latest', 'v1.0.0'],
  manifest: '{"schemaVersion": 2, ...}',
  manifestMediaType: 'application/vnd.docker.distribution.manifest.v2+json',
  sizeBytes: 1024000,
  pushedAt: new Date(),
};

registry.addImage('my-app', image);

// Query registry
const foundImage = registry.getImage('my-app', 'latest');
const allImages = registry.listImages('my-app');
```

### MockEcrClient

Mock implementation of the ECR client interface with configurable behavior.

```typescript
import { MockEcrClient } from './simulation';
import { EcrErrorKind } from './errors';

const client = new MockEcrClient();

// Setup mock data
client
  .withRepository({
    name: 'my-app',
    uri: '123456789012.dkr.ecr.us-east-1.amazonaws.com/my-app',
    arn: 'arn:aws:ecr:us-east-1:123456789012:repository/my-app',
    registryId: '123456789012',
    createdAt: new Date(),
    imageTagMutability: TagMutability.Mutable,
  })
  .withImage('my-app', {
    digest: 'sha256:abc123...',
    tags: ['latest'],
    manifest: '{"schemaVersion": 2}',
    manifestMediaType: 'application/vnd.docker.distribution.manifest.v2+json',
    sizeBytes: 1024000,
    pushedAt: new Date(),
  });

// Use like normal client
const result = await client.send('DescribeRepositories', {
  repositoryNames: ['my-app'],
});
```

### Error Injection

Simulate error conditions for testing error handling.

```typescript
import { MockEcrClient, ErrorInjectionConfig } from './simulation';
import { EcrErrorKind } from './errors';

const client = new MockEcrClient()
  .withRepository(/* ... */)
  .withErrorInjection({
    operation: 'DescribeImages',
    errorKind: EcrErrorKind.ThrottlingException,
    probability: 0.3, // 30% chance
    count: 2, // Only inject 2 times
  })
  .withErrorInjection({
    // All operations
    errorKind: EcrErrorKind.ServiceUnavailable,
    probability: 0.1, // 10% chance
  });

// Some requests will fail with injected errors
try {
  await client.send('DescribeImages', { repositoryName: 'my-app' });
} catch (error) {
  // Handle throttling or service unavailable
}
```

### Latency Injection

Simulate network delays and timeouts.

```typescript
import { MockEcrClient, LatencyConfig } from './simulation';

const client = new MockEcrClient()
  .withRepository(/* ... */)
  .withLatencyInjection({
    operation: 'DescribeImages',
    delayMs: 1000,
    jitterMs: 500, // Random 0-500ms added
  })
  .withLatencyInjection({
    // All operations
    delayMs: 100,
  });

// Requests will be delayed
const start = Date.now();
await client.send('DescribeImages', { repositoryName: 'my-app' });
const duration = Date.now() - start;
// duration will be approximately 1100-1600ms
```

### Scan Progression

Simulate gradual scan completion for testing polling logic.

```typescript
import { MockEcrClient, ScanProgressionConfig } from './simulation';
import { ScanState, Severity } from './types';

const client = new MockEcrClient()
  .withRepository(/* ... */)
  .withImage('my-app', {
    digest: 'sha256:abc123...',
    tags: ['latest'],
    /* ... */
  })
  .configureScanProgression({
    repository: 'my-app',
    digest: 'sha256:abc123...',
    states: [
      ScanState.Pending,
      ScanState.InProgress,
      ScanState.Complete,
    ],
    delayBetweenStatesMs: 1000,
    finalFindings: {
      scanCompletedAt: new Date(),
      findingSeverityCounts: {
        [Severity.Critical]: 2,
        [Severity.High]: 5,
        [Severity.Medium]: 10,
      },
      findings: [
        {
          name: 'CVE-2024-1234',
          description: 'Critical vulnerability',
          severity: Severity.Critical,
        },
      ],
    },
  });

// Start scan
await client.send('StartImageScan', {
  repositoryName: 'my-app',
  imageId: { imageTag: 'latest' },
});

// Poll for completion
while (true) {
  const result = await client.send('DescribeImageScanFindings', {
    repositoryName: 'my-app',
    imageId: { imageTag: 'latest' },
  });

  if (result.imageScanStatus.status === ScanState.Complete) {
    console.log('Scan complete!', result.imageScanFindings);
    break;
  }

  await new Promise(resolve => setTimeout(resolve, 500));
}
```

### Operation Recording

Record real API interactions for later replay.

```typescript
import { createRecordingSession } from './simulation';
import { EcrClient } from './client';

// Create real client
const realClient = new EcrClient(config);

// Create recording session
const session = createRecordingSession(realClient, 'recording.json');
const recordingClient = session.getClient();

// Use client normally - all operations are recorded
await recordingClient.send('DescribeRepositories', {});
await recordingClient.send('DescribeImages', { repositoryName: 'my-app' });

// Save recording
await session.save();
console.log(`Recorded ${session.getOperationCount()} operations`);
```

### Replay Engine

Replay recorded operations for deterministic testing.

```typescript
import { createReplaySession } from './simulation';

// Load recording
const session = await createReplaySession('recording.json', {
  strictMode: true,
  matchBy: 'exact',
});

const client = session.getClient();

// Operations return recorded responses
const repos = await client.send('DescribeRepositories', {});
const images = await client.send('DescribeImages', { repositoryName: 'my-app' });

// Validate all recordings were used
session.validateAllUsed();

// Print summary
session.printSummary();
// Output:
// Replay Session Summary:
//   Total recordings: 2
//   Used recordings: 2
//   Request count: 2
//   Unused recordings: 0
//   Duration: 5ms
```

### Match Modes

The replay engine supports different matching strategies:

#### Exact Match (Default)

```typescript
const session = await createReplaySession('recording.json', {
  matchBy: 'exact', // Parameters must match exactly
  strictMode: true,
});
```

#### Operation Match

```typescript
const session = await createReplaySession('recording.json', {
  matchBy: 'operation', // Only operation name must match
  strictMode: false, // Return empty results if no match
});
```

#### Fuzzy Match

```typescript
const session = await createReplaySession('recording.json', {
  matchBy: 'fuzzy', // Match on operation and key parameters
  strictMode: true,
});
```

## Testing Patterns

### Unit Testing with Mock Client

```typescript
import { MockEcrClient } from './simulation';
import { ImageService } from './services';

test('ImageService lists images', async () => {
  const client = new MockEcrClient()
    .withRepository({ name: 'my-app', /* ... */ })
    .withImage('my-app', { digest: 'sha256:abc', tags: ['latest'], /* ... */ });

  const service = new ImageService(client);
  const images = await service.listImages('my-app');

  expect(images).toHaveLength(1);
  expect(images[0].tags).toContain('latest');
});
```

### Integration Testing with Recording

```typescript
// 1. Record real interactions (one-time setup)
const session = createRecordingSession(realClient, 'test-recording.json');
// ... run test scenarios ...
await session.save();

// 2. Replay in tests (fast, deterministic)
const replaySession = await createReplaySession('test-recording.json');
const client = replaySession.getClient();
// ... run same test scenarios ...
```

### Error Handling Tests

```typescript
test('handles repository not found', async () => {
  const client = new MockEcrClient()
    .withErrorInjection({
      operation: 'DescribeRepositories',
      errorKind: EcrErrorKind.RepositoryNotFound,
    });

  await expect(
    client.send('DescribeRepositories', { repositoryNames: ['missing'] })
  ).rejects.toThrow('Repository not found');
});
```

### Retry Logic Tests

```typescript
test('retries on throttling', async () => {
  const client = new MockEcrClient()
    .withRepository({ name: 'my-app', /* ... */ })
    .withErrorInjection({
      errorKind: EcrErrorKind.ThrottlingException,
      count: 2, // Fail twice, then succeed
    });

  // Should succeed after retries
  const result = await retryWithBackoff(() =>
    client.send('DescribeRepositories', { repositoryNames: ['my-app'] })
  );

  expect(result.repositories).toHaveLength(1);
  expect(client.getOperationCount('DescribeRepositories')).toBe(3);
});
```

## Best Practices

1. **Use MockEcrClient for unit tests**: Fast, isolated, controllable
2. **Use recording/replay for integration tests**: Captures real API behavior
3. **Test error conditions**: Use error injection to verify error handling
4. **Test retry logic**: Use error count limits to simulate transient failures
5. **Test timeouts**: Use latency injection to verify timeout handling
6. **Validate recordings**: Ensure all recorded operations are replayed

## API Reference

See individual module files for detailed API documentation:

- `mock-registry.ts` - In-memory registry state
- `mock-client.ts` - Mock client implementation
- `recorder.ts` - Operation recording
- `replay.ts` - Replay engine

## Examples

See the `examples/` directory for complete examples:

- `basic-mock.ts` - Basic mock client usage
- `error-injection.ts` - Error injection patterns
- `recording.ts` - Recording real interactions
- `replay.ts` - Replaying recordings
- `scan-progression.ts` - Simulating scan completion

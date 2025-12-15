# Azure Key Vault Simulation Layer

Mock implementations and replay functionality for testing Key Vault operations without requiring live Azure services.

## Overview

The simulation layer provides:

- **MockKeyVaultClient**: In-memory implementation of Key Vault operations
- **Access Logging**: Track all operations for analysis and replay
- **Replay Functionality**: Validate access patterns and test scenarios
- **Error Simulation**: Test error handling (access denied, not found, etc.)

## Quick Start

### Basic Usage

```typescript
import { MockKeyVaultClient } from './simulation';

// Create mock client
const client = new MockKeyVaultClient('https://test-vault.vault.azure.net');

// Register test data
client.registerSecret('db-password', 'secret123');
client.registerKey('encryption-key', { kty: 'RSA' });
client.registerCertificate('tls-cert', certBytes);

// Use like real client
const secret = await client.secrets().get('db-password');
console.log(secret.value.expose()); // 'secret123'

const key = await client.keys().get('encryption-key');
console.log(key.name); // 'encryption-key'
```

### Access Logging

```typescript
// All operations are automatically logged
await client.secrets().get('db-password');
await client.secrets().set('api-key', 'abc123');
await client.keys().create('signing-key', { keyType: KeyType.Rsa });

// Review access log
const log = client.getAccessLog();
console.log(`Performed ${log.length} operations`);

for (const entry of log) {
  console.log(`${entry.operation} ${entry.objectName}: ${entry.result}`);
}

// Clear log
client.clearAccessLog();
```

### Error Simulation

```typescript
// Simulate access denied
client.denyAccess('restricted-secret');

try {
  await client.secrets().get('restricted-secret');
} catch (error) {
  console.log(error.code); // 'AccessDenied'
}

// Allow access again
client.allowAccess('restricted-secret');

// Simulate not found
try {
  await client.secrets().get('non-existent');
} catch (error) {
  console.log(error.code); // 'SecretNotFound'
}
```

### Versioning

```typescript
// Register multiple versions
client.registerSecret('config', 'v1-value', 'version1');
client.registerSecret('config', 'v2-value', 'version2');
client.registerSecret('config', 'v3-value', 'version3');

// Get latest version (default)
const latest = await client.secrets().get('config');
console.log(latest.value.expose()); // 'v3-value'

// Get specific version
const v1 = await client.secrets().get('config', { version: 'version1' });
console.log(v1.value.expose()); // 'v1-value'
```

### Access Log Replay

```typescript
import { AccessLogReplayer } from './simulation';

// Setup mock client with test data
const client = new MockKeyVaultClient('https://test-vault.vault.azure.net');
client.registerSecret('secret1', 'value1');
client.registerSecret('secret2', 'value2');
client.denyAccess('secret3');

// Perform operations
await client.secrets().get('secret1');
await client.secrets().get('secret2');
try {
  await client.secrets().get('secret3'); // access denied
} catch {}
try {
  await client.secrets().get('secret4'); // not found
} catch {}

// Get access log
const log = client.getAccessLog();

// Replay operations
const replayer = new AccessLogReplayer(client);
const result = await replayer.replay(log);

console.log(`Match rate: ${result.matchPercentage}%`);
console.log(`Successes: ${result.successCount}`);
console.log(`Failures: ${result.failureCount}`);

// Generate report
const report = replayer.generateReport(result);
console.log(report);
```

### Saving and Loading Logs

```typescript
const replayer = new AccessLogReplayer(client);

// Save log to file
await replayer.saveLog(
  './access-log.json',
  client.getAccessLog(),
  'https://test-vault.vault.azure.net'
);

// Load log from file
const loadedLog = await replayer.loadLog('./access-log.json');

// Replay loaded log
const result = await replayer.replay(loadedLog);
```

### Comparing Logs

```typescript
const replayer = new AccessLogReplayer(client);

// Compare two access logs
const log1 = await replayer.loadLog('./log1.json');
const log2 = await replayer.loadLog('./log2.json');

const comparison = replayer.compare(log1, log2);

if (comparison.matches) {
  console.log('Logs are identical');
} else {
  console.log('Differences found:');
  for (const diff of comparison.differences) {
    console.log(`  - ${diff}`);
  }
}
```

## Service Interfaces

The mock client implements the same service interfaces as the real client:

### SecretsService

```typescript
interface SecretsService {
  get(name: string, options?: GetSecretOptions): Promise<Secret>;
  set(name: string, value: string, options?: SetSecretOptions): Promise<Secret>;
  update(name: string, version: string, options: UpdateSecretPropertiesOptions): Promise<SecretProperties>;
  delete(name: string): Promise<DeletedSecret>;
  list(options?: ListSecretsOptions): AsyncIterable<SecretProperties>;
}
```

### KeysService

```typescript
interface KeysService {
  get(name: string, options?: GetKeyOptions): Promise<Key>;
  create(name: string, options: CreateKeyOptions): Promise<Key>;
  importKey(name: string, options: ImportKeyOptions): Promise<Key>;
  update(name: string, version: string, options: UpdateKeyPropertiesOptions): Promise<KeyProperties>;
  delete(name: string): Promise<DeletedKey>;
  list(options?: ListKeysOptions): AsyncIterable<KeyProperties>;
}
```

### CertificatesService

```typescript
interface CertificatesService {
  get(name: string, options?: GetCertificateOptions): Promise<Certificate>;
  create(name: string, options: CreateCertificateOptions): Promise<Certificate>;
  importCertificate(name: string, options: ImportCertificateOptions): Promise<Certificate>;
  update(name: string, version: string, options: UpdateCertificatePropertiesOptions): Promise<CertificateProperties>;
  delete(name: string): Promise<DeletedCertificate>;
  list(options?: ListCertificatesOptions): AsyncIterable<CertificateProperties>;
}
```

## Access Log Structure

```typescript
interface AccessLogEntry {
  timestamp: Date;              // When the operation occurred
  operation: string;            // Operation name (e.g., 'getSecret')
  objectName: string;           // Name of the object accessed
  objectType: 'secret' | 'key' | 'certificate';
  version?: string;             // Version (if applicable)
  result: AccessResult;         // 'success' | 'not_found' | 'access_denied' | 'error'
  error?: string;               // Error message (if any)
  durationMs?: number;          // Operation duration
}
```

## Testing Patterns

### Unit Tests

```typescript
import { MockKeyVaultClient } from './simulation';

describe('Secret Operations', () => {
  let client: MockKeyVaultClient;

  beforeEach(() => {
    client = new MockKeyVaultClient();
    client.registerSecret('test-secret', 'test-value');
  });

  it('should retrieve secret', async () => {
    const secret = await client.secrets().get('test-secret');
    expect(secret.value.expose()).toBe('test-value');
  });

  it('should throw on missing secret', async () => {
    await expect(client.secrets().get('missing')).rejects.toThrow('SecretNotFound');
  });

  it('should deny access when configured', async () => {
    client.denyAccess('test-secret');
    await expect(client.secrets().get('test-secret')).rejects.toThrow('AccessDenied');
  });
});
```

### Integration Tests

```typescript
// Test access patterns
const client = new MockKeyVaultClient();
const replayer = new AccessLogReplayer(client);

// Setup test scenario
client.registerSecret('db-password', 'secret123');
client.registerKey('encryption-key', { kty: 'RSA' });

// Run application code
await myApp.initialize(client);

// Verify access pattern
const log = client.getAccessLog();
expect(log).toHaveLength(2);
expect(log[0]?.operation).toBe('getSecret');
expect(log[1]?.operation).toBe('getKey');
```

## Best Practices

1. **Register test data before use**: Always register secrets, keys, and certificates before attempting to access them
2. **Clear logs between tests**: Use `clearAccessLog()` to avoid test interference
3. **Use versioning**: Test version-specific behavior by registering multiple versions
4. **Test error scenarios**: Use `denyAccess()` to simulate permission issues
5. **Replay for validation**: Use replay functionality to ensure consistent behavior across runs
6. **Save logs for debugging**: Save access logs to files for later analysis

## Limitations

- Mock client runs in-memory only (no persistence)
- Cryptographic operations are simulated (not real crypto)
- No network latency simulation (operations complete instantly)
- Simplified key material (JWK structures are minimal)
- No support for async certificate creation (CertificateOperation)

## See Also

- [Azure Key Vault Types](../types/README.md)
- [Azure Key Vault Error Handling](../error.ts)
- [SPARC Simulation Pattern](../../../blob-storage/typescript/src/simulation/README.md)

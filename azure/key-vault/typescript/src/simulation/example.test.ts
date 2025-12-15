/**
 * Example tests demonstrating the simulation layer
 *
 * These examples show how to use MockKeyVaultClient and AccessLogReplayer
 * for testing Key Vault operations.
 */

import { MockKeyVaultClient, AccessLogReplayer } from './index.js';
import { KeyType } from '../types/key.js';
import {
  SecretNotFoundError,
  KeyNotFoundError,
  CertificateNotFoundError,
  AccessDeniedError,
} from '../error.js';

describe('MockKeyVaultClient - Secrets', () => {
  let client: MockKeyVaultClient;

  beforeEach(() => {
    client = new MockKeyVaultClient('https://test-vault.vault.azure.net');
  });

  it('should store and retrieve secrets', async () => {
    client.registerSecret('test-secret', 'my-secret-value');

    const secret = await client.secrets().get('test-secret');

    expect(secret.name).toBe('test-secret');
    expect(secret.value.expose()).toBe('my-secret-value');
    expect(secret.properties.enabled).toBe(true);
  });

  it('should throw SecretNotFoundError for missing secrets', async () => {
    await expect(client.secrets().get('non-existent')).rejects.toThrow(
      SecretNotFoundError
    );
  });

  it('should set new secrets', async () => {
    const secret = await client.secrets().set('new-secret', 'new-value');

    expect(secret.name).toBe('new-secret');
    expect(secret.value.expose()).toBe('new-value');
  });

  it('should handle multiple versions', async () => {
    client.registerSecret('config', 'v1-value', 'version1');
    client.registerSecret('config', 'v2-value', 'version2');
    client.registerSecret('config', 'v3-value', 'version3');

    // Get latest
    const latest = await client.secrets().get('config');
    expect(latest.value.expose()).toBe('v3-value');

    // Get specific version
    const v1 = await client.secrets().get('config', { version: 'version1' });
    expect(v1.value.expose()).toBe('v1-value');
  });

  it('should deny access when configured', async () => {
    client.registerSecret('restricted', 'secret-value');
    client.denyAccess('restricted');

    await expect(client.secrets().get('restricted')).rejects.toThrow(
      AccessDeniedError
    );
  });

  it('should update secret properties', async () => {
    client.registerSecret('updatable', 'value', 'v1');

    const updated = await client.secrets().update('updatable', 'v1', {
      enabled: false,
      tags: { env: 'test' },
    });

    expect(updated.enabled).toBe(false);
    expect(updated.tags?.env).toBe('test');
  });

  it('should delete secrets', async () => {
    client.registerSecret('to-delete', 'value');

    const deleted = await client.secrets().delete('to-delete');

    expect(deleted.name).toBe('to-delete');
    expect(deleted.properties.deletedOn).toBeDefined();
  });

  it('should list secrets', async () => {
    client.registerSecret('secret1', 'value1');
    client.registerSecret('secret2', 'value2');
    client.registerSecret('secret3', 'value3');

    const secrets = [];
    for await (const secret of client.secrets().list()) {
      secrets.push(secret);
    }

    expect(secrets).toHaveLength(3);
    expect(secrets.map((s) => s.name)).toContain('secret1');
    expect(secrets.map((s) => s.name)).toContain('secret2');
    expect(secrets.map((s) => s.name)).toContain('secret3');
  });
});

describe('MockKeyVaultClient - Keys', () => {
  let client: MockKeyVaultClient;

  beforeEach(() => {
    client = new MockKeyVaultClient('https://test-vault.vault.azure.net');
  });

  it('should store and retrieve keys', async () => {
    const jwk = { kty: 'RSA', kid: 'test-key-id' };
    client.registerKey('test-key', jwk);

    const key = await client.keys().get('test-key');

    expect(key.name).toBe('test-key');
    expect(key.keyMaterial.kty).toBe('RSA');
  });

  it('should create keys', async () => {
    const key = await client.keys().create('new-key', {
      keyType: KeyType.Rsa,
      keySize: 2048,
    });

    expect(key.name).toBe('new-key');
    expect(key.properties.keyType).toBe(KeyType.Rsa);
    expect(key.properties.keySize).toBe(2048);
  });

  it('should throw KeyNotFoundError for missing keys', async () => {
    await expect(client.keys().get('non-existent')).rejects.toThrow(
      KeyNotFoundError
    );
  });
});

describe('MockKeyVaultClient - Certificates', () => {
  let client: MockKeyVaultClient;

  beforeEach(() => {
    client = new MockKeyVaultClient('https://test-vault.vault.azure.net');
  });

  it('should store and retrieve certificates', async () => {
    const certBytes = new Uint8Array([0x30, 0x82, 0x01, 0x00]);
    client.registerCertificate('test-cert', certBytes);

    const cert = await client.certificates().get('test-cert');

    expect(cert.name).toBe('test-cert');
    expect(cert.cer).toEqual(certBytes);
  });

  it('should throw CertificateNotFoundError for missing certificates', async () => {
    await expect(client.certificates().get('non-existent')).rejects.toThrow(
      CertificateNotFoundError
    );
  });

  it('should import certificates', async () => {
    const certBytes = new Uint8Array([0x30, 0x82, 0x01, 0x00]);

    const cert = await client.certificates().importCertificate('imported', {
      certificate: certBytes,
    });

    expect(cert.name).toBe('imported');
    expect(cert.cer).toEqual(certBytes);
  });
});

describe('MockKeyVaultClient - Access Logging', () => {
  let client: MockKeyVaultClient;

  beforeEach(() => {
    client = new MockKeyVaultClient('https://test-vault.vault.azure.net');
  });

  it('should log successful operations', async () => {
    client.registerSecret('logged-secret', 'value');

    await client.secrets().get('logged-secret');

    const log = client.getAccessLog();
    expect(log).toHaveLength(1);
    expect(log[0]?.operation).toBe('getSecret');
    expect(log[0]?.objectName).toBe('logged-secret');
    expect(log[0]?.objectType).toBe('secret');
    expect(log[0]?.result).toBe('success');
  });

  it('should log not found errors', async () => {
    try {
      await client.secrets().get('missing');
    } catch {}

    const log = client.getAccessLog();
    expect(log).toHaveLength(1);
    expect(log[0]?.operation).toBe('getSecret');
    expect(log[0]?.objectName).toBe('missing');
    expect(log[0]?.result).toBe('not_found');
  });

  it('should log access denied errors', async () => {
    client.registerSecret('denied', 'value');
    client.denyAccess('denied');

    try {
      await client.secrets().get('denied');
    } catch {}

    const log = client.getAccessLog();
    expect(log).toHaveLength(1);
    expect(log[0]?.operation).toBe('getSecret');
    expect(log[0]?.result).toBe('access_denied');
  });

  it('should clear access log', async () => {
    client.registerSecret('test', 'value');
    await client.secrets().get('test');

    expect(client.getAccessLog()).toHaveLength(1);

    client.clearAccessLog();

    expect(client.getAccessLog()).toHaveLength(0);
  });
});

describe('AccessLogReplayer', () => {
  let client: MockKeyVaultClient;
  let replayer: AccessLogReplayer;

  beforeEach(() => {
    client = new MockKeyVaultClient('https://test-vault.vault.azure.net');
    replayer = new AccessLogReplayer(client);
  });

  it('should replay successful operations', async () => {
    client.registerSecret('secret1', 'value1');
    client.registerSecret('secret2', 'value2');

    // Perform operations
    await client.secrets().get('secret1');
    await client.secrets().get('secret2');

    const log = client.getAccessLog();

    // Replay
    const result = await replayer.replay(log);

    expect(result.successCount).toBe(2);
    expect(result.failureCount).toBe(0);
    expect(result.matchPercentage).toBe(100);
  });

  it('should detect replay mismatches', async () => {
    client.registerSecret('test', 'value');

    // Perform operation
    await client.secrets().get('test');

    const log = client.getAccessLog();

    // Remove secret before replay
    await client.secrets().delete('test');

    // Replay should fail
    const result = await replayer.replay(log);

    expect(result.successCount).toBe(0);
    expect(result.failureCount).toBe(1);
    expect(result.matchPercentage).toBe(0);
  });

  it('should compare access logs', () => {
    const log1 = [
      {
        timestamp: new Date(),
        operation: 'getSecret',
        objectName: 'secret1',
        objectType: 'secret' as const,
        result: 'success' as const,
      },
    ];

    const log2 = [
      {
        timestamp: new Date(),
        operation: 'getSecret',
        objectName: 'secret1',
        objectType: 'secret' as const,
        result: 'success' as const,
      },
    ];

    const comparison = replayer.compare(log1, log2);

    expect(comparison.matches).toBe(true);
    expect(comparison.differences).toHaveLength(0);
  });

  it('should detect log differences', () => {
    const log1 = [
      {
        timestamp: new Date(),
        operation: 'getSecret',
        objectName: 'secret1',
        objectType: 'secret' as const,
        result: 'success' as const,
      },
    ];

    const log2 = [
      {
        timestamp: new Date(),
        operation: 'getKey',
        objectName: 'key1',
        objectType: 'key' as const,
        result: 'success' as const,
      },
    ];

    const comparison = replayer.compare(log1, log2);

    expect(comparison.matches).toBe(false);
    expect(comparison.differences.length).toBeGreaterThan(0);
  });

  it('should generate report', async () => {
    client.registerSecret('test', 'value');

    await client.secrets().get('test');
    try {
      await client.secrets().get('missing');
    } catch {}

    const log = client.getAccessLog();
    const result = await replayer.replay(log);

    const report = replayer.generateReport(result);

    expect(report).toContain('Access Log Replay Report');
    expect(report).toContain('Total entries: 2');
  });
});

/**
 * Azure Key Vault Access Log Replay
 *
 * Replays recorded access patterns against a mock client to verify behavior.
 * Useful for testing and validating Key Vault interactions.
 */

import { readFile, writeFile } from 'node:fs/promises';
import type { MockKeyVaultClient } from './mockClient.js';
import type {
  AccessLogEntry,
  AccessResult,
  ReplayEntry,
  ReplayResult,
  AccessLogFile,
} from './types.js';

/**
 * Current access log file format version
 */
const LOG_VERSION = '1.0';

/**
 * Access Log Replayer
 *
 * Replays recorded access patterns against a mock client to ensure
 * consistent behavior and validate test scenarios.
 *
 * @example
 * ```typescript
 * const client = new MockKeyVaultClient('https://test-vault.vault.azure.net');
 * const replayer = new AccessLogReplayer(client);
 *
 * // Load and replay access log
 * const log = await replayer.loadLog('./access-log.json');
 * const result = await replayer.replay(log);
 *
 * console.log(`Match rate: ${result.matchPercentage}%`);
 * console.log(`Successes: ${result.successCount}, Failures: ${result.failureCount}`);
 * ```
 */
export class AccessLogReplayer {
  /**
   * Create a new replayer
   *
   * @param client - Mock client to replay operations against
   */
  constructor(private client: MockKeyVaultClient) {}

  /**
   * Replay a recorded access log
   *
   * Executes each operation in the log and compares the results
   * with the original outcomes.
   *
   * @param log - Access log entries to replay
   * @returns Replay result with success/failure statistics
   */
  async replay(log: AccessLogEntry[]): Promise<ReplayResult> {
    const entries: ReplayEntry[] = [];
    let successCount = 0;
    let failureCount = 0;

    for (const entry of log) {
      const replayEntry = await this.replayEntry(entry);
      entries.push(replayEntry);

      if (replayEntry.matches) {
        successCount++;
      } else {
        failureCount++;
      }
    }

    const total = successCount + failureCount;
    const matchPercentage = total > 0 ? (successCount / total) * 100 : 0;

    return {
      entries,
      successCount,
      failureCount,
      matchPercentage,
    };
  }

  /**
   * Replay a single access log entry
   *
   * @param entry - Access log entry to replay
   * @returns Replay entry with comparison result
   */
  private async replayEntry(entry: AccessLogEntry): Promise<ReplayEntry> {
    let replayedResult: AccessResult;
    let replayError: string | undefined;

    try {
      // Execute the operation based on type and object type
      await this.executeOperation(entry);
      replayedResult = 'success';
    } catch (error) {
      // Determine error type
      if (error instanceof Error) {
        const errorCode = (error as any).code;
        replayError = error.message;

        if (errorCode === 'SecretNotFound' || errorCode === 'KeyNotFound' || errorCode === 'CertificateNotFound' || errorCode === 'VersionNotFound') {
          replayedResult = 'not_found';
        } else if (errorCode === 'AccessDenied') {
          replayedResult = 'access_denied';
        } else {
          replayedResult = 'error';
        }
      } else {
        replayedResult = 'error';
        replayError = String(error);
      }
    }

    const matches = replayedResult === entry.result;

    return {
      original: entry,
      replayedResult,
      matches,
      replayError,
    };
  }

  /**
   * Execute an operation based on the log entry
   *
   * @param entry - Access log entry describing the operation
   */
  private async executeOperation(entry: AccessLogEntry): Promise<void> {
    const { operation, objectName, objectType, version } = entry;

    switch (objectType) {
      case 'secret':
        await this.executeSecretOperation(operation, objectName, version);
        break;
      case 'key':
        await this.executeKeyOperation(operation, objectName, version);
        break;
      case 'certificate':
        await this.executeCertificateOperation(operation, objectName, version);
        break;
      default:
        throw new Error(`Unknown object type: ${objectType}`);
    }
  }

  /**
   * Execute a secret operation
   */
  private async executeSecretOperation(operation: string, name: string, version?: string): Promise<void> {
    const secrets = this.client.secrets();

    switch (operation) {
      case 'getSecret':
        await secrets.get(name, version ? { version } : undefined);
        break;
      case 'setSecret':
        // For replay, we just verify access - actual value doesn't matter
        await secrets.set(name, 'replay-value');
        break;
      case 'updateSecret':
        if (!version) {
          throw new Error('Version required for updateSecret');
        }
        await secrets.update(name, version, {});
        break;
      case 'deleteSecret':
        await secrets.delete(name);
        break;
      default:
        throw new Error(`Unknown secret operation: ${operation}`);
    }
  }

  /**
   * Execute a key operation
   */
  private async executeKeyOperation(operation: string, name: string, version?: string): Promise<void> {
    const keys = this.client.keys();

    switch (operation) {
      case 'getKey':
        await keys.get(name, version ? { version } : undefined);
        break;
      case 'createKey':
        // For replay, we create a basic RSA key
        await keys.create(name, { keyType: 'RSA' as any });
        break;
      case 'importKey':
        // For replay, we import a basic JWK
        await keys.importKey(name, { key: { kty: 'RSA' } });
        break;
      case 'updateKey':
        if (!version) {
          throw new Error('Version required for updateKey');
        }
        await keys.update(name, version, {});
        break;
      case 'deleteKey':
        await keys.delete(name);
        break;
      default:
        throw new Error(`Unknown key operation: ${operation}`);
    }
  }

  /**
   * Execute a certificate operation
   */
  private async executeCertificateOperation(operation: string, name: string, version?: string): Promise<void> {
    const certificates = this.client.certificates();

    switch (operation) {
      case 'getCertificate':
        await certificates.get(name, version ? { version } : undefined);
        break;
      case 'createCertificate':
        // For replay, we create with minimal policy
        await certificates.create(name, {
          policy: {
            issuerParameters: { name: 'Self' },
            x509Properties: { subject: 'CN=test' },
          },
        });
        break;
      case 'importCertificate':
        // For replay, we import a mock certificate
        await certificates.importCertificate(name, {
          certificate: new Uint8Array([0x30, 0x82, 0x01, 0x00]),
        });
        break;
      case 'updateCertificate':
        if (!version) {
          throw new Error('Version required for updateCertificate');
        }
        await certificates.update(name, version, {});
        break;
      case 'deleteCertificate':
        await certificates.delete(name);
        break;
      default:
        throw new Error(`Unknown certificate operation: ${operation}`);
    }
  }

  /**
   * Compare two access logs
   *
   * Compares operation sequences and identifies differences.
   *
   * @param log1 - First access log
   * @param log2 - Second access log
   * @returns Comparison result
   */
  compare(
    log1: AccessLogEntry[],
    log2: AccessLogEntry[]
  ): {
    matches: boolean;
    differences: string[];
  } {
    const differences: string[] = [];

    // Check length
    if (log1.length !== log2.length) {
      differences.push(
        `Different log lengths: ${log1.length} vs ${log2.length}`
      );
    }

    // Compare entries
    const maxLength = Math.max(log1.length, log2.length);
    for (let i = 0; i < maxLength; i++) {
      const entry1 = log1[i];
      const entry2 = log2[i];

      if (!entry1) {
        differences.push(`Entry ${i}: missing in log1`);
        continue;
      }

      if (!entry2) {
        differences.push(`Entry ${i}: missing in log2`);
        continue;
      }

      // Compare fields
      if (entry1.operation !== entry2.operation) {
        differences.push(
          `Entry ${i}: operation mismatch: ${entry1.operation} vs ${entry2.operation}`
        );
      }

      if (entry1.objectName !== entry2.objectName) {
        differences.push(
          `Entry ${i}: objectName mismatch: ${entry1.objectName} vs ${entry2.objectName}`
        );
      }

      if (entry1.objectType !== entry2.objectType) {
        differences.push(
          `Entry ${i}: objectType mismatch: ${entry1.objectType} vs ${entry2.objectType}`
        );
      }

      if (entry1.version !== entry2.version) {
        differences.push(
          `Entry ${i}: version mismatch: ${entry1.version} vs ${entry2.version}`
        );
      }

      if (entry1.result !== entry2.result) {
        differences.push(
          `Entry ${i}: result mismatch: ${entry1.result} vs ${entry2.result}`
        );
      }
    }

    return {
      matches: differences.length === 0,
      differences,
    };
  }

  /**
   * Load access log from file
   *
   * @param path - Path to access log file
   * @returns Array of access log entries
   */
  async loadLog(path: string): Promise<AccessLogEntry[]> {
    const content = await readFile(path, 'utf-8');
    const file: AccessLogFile = JSON.parse(content);

    // Validate file format
    if (!file.version || !Array.isArray(file.entries)) {
      throw new Error(`Invalid access log file format at ${path}`);
    }

    // Convert timestamp strings back to Date objects
    const entries: AccessLogEntry[] = file.entries.map((entry) => ({
      ...entry,
      timestamp: new Date(entry.timestamp as any),
    }));

    return entries;
  }

  /**
   * Save access log to file
   *
   * @param path - Path where to save the log
   * @param entries - Access log entries to save
   * @param vaultUrl - Vault URL for the log
   */
  async saveLog(path: string, entries: AccessLogEntry[], vaultUrl: string): Promise<void> {
    const file: AccessLogFile = {
      version: LOG_VERSION,
      created: new Date().toISOString(),
      vaultUrl,
      entries,
    };

    const content = JSON.stringify(file, null, 2);
    await writeFile(path, content, 'utf-8');
  }

  /**
   * Generate a summary report of a replay result
   *
   * @param result - Replay result to summarize
   * @returns Human-readable summary
   */
  generateReport(result: ReplayResult): string {
    const lines: string[] = [];

    lines.push('=== Access Log Replay Report ===');
    lines.push('');
    lines.push(`Total entries: ${result.entries.length}`);
    lines.push(`Successful matches: ${result.successCount}`);
    lines.push(`Failed matches: ${result.failureCount}`);
    lines.push(`Match percentage: ${result.matchPercentage.toFixed(2)}%`);
    lines.push('');

    if (result.failureCount > 0) {
      lines.push('=== Failures ===');
      for (let i = 0; i < result.entries.length; i++) {
        const entry = result.entries[i];
        if (entry && !entry.matches) {
          lines.push(
            `[${i}] ${entry.original.operation} ${entry.original.objectName}: ` +
            `expected ${entry.original.result}, got ${entry.replayedResult}`
          );
          if (entry.replayError) {
            lines.push(`    Error: ${entry.replayError}`);
          }
        }
      }
    }

    return lines.join('\n');
  }
}

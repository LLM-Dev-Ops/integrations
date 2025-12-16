/**
 * Redshift Integration Security Module
 *
 * Security utilities including audit logging, SQL sanitization, and credential redaction.
 * Provides comprehensive security features for Redshift operations.
 *
 * @module @llmdevops/redshift-integration/security
 */

import * as fs from 'fs/promises';
import * as path from 'path';

// ============================================================================
// Audit Logger Configuration
// ============================================================================

/**
 * Audit logger configuration interface.
 * Defines how audit events are logged and stored.
 */
export interface AuditLoggerConfig {
  /** Whether audit logging is enabled */
  enabled: boolean;

  /** Whether to redact SQL queries in logs */
  redactSql: boolean;

  /** Whether to redact query parameters in logs */
  redactParams: boolean;

  /** Where to send audit logs */
  logDestination: 'console' | 'file' | 'callback';

  /** File path for file-based logging */
  filePath?: string;

  /** Callback function for custom log handling */
  callback?: (entry: AuditLogEntry) => void | Promise<void>;
}

// ============================================================================
// Audit Log Entry Types
// ============================================================================

/**
 * Event types for audit logging.
 */
export type AuditEventType =
  | 'QUERY'
  | 'CONNECT'
  | 'DISCONNECT'
  | 'ERROR'
  | 'COPY'
  | 'UNLOAD';

/**
 * Complete audit log entry.
 * Records all relevant information about an operation.
 */
export interface AuditLogEntry {
  /** When the event occurred */
  timestamp: Date;

  /** Type of event */
  eventType: AuditEventType;

  /** Session identifier */
  sessionId?: string;

  /** Query identifier */
  queryId?: string;

  /** SQL text (potentially redacted) */
  sqlText?: string;

  /** Duration of operation in milliseconds */
  durationMs?: number;

  /** Number of rows affected or returned */
  rowsAffected?: number;

  /** Whether the operation succeeded */
  success: boolean;

  /** Error message if operation failed */
  errorMessage?: string;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Query-specific log entry.
 */
export interface QueryLogEntry {
  /** Session identifier */
  sessionId?: string;

  /** Query identifier */
  queryId: string;

  /** SQL query text */
  sqlText: string;

  /** Query parameters */
  params?: unknown[];

  /** Duration in milliseconds */
  durationMs: number;

  /** Rows returned or affected */
  rowsAffected?: number;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Failed query log entry.
 */
export interface FailedQueryLogEntry {
  /** Session identifier */
  sessionId?: string;

  /** Query identifier */
  queryId?: string;

  /** SQL query text */
  sqlText: string;

  /** Query parameters */
  params?: unknown[];

  /** Error message */
  errorMessage: string;

  /** Duration before failure in milliseconds */
  durationMs?: number;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Connection log entry.
 */
export interface ConnectionLogEntry {
  /** Session identifier */
  sessionId: string;

  /** Whether connection was successful */
  success: boolean;

  /** Username */
  user?: string;

  /** Database name */
  database?: string;

  /** Host */
  host?: string;

  /** Error message if connection failed */
  errorMessage?: string;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * COPY operation log entry.
 */
export interface CopyLogEntry {
  /** Session identifier */
  sessionId?: string;

  /** Target table */
  table: string;

  /** Source location (S3 path, etc.) */
  source: string;

  /** Rows copied */
  rowsAffected: number;

  /** Duration in milliseconds */
  durationMs: number;

  /** Whether operation succeeded */
  success: boolean;

  /** Error message if failed */
  errorMessage?: string;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * UNLOAD operation log entry.
 */
export interface UnloadLogEntry {
  /** Session identifier */
  sessionId?: string;

  /** Source query or table */
  source: string;

  /** Destination location (S3 path, etc.) */
  destination: string;

  /** Rows unloaded */
  rowsAffected: number;

  /** Duration in milliseconds */
  durationMs: number;

  /** Whether operation succeeded */
  success: boolean;

  /** Error message if failed */
  errorMessage?: string;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Audit Logger Class
// ============================================================================

/**
 * Audit logger for tracking Redshift operations.
 * Provides comprehensive audit logging with configurable redaction.
 */
export class AuditLogger {
  private readonly config: AuditLoggerConfig;
  private fileHandle?: fs.FileHandle;

  /**
   * Creates a new audit logger instance.
   *
   * @param config - Audit logger configuration
   */
  constructor(config: AuditLoggerConfig) {
    this.config = config;
  }

  /**
   * Logs a successful query execution.
   *
   * @param entry - Query log entry
   */
  async logQuery(entry: QueryLogEntry): Promise<void> {
    if (!this.config.enabled) return;

    const auditEntry: AuditLogEntry = {
      timestamp: new Date(),
      eventType: 'QUERY',
      sessionId: entry.sessionId,
      queryId: entry.queryId,
      sqlText: this.config.redactSql ? this.redactSql(entry.sqlText) : entry.sqlText,
      durationMs: entry.durationMs,
      rowsAffected: entry.rowsAffected,
      success: true,
      metadata: {
        ...entry.metadata,
        params: this.config.redactParams && entry.params
          ? this.redactParams(entry.params)
          : entry.params,
      },
    };

    await this.writeLog(auditEntry);
  }

  /**
   * Logs a failed query execution.
   *
   * @param entry - Failed query log entry
   */
  async logQueryFailed(entry: FailedQueryLogEntry): Promise<void> {
    if (!this.config.enabled) return;

    const auditEntry: AuditLogEntry = {
      timestamp: new Date(),
      eventType: 'ERROR',
      sessionId: entry.sessionId,
      queryId: entry.queryId,
      sqlText: this.config.redactSql ? this.redactSql(entry.sqlText) : entry.sqlText,
      durationMs: entry.durationMs,
      success: false,
      errorMessage: entry.errorMessage,
      metadata: {
        ...entry.metadata,
        params: this.config.redactParams && entry.params
          ? this.redactParams(entry.params)
          : entry.params,
      },
    };

    await this.writeLog(auditEntry);
  }

  /**
   * Logs a connection event.
   *
   * @param entry - Connection log entry
   */
  async logConnection(entry: ConnectionLogEntry): Promise<void> {
    if (!this.config.enabled) return;

    const auditEntry: AuditLogEntry = {
      timestamp: new Date(),
      eventType: entry.success ? 'CONNECT' : 'ERROR',
      sessionId: entry.sessionId,
      success: entry.success,
      errorMessage: entry.errorMessage,
      metadata: {
        ...entry.metadata,
        user: entry.user,
        database: entry.database,
        host: entry.host,
      },
    };

    await this.writeLog(auditEntry);
  }

  /**
   * Logs a COPY operation.
   *
   * @param entry - COPY operation log entry
   */
  async logCopyOperation(entry: CopyLogEntry): Promise<void> {
    if (!this.config.enabled) return;

    const auditEntry: AuditLogEntry = {
      timestamp: new Date(),
      eventType: 'COPY',
      sessionId: entry.sessionId,
      durationMs: entry.durationMs,
      rowsAffected: entry.rowsAffected,
      success: entry.success,
      errorMessage: entry.errorMessage,
      metadata: {
        ...entry.metadata,
        table: entry.table,
        source: entry.source,
      },
    };

    await this.writeLog(auditEntry);
  }

  /**
   * Logs an UNLOAD operation.
   *
   * @param entry - UNLOAD operation log entry
   */
  async logUnloadOperation(entry: UnloadLogEntry): Promise<void> {
    if (!this.config.enabled) return;

    const auditEntry: AuditLogEntry = {
      timestamp: new Date(),
      eventType: 'UNLOAD',
      sessionId: entry.sessionId,
      durationMs: entry.durationMs,
      rowsAffected: entry.rowsAffected,
      success: entry.success,
      errorMessage: entry.errorMessage,
      metadata: {
        ...entry.metadata,
        source: entry.source,
        destination: entry.destination,
      },
    };

    await this.writeLog(auditEntry);
  }

  /**
   * Logs a disconnection event.
   *
   * @param sessionId - Session identifier
   */
  async logDisconnection(sessionId: string): Promise<void> {
    if (!this.config.enabled) return;

    const auditEntry: AuditLogEntry = {
      timestamp: new Date(),
      eventType: 'DISCONNECT',
      sessionId,
      success: true,
    };

    await this.writeLog(auditEntry);
  }

  /**
   * Redacts sensitive information from SQL.
   * Replaces string literals and numeric values while preserving structure.
   *
   * @param sql - SQL query text
   * @returns Redacted SQL
   */
  redactSql(sql: string): string {
    let redacted = sql;

    // Replace string literals with '***'
    redacted = redacted.replace(/'(?:[^'\\]|\\.)*'/g, "'***'");

    // Replace numeric literals with '?'
    redacted = redacted.replace(/\b\d+\.?\d*\b/g, '?');

    // Redact password-related patterns
    redacted = redacted.replace(
      /(?:password|pwd|secret|token|key)\s*=\s*'[^']*'/gi,
      (match) => match.replace(/'[^']*'/, "'***'")
    );

    // Redact credentials in connection strings
    redacted = redacted.replace(
      /\/\/[^:]+:[^@]+@/g,
      '//***:***@'
    );

    return redacted;
  }

  /**
   * Redacts sensitive parameters.
   * Replaces values that appear to be secrets.
   *
   * @param params - Query parameters
   * @returns Redacted parameters
   */
  redactParams(params: unknown[]): unknown[] {
    return params.map((param) => {
      if (typeof param === 'string' && this.isSensitive(param)) {
        return '[REDACTED]';
      }
      if (typeof param === 'object' && param !== null) {
        return this.redactObject(param as Record<string, unknown>);
      }
      return param;
    });
  }

  /**
   * Checks if a string value appears to be sensitive.
   * Detects common patterns for secrets and credentials.
   *
   * @param value - String to check
   * @returns True if value appears sensitive
   */
  isSensitive(value: string): boolean {
    const sensitivePatterns = [
      /password/i,
      /secret/i,
      /token/i,
      /key/i,
      /credential/i,
      /apikey/i,
      /api_key/i,
      /access_token/i,
      /refresh_token/i,
      /private_key/i,
      /passphrase/i,
    ];

    return sensitivePatterns.some((pattern) => pattern.test(value));
  }

  /**
   * Redacts sensitive fields from an object.
   *
   * @param obj - Object to redact
   * @returns Redacted object
   */
  private redactObject(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (this.isSensitive(key)) {
        result[key] = '[REDACTED]';
      } else if (typeof value === 'string' && this.isSensitive(value)) {
        result[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        result[key] = this.redactObject(value as Record<string, unknown>);
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Writes a log entry to the configured destination.
   *
   * @param entry - Audit log entry
   */
  private async writeLog(entry: AuditLogEntry): Promise<void> {
    switch (this.config.logDestination) {
      case 'console':
        console.log(JSON.stringify(entry, null, 2));
        break;

      case 'file':
        await this.writeToFile(entry);
        break;

      case 'callback':
        if (this.config.callback) {
          await this.config.callback(entry);
        }
        break;
    }
  }

  /**
   * Writes a log entry to a file.
   *
   * @param entry - Audit log entry
   */
  private async writeToFile(entry: AuditLogEntry): Promise<void> {
    if (!this.config.filePath) {
      throw new Error('File path required for file logging');
    }

    try {
      // Ensure directory exists
      const dir = path.dirname(this.config.filePath);
      await fs.mkdir(dir, { recursive: true });

      // Append to file
      const line = JSON.stringify(entry) + '\n';
      await fs.appendFile(this.config.filePath, line, 'utf-8');
    } catch (error) {
      console.error('Failed to write audit log to file:', error);
      throw error;
    }
  }

  /**
   * Closes the audit logger and releases resources.
   */
  async close(): Promise<void> {
    if (this.fileHandle) {
      await this.fileHandle.close();
      this.fileHandle = undefined;
    }
  }
}

// ============================================================================
// SQL Injection Prevention Utilities
// ============================================================================

/**
 * SQL injection prevention utilities.
 * Provides functions to safely escape and validate SQL identifiers and values.
 */
export class SqlSanitizer {
  /**
   * Escapes an identifier (table name, column name, etc.).
   * Uses double quotes for Redshift identifiers.
   *
   * @param name - Identifier to escape
   * @returns Escaped identifier
   */
  static escapeIdentifier(name: string): string {
    // Remove any existing quotes and escape internal quotes
    const cleaned = name.replace(/"/g, '""');
    return `"${cleaned}"`;
  }

  /**
   * Escapes a string value for use in SQL.
   * Prevents SQL injection by escaping single quotes.
   *
   * @param value - String value to escape
   * @returns Escaped string
   */
  static escapeString(value: string): string {
    return value.replace(/'/g, "''");
  }

  /**
   * Validates that a table name is safe to use.
   * Checks format and allowed characters.
   *
   * @param name - Table name to validate
   * @returns True if valid
   */
  static validateTableName(name: string): boolean {
    // Format: schema.table or table
    // Allow alphanumeric, underscore, and single dot
    const parts = name.split('.');

    // Maximum 2 parts (schema.table)
    if (parts.length > 2) return false;

    // Each part must be a valid identifier
    return parts.every((part) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(part));
  }

  /**
   * Validates that an identifier is safe to use.
   * Only allows alphanumeric characters and underscores.
   *
   * @param identifier - Identifier to validate
   * @returns True if valid
   */
  static isValidIdentifier(identifier: string): boolean {
    return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier);
  }

  /**
   * Sanitizes a value for use in SQL.
   * Converts JavaScript values to safe SQL representations.
   *
   * @param value - Value to sanitize
   * @returns Sanitized SQL value
   */
  static sanitizeValue(value: unknown): string {
    if (value === null || value === undefined) {
      return 'NULL';
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        throw new Error('Invalid numeric value');
      }
      return String(value);
    }
    if (typeof value === 'bigint') {
      return String(value);
    }
    if (value instanceof Date) {
      return `'${value.toISOString()}'`;
    }
    if (typeof value === 'string') {
      return `'${this.escapeString(value)}'`;
    }
    if (Array.isArray(value) || typeof value === 'object') {
      return `'${this.escapeString(JSON.stringify(value))}'`;
    }
    throw new Error(`Unsupported value type: ${typeof value}`);
  }

  /**
   * Checks if SQL contains potentially dangerous patterns.
   * Detects common SQL injection attempts.
   *
   * @param sql - SQL to check
   * @returns True if dangerous patterns detected
   */
  static containsDangerousPatterns(sql: string): boolean {
    const dangerous = [
      /;\s*DROP\s+/i,
      /;\s*DELETE\s+FROM\s+/i,
      /;\s*TRUNCATE\s+/i,
      /;\s*ALTER\s+/i,
      /;\s*CREATE\s+/i,
      /;\s*GRANT\s+/i,
      /;\s*REVOKE\s+/i,
      /--.*$/m,
      /\/\*[\s\S]*?\*\//,
      /'\s*OR\s+'?1'?\s*=\s*'?1/i,
      /'\s*OR\s+'?'?\s*=\s*'?'/i,
      /UNION\s+SELECT/i,
      /EXEC\s*\(/i,
      /EXECUTE\s+/i,
      /xp_cmdshell/i,
    ];

    return dangerous.some((pattern) => pattern.test(sql));
  }

  /**
   * Strips comments from SQL.
   * Removes both single-line and multi-line comments.
   *
   * @param sql - SQL to strip
   * @returns SQL without comments
   */
  static stripComments(sql: string): string {
    // Remove single-line comments
    let result = sql.replace(/--.*$/gm, '');
    // Remove multi-line comments
    result = result.replace(/\/\*[\s\S]*?\*\//g, '');
    return result;
  }

  /**
   * Normalizes whitespace in SQL.
   * Collapses multiple spaces into single spaces.
   *
   * @param sql - SQL to normalize
   * @returns Normalized SQL
   */
  static normalizeWhitespace(sql: string): string {
    return sql.replace(/\s+/g, ' ').trim();
  }
}

// ============================================================================
// Secret String
// ============================================================================

/**
 * A string that redacts its value in logs and JSON serialization.
 * Used for storing sensitive data like passwords, tokens, and keys.
 */
export class SecretString {
  private readonly value: string;
  private static readonly REDACTED = '[REDACTED]';

  /**
   * Creates a new secret string.
   *
   * @param value - Secret value
   */
  constructor(value: string) {
    this.value = value;
  }

  /**
   * Gets the secret value. Use sparingly and only when necessary.
   *
   * @returns The actual secret value
   */
  expose(): string {
    return this.value;
  }

  /**
   * Returns redacted string for display.
   *
   * @returns Redacted string
   */
  toString(): string {
    return SecretString.REDACTED;
  }

  /**
   * Returns redacted string for JSON serialization.
   *
   * @returns Redacted string
   */
  toJSON(): string {
    return SecretString.REDACTED;
  }

  /**
   * Returns redacted string for inspection.
   *
   * @returns Redacted string
   */
  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return SecretString.REDACTED;
  }

  /**
   * Creates a SecretString from an optional value.
   *
   * @param value - Optional string value
   * @returns SecretString or undefined
   */
  static from(value: string | undefined): SecretString | undefined {
    return value ? new SecretString(value) : undefined;
  }

  /**
   * Checks if a value is a SecretString.
   *
   * @param value - Value to check
   * @returns True if value is a SecretString
   */
  static isSecret(value: unknown): value is SecretString {
    return value instanceof SecretString;
  }
}

// ============================================================================
// Credential Redaction
// ============================================================================

/**
 * Redacts sensitive fields from an object for logging.
 * Recursively processes nested objects.
 *
 * @param obj - Object to redact
 * @returns Redacted copy of object
 */
export function redactCredentials<T extends Record<string, unknown>>(obj: T): T {
  const sensitiveFields = [
    'password',
    'privateKey',
    'privateKeyPassphrase',
    'token',
    'accessToken',
    'refreshToken',
    'secret',
    'apiKey',
    'credentials',
    'masterUserPassword',
    'tempPassword',
    'iamToken',
  ];

  const result = { ...obj };

  for (const key of Object.keys(result)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveFields.some((f) => lowerKey.includes(f.toLowerCase()))) {
      (result as Record<string, unknown>)[key] = '[REDACTED]';
    } else if (typeof result[key] === 'object' && result[key] !== null && !Array.isArray(result[key])) {
      (result as Record<string, unknown>)[key] = redactCredentials(
        result[key] as Record<string, unknown>
      );
    }
  }

  return result;
}

// ============================================================================
// Global Audit Logger Instance
// ============================================================================

/**
 * Global audit logger instance.
 */
let globalAuditLogger: AuditLogger | undefined;

/**
 * Gets or creates the global audit logger.
 * Provides singleton access to the audit logger.
 *
 * @param config - Optional configuration for initial creation
 * @returns Global audit logger instance
 */
export function getAuditLogger(config?: AuditLoggerConfig): AuditLogger {
  if (!globalAuditLogger) {
    const defaultConfig: AuditLoggerConfig = {
      enabled: true,
      redactSql: false,
      redactParams: false,
      logDestination: 'console',
      ...config,
    };
    globalAuditLogger = new AuditLogger(defaultConfig);
  }
  return globalAuditLogger;
}

/**
 * Resets the global audit logger.
 * Useful for testing or reconfiguration.
 */
export function resetAuditLogger(): void {
  if (globalAuditLogger) {
    globalAuditLogger.close().catch((error) => {
      console.error('Error closing audit logger:', error);
    });
  }
  globalAuditLogger = undefined;
}

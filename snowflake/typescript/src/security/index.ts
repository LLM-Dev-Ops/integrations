/**
 * Snowflake Integration Security Module
 *
 * Security utilities including SQL sanitization, secret handling, and audit logging.
 * @module @llmdevops/snowflake-integration/security
 */

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

  constructor(value: string) {
    this.value = value;
  }

  /**
   * Gets the secret value. Use sparingly.
   */
  expose(): string {
    return this.value;
  }

  /**
   * Returns redacted string for display.
   */
  toString(): string {
    return SecretString.REDACTED;
  }

  /**
   * Returns redacted string for JSON serialization.
   */
  toJSON(): string {
    return SecretString.REDACTED;
  }

  /**
   * Returns redacted string for inspection.
   */
  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return SecretString.REDACTED;
  }

  /**
   * Creates a SecretString from an optional value.
   */
  static from(value: string | undefined): SecretString | undefined {
    return value ? new SecretString(value) : undefined;
  }

  /**
   * Checks if a value is a SecretString.
   */
  static isSecret(value: unknown): value is SecretString {
    return value instanceof SecretString;
  }
}

// ============================================================================
// SQL Sanitization
// ============================================================================

/**
 * SQL sanitization utilities.
 */
export class SqlSanitizer {
  /**
   * Escapes a string value for use in SQL.
   * Prevents SQL injection by escaping single quotes.
   */
  static escapeString(value: string): string {
    return value.replace(/'/g, "''");
  }

  /**
   * Escapes an identifier (table name, column name, etc.).
   * Uses double quotes for Snowflake identifiers.
   */
  static escapeIdentifier(identifier: string): string {
    // Remove any existing quotes and escape internal quotes
    const cleaned = identifier.replace(/"/g, '""');
    return `"${cleaned}"`;
  }

  /**
   * Validates that a string is a safe identifier.
   * Only allows alphanumeric characters, underscores, and dots.
   */
  static isValidIdentifier(identifier: string): boolean {
    return /^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*$/.test(identifier);
  }

  /**
   * Validates a fully qualified table name.
   */
  static isValidTableName(tableName: string): boolean {
    // Format: database.schema.table or schema.table or table
    const parts = tableName.split('.');
    if (parts.length > 3) return false;
    return parts.every((part) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(part));
  }

  /**
   * Sanitizes a string value for use in SQL.
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
   */
  static containsDangerousPatterns(sql: string): boolean {
    const dangerous = [
      /;\s*DROP\s+/i,
      /;\s*DELETE\s+/i,
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
    ];

    return dangerous.some((pattern) => pattern.test(sql));
  }

  /**
   * Strips comments from SQL.
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
   */
  static normalizeWhitespace(sql: string): string {
    return sql.replace(/\s+/g, ' ').trim();
  }
}

// ============================================================================
// Audit Logging
// ============================================================================

/**
 * Audit event types.
 */
export type AuditEventType =
  | 'connection_opened'
  | 'connection_closed'
  | 'query_executed'
  | 'query_failed'
  | 'data_loaded'
  | 'data_exported'
  | 'warehouse_changed'
  | 'role_changed'
  | 'authentication_success'
  | 'authentication_failure';

/**
 * Audit event.
 */
export interface AuditEvent {
  /** Event type */
  type: AuditEventType;
  /** Event timestamp */
  timestamp: Date;
  /** Session ID */
  sessionId?: string;
  /** Query ID */
  queryId?: string;
  /** User */
  user?: string;
  /** Role */
  role?: string;
  /** Warehouse */
  warehouse?: string;
  /** Database */
  database?: string;
  /** Schema */
  schema?: string;
  /** SQL text (sanitized) */
  sqlText?: string;
  /** Duration in milliseconds */
  durationMs?: number;
  /** Rows affected */
  rowsAffected?: number;
  /** Error message */
  error?: string;
  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * Audit event handler.
 */
export type AuditEventHandler = (event: AuditEvent) => void | Promise<void>;

/**
 * Audit logger for tracking operations.
 */
export class AuditLogger {
  private readonly handlers: AuditEventHandler[] = [];
  private readonly events: AuditEvent[] = [];
  private readonly maxEvents: number;
  private enabled: boolean;
  private redactSql: boolean;

  constructor(options: { enabled?: boolean; maxEvents?: number; redactSql?: boolean } = {}) {
    this.enabled = options.enabled ?? true;
    this.maxEvents = options.maxEvents ?? 1000;
    this.redactSql = options.redactSql ?? false;
  }

  /**
   * Enables or disables audit logging.
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Checks if audit logging is enabled.
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Registers an event handler.
   */
  onEvent(handler: AuditEventHandler): void {
    this.handlers.push(handler);
  }

  /**
   * Removes an event handler.
   */
  offEvent(handler: AuditEventHandler): void {
    const index = this.handlers.indexOf(handler);
    if (index >= 0) {
      this.handlers.splice(index, 1);
    }
  }

  /**
   * Logs an audit event.
   */
  async log(event: Omit<AuditEvent, 'timestamp'>): Promise<void> {
    if (!this.enabled) return;

    const fullEvent: AuditEvent = {
      ...event,
      timestamp: new Date(),
      sqlText: this.redactSql ? this.redactSqlText(event.sqlText) : event.sqlText,
    };

    // Store event
    this.events.push(fullEvent);
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }

    // Notify handlers
    for (const handler of this.handlers) {
      try {
        await handler(fullEvent);
      } catch (error) {
        // Don't let handler errors break the audit logging
        console.error('Audit handler error:', error);
      }
    }
  }

  /**
   * Logs a connection opened event.
   */
  async logConnectionOpened(sessionId: string, user?: string): Promise<void> {
    await this.log({
      type: 'connection_opened',
      sessionId,
      user,
    });
  }

  /**
   * Logs a connection closed event.
   */
  async logConnectionClosed(sessionId: string): Promise<void> {
    await this.log({
      type: 'connection_closed',
      sessionId,
    });
  }

  /**
   * Logs a query execution event.
   */
  async logQueryExecuted(params: {
    sessionId?: string;
    queryId: string;
    sqlText: string;
    warehouse?: string;
    durationMs: number;
    rowsAffected?: number;
  }): Promise<void> {
    await this.log({
      type: 'query_executed',
      ...params,
    });
  }

  /**
   * Logs a query failure event.
   */
  async logQueryFailed(params: {
    sessionId?: string;
    queryId?: string;
    sqlText: string;
    error: string;
    durationMs?: number;
  }): Promise<void> {
    await this.log({
      type: 'query_failed',
      ...params,
    });
  }

  /**
   * Logs a data load event.
   */
  async logDataLoaded(params: {
    sessionId?: string;
    table: string;
    rowsAffected: number;
    durationMs: number;
  }): Promise<void> {
    await this.log({
      type: 'data_loaded',
      ...params,
      context: { table: params.table },
    });
  }

  /**
   * Logs an authentication event.
   */
  async logAuthentication(success: boolean, user?: string, error?: string): Promise<void> {
    await this.log({
      type: success ? 'authentication_success' : 'authentication_failure',
      user,
      error,
    });
  }

  /**
   * Gets recent audit events.
   */
  getEvents(options?: {
    type?: AuditEventType;
    since?: Date;
    limit?: number;
  }): AuditEvent[] {
    let result = [...this.events];

    if (options?.type) {
      result = result.filter((e) => e.type === options.type);
    }

    if (options?.since) {
      result = result.filter((e) => e.timestamp >= options.since!);
    }

    if (options?.limit) {
      result = result.slice(-options.limit);
    }

    return result;
  }

  /**
   * Clears all stored events.
   */
  clear(): void {
    this.events.length = 0;
  }

  /**
   * Redacts sensitive information from SQL.
   */
  private redactSqlText(sql?: string): string | undefined {
    if (!sql) return sql;

    // Redact string literals that might contain sensitive data
    return sql
      .replace(/'[^']*'/g, "'[REDACTED]'")
      .replace(/password\s*=\s*'[^']*'/gi, "password='[REDACTED]'")
      .replace(/token\s*=\s*'[^']*'/gi, "token='[REDACTED]'")
      .replace(/secret\s*=\s*'[^']*'/gi, "secret='[REDACTED]'")
      .replace(/key\s*=\s*'[^']*'/gi, "key='[REDACTED]'");
  }
}

// ============================================================================
// Credential Redaction
// ============================================================================

/**
 * Redacts sensitive fields from an object for logging.
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
  ];

  const result = { ...obj };

  for (const key of Object.keys(result)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveFields.some((f) => lowerKey.includes(f.toLowerCase()))) {
      (result as Record<string, unknown>)[key] = '[REDACTED]';
    } else if (typeof result[key] === 'object' && result[key] !== null) {
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
 */
export function getAuditLogger(options?: {
  enabled?: boolean;
  maxEvents?: number;
  redactSql?: boolean;
}): AuditLogger {
  if (!globalAuditLogger) {
    globalAuditLogger = new AuditLogger(options);
  }
  return globalAuditLogger;
}

/**
 * Resets the global audit logger.
 */
export function resetAuditLogger(): void {
  globalAuditLogger = undefined;
}

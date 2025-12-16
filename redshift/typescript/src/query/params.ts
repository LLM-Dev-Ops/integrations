/**
 * Query Parameter Binding for Amazon Redshift
 *
 * Handles parameter binding and type conversion for parameterized queries.
 * Converts JavaScript values to PostgreSQL/Redshift compatible formats.
 *
 * @module @llmdevops/redshift-integration/query/params
 */

// ============================================================================
// Parameter Value Types
// ============================================================================

/**
 * Typed parameter value that can be used in queries.
 */
export type ParameterValue =
  | { type: 'null' }
  | { type: 'boolean'; value: boolean }
  | { type: 'number'; value: number }
  | { type: 'bigint'; value: bigint }
  | { type: 'string'; value: string }
  | { type: 'binary'; value: Buffer | Uint8Array }
  | { type: 'date'; value: Date }
  | { type: 'timestamp'; value: Date }
  | { type: 'timestamptz'; value: Date }
  | { type: 'json'; value: unknown }
  | { type: 'array'; value: unknown[] };

// ============================================================================
// Value Conversion Functions
// ============================================================================

/**
 * Converts an unknown value to a typed ParameterValue.
 *
 * @param v - The value to convert
 * @returns Typed parameter value
 *
 * @example
 * ```typescript
 * toParameterValue(null) // { type: 'null' }
 * toParameterValue(42) // { type: 'number', value: 42 }
 * toParameterValue(new Date()) // { type: 'timestamptz', value: Date }
 * ```
 */
export function toParameterValue(v: unknown): ParameterValue {
  if (v === null || v === undefined) {
    return { type: 'null' };
  }
  if (typeof v === 'boolean') {
    return { type: 'boolean', value: v };
  }
  if (typeof v === 'number') {
    return { type: 'number', value: v };
  }
  if (typeof v === 'bigint') {
    return { type: 'bigint', value: v };
  }
  if (typeof v === 'string') {
    return { type: 'string', value: v };
  }
  if (v instanceof Buffer || v instanceof Uint8Array) {
    return { type: 'binary', value: v };
  }
  if (v instanceof Date) {
    // Default to timestamptz for timezone-aware timestamps
    return { type: 'timestamptz', value: v };
  }
  if (Array.isArray(v)) {
    return { type: 'array', value: v };
  }
  if (typeof v === 'object') {
    // JSON/SUPER type for objects
    return { type: 'json', value: v };
  }
  return { type: 'string', value: String(v) };
}

/**
 * Extracts the raw value from a ParameterValue.
 *
 * @param value - The parameter value
 * @returns Raw value suitable for pg driver
 */
export function extractParameterValue(value: ParameterValue): unknown {
  if (value.type === 'null') {
    return null;
  }
  if (value.type === 'bigint') {
    // Convert bigint to string for PostgreSQL
    return value.value.toString();
  }
  if (value.type === 'binary') {
    // Ensure Buffer for bytea type
    return Buffer.from(value.value);
  }
  if (value.type === 'json') {
    // Stringify objects for JSON/SUPER columns
    return JSON.stringify(value.value);
  }
  if (value.type === 'array') {
    // PostgreSQL array format
    return value.value;
  }
  return value.value;
}

// ============================================================================
// Parameter Binding
// ============================================================================

/**
 * Parameter binding configuration.
 * Supports both positional ($1, $2) and named (:param) parameter styles.
 */
export type ParameterBinding =
  | { type: 'positional'; values: ParameterValue[] }
  | { type: 'named'; values: Map<string, ParameterValue> };

/**
 * Creates a positional parameter binding.
 *
 * @param values - Initial parameter values
 * @returns Positional parameter binding
 */
export function createPositionalBinding(values: ParameterValue[] = []): ParameterBinding {
  return { type: 'positional', values };
}

/**
 * Creates a named parameter binding.
 *
 * @param values - Initial parameter values map
 * @returns Named parameter binding
 */
export function createNamedBinding(
  values: Map<string, ParameterValue> = new Map()
): ParameterBinding {
  return { type: 'named', values };
}

/**
 * Adds a positional parameter to the binding.
 *
 * @param binding - The parameter binding
 * @param value - The parameter value to add
 * @throws {Error} If binding is not positional
 */
export function addPositionalParam(binding: ParameterBinding, value: ParameterValue): void {
  if (binding.type !== 'positional') {
    throw new Error('Cannot add positional parameter to named binding');
  }
  binding.values.push(value);
}

/**
 * Adds a named parameter to the binding.
 *
 * @param binding - The parameter binding
 * @param name - The parameter name (without ':' prefix)
 * @param value - The parameter value to add
 * @throws {Error} If binding is not named
 */
export function addNamedParam(
  binding: ParameterBinding,
  name: string,
  value: ParameterValue
): void {
  if (binding.type !== 'named') {
    throw new Error('Cannot add named parameter to positional binding');
  }
  binding.values.set(name, value);
}

/**
 * Validates a parameter binding.
 *
 * @param binding - The parameter binding to validate
 * @throws {Error} If binding is invalid
 */
export function validateBinding(binding: ParameterBinding): void {
  if (binding.type === 'positional') {
    if (!Array.isArray(binding.values)) {
      throw new Error('Positional binding values must be an array');
    }
  } else {
    if (!(binding.values instanceof Map)) {
      throw new Error('Named binding values must be a Map');
    }
  }
}

/**
 * Converts parameter binding to format suitable for pg driver.
 *
 * @param binding - The parameter binding
 * @returns Array of parameter values for positional, or Record for named
 */
export function toDriverParams(binding: ParameterBinding): unknown[] | Record<string, unknown> {
  if (binding.type === 'positional') {
    return binding.values.map(extractParameterValue);
  }

  const result: Record<string, unknown> = {};
  for (const [name, value] of Array.from(binding.values.entries())) {
    result[name] = extractParameterValue(value);
  }
  return result;
}

/**
 * Creates parameter binding from raw values.
 *
 * @param values - Raw parameter values (array or object)
 * @returns Parameter binding
 */
export function fromRawValues(values: unknown[] | Record<string, unknown>): ParameterBinding {
  if (Array.isArray(values)) {
    return {
      type: 'positional',
      values: values.map(toParameterValue),
    };
  }

  const map = new Map<string, ParameterValue>();
  for (const [key, value] of Object.entries(values)) {
    map.set(key, toParameterValue(value));
  }
  return { type: 'named', values: map };
}

// ============================================================================
// ParameterBinder Class
// ============================================================================

/**
 * Parameter binder for converting JavaScript values to PostgreSQL/Redshift format.
 *
 * Provides type-aware conversion for all Redshift data types including:
 * - Primitives (null, boolean, number, bigint, string)
 * - Date/time types (DATE, TIMESTAMP, TIMESTAMPTZ)
 * - Binary data (BYTEA)
 * - Complex types (JSON/SUPER, arrays)
 *
 * @example
 * ```typescript
 * const binder = new ParameterBinder();
 *
 * // Positional parameters
 * const positional = binder.bindPositional([42, 'hello', new Date()]);
 * // Returns: [42, 'hello', Date]
 *
 * // Named parameters
 * const named = binder.bindNamed({ userId: 123, status: 'active' });
 * // Returns: { sql: '...', values: [123, 'active'] }
 * ```
 */
export class ParameterBinder {
  /**
   * Binds positional parameters and converts them to PostgreSQL format.
   *
   * Converts JavaScript values to appropriate PostgreSQL types:
   * - null/undefined → NULL
   * - boolean → TRUE/FALSE
   * - number → numeric literal
   * - bigint → string representation (for BIGINT columns)
   * - string → escaped string
   * - Date → timestamp with timezone
   * - Buffer/Uint8Array → bytea format
   * - object/array → JSON/SUPER type
   *
   * @param params - Array of parameter values
   * @returns Array of converted values suitable for pg driver
   *
   * @example
   * ```typescript
   * const binder = new ParameterBinder();
   * const params = binder.bindPositional([
   *   null,
   *   true,
   *   42,
   *   9007199254740991n,
   *   'hello',
   *   new Date(),
   *   Buffer.from([1, 2, 3]),
   *   { key: 'value' }
   * ]);
   * ```
   */
  bindPositional(params: unknown[]): unknown[] {
    return params.map((param) => {
      const value = toParameterValue(param);
      return extractParameterValue(value);
    });
  }

  /**
   * Binds named parameters and converts them to PostgreSQL format.
   *
   * Takes an object of named parameters and converts them to positional
   * parameters with a mapping. This is necessary because the pg driver
   * uses positional parameters ($1, $2, etc.).
   *
   * @param params - Object with named parameter values
   * @returns Object with converted SQL and parameter values
   *
   * @example
   * ```typescript
   * const binder = new ParameterBinder();
   * const result = binder.bindNamed({
   *   userId: 123,
   *   name: 'Alice',
   *   createdAt: new Date()
   * });
   * // Returns:
   * // {
   * //   sql: 'userId = $1 AND name = $2 AND createdAt = $3',
   * //   values: [123, 'Alice', Date]
   * // }
   * ```
   */
  bindNamed(params: Record<string, unknown>): { sql: string; values: unknown[] } {
    const values: unknown[] = [];
    const replacements: Record<string, string> = {};

    let position = 1;
    for (const [name, param] of Object.entries(params)) {
      const value = toParameterValue(param);
      values.push(extractParameterValue(value));
      replacements[name] = `$${position}`;
      position++;
    }

    // Generate SQL fragment with positional parameters
    const sql = Object.entries(replacements)
      .map(([name, placeholder]) => `${name} = ${placeholder}`)
      .join(' AND ');

    return { sql, values };
  }

  /**
   * Converts a JavaScript value to PostgreSQL literal format (for dynamic SQL).
   *
   * WARNING: This method should be used with caution as it doesn't provide
   * SQL injection protection. Use parameterized queries whenever possible.
   *
   * @param value - The value to convert
   * @returns PostgreSQL literal string
   *
   * @example
   * ```typescript
   * const binder = new ParameterBinder();
   * binder.toLiteral(null) // 'NULL'
   * binder.toLiteral(true) // 'TRUE'
   * binder.toLiteral(42) // '42'
   * binder.toLiteral('hello') // "'hello'"
   * binder.toLiteral(new Date('2024-01-01')) // "'2024-01-01T00:00:00.000Z'"
   * ```
   */
  toLiteral(value: unknown): string {
    if (value === null || value === undefined) {
      return 'NULL';
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    if (typeof value === 'number') {
      return value.toString();
    }
    if (typeof value === 'bigint') {
      return value.toString();
    }
    if (typeof value === 'string') {
      // Escape single quotes by doubling them
      return `'${value.replace(/'/g, "''")}'`;
    }
    if (value instanceof Date) {
      return `'${value.toISOString()}'`;
    }
    if (value instanceof Buffer || value instanceof Uint8Array) {
      // Bytea hex format
      const hex = Buffer.from(value).toString('hex');
      return `'\\x${hex}'::bytea`;
    }
    if (Array.isArray(value)) {
      // PostgreSQL array literal
      const items = value.map((v) => this.toLiteral(v)).join(',');
      return `ARRAY[${items}]`;
    }
    if (typeof value === 'object') {
      // JSON literal
      return `'${JSON.stringify(value).replace(/'/g, "''")}'::json`;
    }
    return `'${String(value).replace(/'/g, "''")}'`;
  }

  /**
   * Escapes an identifier (table name, column name, etc.) for safe use in SQL.
   *
   * @param identifier - The identifier to escape
   * @returns Quoted identifier
   *
   * @example
   * ```typescript
   * const binder = new ParameterBinder();
   * binder.escapeIdentifier('user_table') // '"user_table"'
   * binder.escapeIdentifier('my-table') // '"my-table"'
   * ```
   */
  escapeIdentifier(identifier: string): string {
    // Escape double quotes by doubling them
    return `"${identifier.replace(/"/g, '""')}"`;
  }
}

/**
 * Creates a new ParameterBinder instance.
 *
 * @returns New ParameterBinder
 */
export function createParameterBinder(): ParameterBinder {
  return new ParameterBinder();
}

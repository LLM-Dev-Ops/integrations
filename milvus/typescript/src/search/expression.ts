/**
 * Expression value type for filter building.
 */
export type ExprValue = string | number | bigint | boolean;

/**
 * Fluent builder for Milvus filter expressions.
 * Provides type-safe construction with value escaping.
 */
export class ExpressionBuilder {
  private parts: string[] = [];

  /**
   * Add equality condition.
   */
  eq(field: string, value: ExprValue): this {
    this.parts.push(`${escapeField(field)} == ${escapeValue(value)}`);
    return this;
  }

  /**
   * Add inequality condition.
   */
  ne(field: string, value: ExprValue): this {
    this.parts.push(`${escapeField(field)} != ${escapeValue(value)}`);
    return this;
  }

  /**
   * Add greater than condition.
   */
  gt(field: string, value: number | bigint): this {
    this.parts.push(`${escapeField(field)} > ${value}`);
    return this;
  }

  /**
   * Add greater than or equal condition.
   */
  gte(field: string, value: number | bigint): this {
    this.parts.push(`${escapeField(field)} >= ${value}`);
    return this;
  }

  /**
   * Add less than condition.
   */
  lt(field: string, value: number | bigint): this {
    this.parts.push(`${escapeField(field)} < ${value}`);
    return this;
  }

  /**
   * Add less than or equal condition.
   */
  lte(field: string, value: number | bigint): this {
    this.parts.push(`${escapeField(field)} <= ${value}`);
    return this;
  }

  /**
   * Add range condition (inclusive).
   */
  between(field: string, min: number | bigint, max: number | bigint): this {
    const escaped = escapeField(field);
    this.parts.push(`${escaped} >= ${min} and ${escaped} <= ${max}`);
    return this;
  }

  /**
   * Add IN condition.
   */
  in(field: string, values: ExprValue[]): this {
    const escaped = escapeField(field);
    const escapedValues = values.map((v) => escapeValue(v)).join(', ');
    this.parts.push(`${escaped} in [${escapedValues}]`);
    return this;
  }

  /**
   * Add NOT IN condition.
   */
  notIn(field: string, values: ExprValue[]): this {
    const escaped = escapeField(field);
    const escapedValues = values.map((v) => escapeValue(v)).join(', ');
    this.parts.push(`${escaped} not in [${escapedValues}]`);
    return this;
  }

  /**
   * Add LIKE condition for string matching.
   */
  like(field: string, pattern: string): this {
    this.parts.push(`${escapeField(field)} like ${escapeValue(pattern)}`);
    return this;
  }

  /**
   * Add prefix match condition.
   */
  startsWith(field: string, prefix: string): this {
    return this.like(field, `${prefix}%`);
  }

  /**
   * Add suffix match condition.
   */
  endsWith(field: string, suffix: string): this {
    return this.like(field, `%${suffix}`);
  }

  /**
   * Add contains match condition.
   */
  contains(field: string, substring: string): this {
    return this.like(field, `%${substring}%`);
  }

  /**
   * Add array contains condition.
   */
  arrayContains(field: string, value: ExprValue): this {
    this.parts.push(`array_contains(${escapeField(field)}, ${escapeValue(value)})`);
    return this;
  }

  /**
   * Add array length condition.
   */
  arrayLength(field: string, op: '==' | '!=' | '>' | '>=' | '<' | '<=', length: number): this {
    this.parts.push(`array_length(${escapeField(field)}) ${op} ${length}`);
    return this;
  }

  /**
   * Add JSON field access condition.
   */
  jsonField(field: string, jsonPath: string, op: string, value: ExprValue): this {
    this.parts.push(`${escapeField(field)}["${jsonPath}"] ${op} ${escapeValue(value)}`);
    return this;
  }

  /**
   * Add AND connector.
   */
  and(): this {
    if (this.parts.length > 0) {
      this.parts.push('and');
    }
    return this;
  }

  /**
   * Add OR connector.
   */
  or(): this {
    if (this.parts.length > 0) {
      this.parts.push('or');
    }
    return this;
  }

  /**
   * Wrap current expression in NOT.
   */
  not(): this {
    if (this.parts.length > 0) {
      const current = this.parts.join(' ');
      this.parts = [`not (${current})`];
    }
    return this;
  }

  /**
   * Group current expression in parentheses.
   */
  group(): this {
    if (this.parts.length > 0) {
      const current = this.parts.join(' ');
      this.parts = [`(${current})`];
    }
    return this;
  }

  /**
   * Add raw expression (use with caution).
   */
  raw(expression: string): this {
    this.parts.push(expression);
    return this;
  }

  /**
   * Build the final expression string.
   */
  build(): string {
    return this.parts.join(' ');
  }

  /**
   * Check if any conditions have been added.
   */
  isEmpty(): boolean {
    return this.parts.length === 0;
  }

  /**
   * Reset the builder.
   */
  reset(): this {
    this.parts = [];
    return this;
  }
}

/**
 * Escape a field name to prevent injection.
 */
function escapeField(field: string): string {
  // Only allow alphanumeric characters, underscores, and dots (for nested fields)
  if (!/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(field)) {
    throw new Error(`Invalid field name: ${field}`);
  }
  return field;
}

/**
 * Escape a value for safe inclusion in expressions.
 */
function escapeValue(value: ExprValue): string {
  if (typeof value === 'string') {
    // Escape backslashes and double quotes
    const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `"${escaped}"`;
  }
  if (typeof value === 'boolean') {
    return value.toString();
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  return value.toString();
}

/**
 * Create a new expression builder.
 */
export function createExpressionBuilder(): ExpressionBuilder {
  return new ExpressionBuilder();
}

/**
 * Build a simple equality filter.
 */
export function eq(field: string, value: ExprValue): string {
  return new ExpressionBuilder().eq(field, value).build();
}

/**
 * Build an IN filter.
 */
export function inFilter(field: string, values: ExprValue[]): string {
  return new ExpressionBuilder().in(field, values).build();
}

/**
 * Build a range filter.
 */
export function range(
  field: string,
  min: number | bigint,
  max: number | bigint
): string {
  return new ExpressionBuilder().between(field, min, max).build();
}

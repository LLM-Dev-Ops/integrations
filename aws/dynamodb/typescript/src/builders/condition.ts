/**
 * ConditionExpression Builder
 *
 * Fluent builder for constructing DynamoDB ConditionExpression strings
 * with proper expression attribute names and values.
 */

/**
 * Result of building a condition expression
 */
export interface ConditionExpression {
  /** The complete condition expression string */
  expression: string;
  /** Expression attribute names mapping (#attr -> actual attribute name) */
  names: Record<string, string>;
  /** Expression attribute values mapping (:val -> actual value) */
  values: Record<string, any>;
}

/**
 * Builder for DynamoDB ConditionExpression
 *
 * Provides a fluent interface for building condition expressions with
 * automatic handling of expression attribute names and values.
 *
 * @example
 * ```typescript
 * const condition = new ConditionBuilder()
 *   .attributeExists('email')
 *   .and(new ConditionBuilder().equals('status', 'active'))
 *   .build();
 * ```
 */
export class ConditionBuilder {
  private conditions: string[] = [];
  private names: Record<string, string> = {};
  private values: Record<string, any> = {};
  private counter = 0;
  private operator: 'AND' | 'OR' | null = null;

  /**
   * attribute_exists(path)
   *
   * Checks if an attribute exists.
   *
   * @param attribute - The attribute name to check
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.attributeExists('email');
   * // Generates: attribute_exists(#attr0)
   * ```
   */
  attributeExists(attribute: string): ConditionBuilder {
    const nameKey = `#attr${this.counter}`;
    this.counter++;
    this.conditions.push(`attribute_exists(${nameKey})`);
    this.names[nameKey] = attribute;
    return this;
  }

  /**
   * attribute_not_exists(path)
   *
   * Checks if an attribute does not exist.
   *
   * @param attribute - The attribute name to check
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.attributeNotExists('deletedAt');
   * // Generates: attribute_not_exists(#attr0)
   * ```
   */
  attributeNotExists(attribute: string): ConditionBuilder {
    const nameKey = `#attr${this.counter}`;
    this.counter++;
    this.conditions.push(`attribute_not_exists(${nameKey})`);
    this.names[nameKey] = attribute;
    return this;
  }

  /**
   * attribute = value
   *
   * Checks if an attribute equals a value.
   *
   * @param attribute - The attribute name
   * @param value - The value to compare
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.equals('status', 'active');
   * // Generates: #attr0 = :val0
   * ```
   */
  equals(attribute: string, value: any): ConditionBuilder {
    const nameKey = `#attr${this.counter}`;
    const valueKey = `:val${this.counter}`;
    this.counter++;
    this.conditions.push(`${nameKey} = ${valueKey}`);
    this.names[nameKey] = attribute;
    this.values[valueKey] = value;
    return this;
  }

  /**
   * attribute <> value
   *
   * Checks if an attribute does not equal a value.
   *
   * @param attribute - The attribute name
   * @param value - The value to compare
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.notEquals('status', 'deleted');
   * // Generates: #attr0 <> :val0
   * ```
   */
  notEquals(attribute: string, value: any): ConditionBuilder {
    const nameKey = `#attr${this.counter}`;
    const valueKey = `:val${this.counter}`;
    this.counter++;
    this.conditions.push(`${nameKey} <> ${valueKey}`);
    this.names[nameKey] = attribute;
    this.values[valueKey] = value;
    return this;
  }

  /**
   * attribute < value
   *
   * Checks if an attribute is less than a value.
   *
   * @param attribute - The attribute name
   * @param value - The value to compare
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.lessThan('age', 18);
   * // Generates: #attr0 < :val0
   * ```
   */
  lessThan(attribute: string, value: any): ConditionBuilder {
    const nameKey = `#attr${this.counter}`;
    const valueKey = `:val${this.counter}`;
    this.counter++;
    this.conditions.push(`${nameKey} < ${valueKey}`);
    this.names[nameKey] = attribute;
    this.values[valueKey] = value;
    return this;
  }

  /**
   * attribute <= value
   *
   * Checks if an attribute is less than or equal to a value.
   *
   * @param attribute - The attribute name
   * @param value - The value to compare
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.lessThanOrEqual('age', 18);
   * // Generates: #attr0 <= :val0
   * ```
   */
  lessThanOrEqual(attribute: string, value: any): ConditionBuilder {
    const nameKey = `#attr${this.counter}`;
    const valueKey = `:val${this.counter}`;
    this.counter++;
    this.conditions.push(`${nameKey} <= ${valueKey}`);
    this.names[nameKey] = attribute;
    this.values[valueKey] = value;
    return this;
  }

  /**
   * attribute > value
   *
   * Checks if an attribute is greater than a value.
   *
   * @param attribute - The attribute name
   * @param value - The value to compare
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.greaterThan('age', 65);
   * // Generates: #attr0 > :val0
   * ```
   */
  greaterThan(attribute: string, value: any): ConditionBuilder {
    const nameKey = `#attr${this.counter}`;
    const valueKey = `:val${this.counter}`;
    this.counter++;
    this.conditions.push(`${nameKey} > ${valueKey}`);
    this.names[nameKey] = attribute;
    this.values[valueKey] = value;
    return this;
  }

  /**
   * attribute >= value
   *
   * Checks if an attribute is greater than or equal to a value.
   *
   * @param attribute - The attribute name
   * @param value - The value to compare
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.greaterThanOrEqual('age', 65);
   * // Generates: #attr0 >= :val0
   * ```
   */
  greaterThanOrEqual(attribute: string, value: any): ConditionBuilder {
    const nameKey = `#attr${this.counter}`;
    const valueKey = `:val${this.counter}`;
    this.counter++;
    this.conditions.push(`${nameKey} >= ${valueKey}`);
    this.names[nameKey] = attribute;
    this.values[valueKey] = value;
    return this;
  }

  /**
   * attribute BETWEEN low AND high
   *
   * Checks if an attribute is between two values (inclusive).
   *
   * @param attribute - The attribute name
   * @param low - The lower bound (inclusive)
   * @param high - The upper bound (inclusive)
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.between('age', 18, 65);
   * // Generates: #attr0 BETWEEN :val0 AND :val1
   * ```
   */
  between(attribute: string, low: any, high: any): ConditionBuilder {
    const nameKey = `#attr${this.counter}`;
    const lowKey = `:val${this.counter}`;
    this.counter++;
    const highKey = `:val${this.counter}`;
    this.counter++;
    this.conditions.push(`${nameKey} BETWEEN ${lowKey} AND ${highKey}`);
    this.names[nameKey] = attribute;
    this.values[lowKey] = low;
    this.values[highKey] = high;
    return this;
  }

  /**
   * begins_with(attribute, substring)
   *
   * Checks if a string attribute begins with a substring.
   *
   * @param attribute - The attribute name
   * @param prefix - The prefix to check for
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.beginsWith('email', 'admin@');
   * // Generates: begins_with(#attr0, :val0)
   * ```
   */
  beginsWith(attribute: string, prefix: string): ConditionBuilder {
    const nameKey = `#attr${this.counter}`;
    const valueKey = `:val${this.counter}`;
    this.counter++;
    this.conditions.push(`begins_with(${nameKey}, ${valueKey})`);
    this.names[nameKey] = attribute;
    this.values[valueKey] = prefix;
    return this;
  }

  /**
   * contains(attribute, operand)
   *
   * Checks if a string contains a substring, or if a set contains an element.
   *
   * @param attribute - The attribute name
   * @param value - The substring or element to check for
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.contains('description', 'important');
   * // Generates: contains(#attr0, :val0)
   * ```
   */
  contains(attribute: string, value: string): ConditionBuilder {
    const nameKey = `#attr${this.counter}`;
    const valueKey = `:val${this.counter}`;
    this.counter++;
    this.conditions.push(`contains(${nameKey}, ${valueKey})`);
    this.names[nameKey] = attribute;
    this.values[valueKey] = value;
    return this;
  }

  /**
   * attribute_type(attribute, type)
   *
   * Checks if an attribute is of a specific type.
   *
   * @param attribute - The attribute name
   * @param type - The type to check ('S', 'N', 'B', 'SS', 'NS', 'BS', 'M', 'L', 'NULL', 'BOOL')
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.attributeType('data', 'M');
   * // Generates: attribute_type(#attr0, :val0)
   * ```
   */
  attributeType(attribute: string, type: string): ConditionBuilder {
    const nameKey = `#attr${this.counter}`;
    const valueKey = `:val${this.counter}`;
    this.counter++;
    this.conditions.push(`attribute_type(${nameKey}, ${valueKey})`);
    this.names[nameKey] = attribute;
    this.values[valueKey] = type;
    return this;
  }

  /**
   * size(attribute) comparator value
   *
   * Checks the size of an attribute (string length, number of elements in set, etc.).
   *
   * @param attribute - The attribute name
   * @param comparator - The comparison operator ('=', '<', '<=', '>', '>=', '<>')
   * @param value - The size value to compare
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.size('tags', '>', 0);
   * // Generates: size(#attr0) > :val0
   * ```
   */
  size(attribute: string, comparator: '=' | '<' | '<=' | '>' | '>=' | '<>', value: number): ConditionBuilder {
    const nameKey = `#attr${this.counter}`;
    const valueKey = `:val${this.counter}`;
    this.counter++;
    this.conditions.push(`size(${nameKey}) ${comparator} ${valueKey}`);
    this.names[nameKey] = attribute;
    this.values[valueKey] = value;
    return this;
  }

  /**
   * IN (value1, value2, ...)
   *
   * Checks if an attribute equals any value in a list.
   *
   * @param attribute - The attribute name
   * @param values - The list of values to check against
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.in('status', ['active', 'pending', 'processing']);
   * // Generates: #attr0 IN (:val0, :val1, :val2)
   * ```
   */
  in(attribute: string, values: any[]): ConditionBuilder {
    const nameKey = `#attr${this.counter}`;
    this.counter++;
    const valueKeys = values.map((val, idx) => {
      const key = `:val${this.counter}`;
      this.counter++;
      this.values[key] = val;
      return key;
    });
    this.conditions.push(`${nameKey} IN (${valueKeys.join(', ')})`);
    this.names[nameKey] = attribute;
    return this;
  }

  /**
   * Combine this condition with another using AND
   *
   * @param other - The other condition builder to combine with
   * @returns A new builder with the combined conditions
   *
   * @example
   * ```typescript
   * const condition = builder1.and(builder2);
   * // Generates: (condition1) AND (condition2)
   * ```
   */
  and(other: ConditionBuilder): ConditionBuilder {
    const combined = new ConditionBuilder();
    combined.counter = Math.max(this.counter, other.counter);

    // Merge names and values
    combined.names = { ...this.names, ...other.names };
    combined.values = { ...this.values, ...other.values };

    // Combine conditions with AND
    if (this.conditions.length > 0 && other.conditions.length > 0) {
      const thisExpr = this.conditions.length > 1
        ? `(${this.conditions.join(this.operator ? ` ${this.operator} ` : ' AND ')})`
        : this.conditions[0];
      const otherExpr = other.conditions.length > 1
        ? `(${other.conditions.join(other.operator ? ` ${other.operator} ` : ' AND ')})`
        : other.conditions[0];
      combined.conditions = [thisExpr, otherExpr];
      combined.operator = 'AND';
    } else if (this.conditions.length > 0) {
      combined.conditions = [...this.conditions];
      combined.operator = this.operator;
    } else {
      combined.conditions = [...other.conditions];
      combined.operator = other.operator;
    }

    return combined;
  }

  /**
   * Combine this condition with another using OR
   *
   * @param other - The other condition builder to combine with
   * @returns A new builder with the combined conditions
   *
   * @example
   * ```typescript
   * const condition = builder1.or(builder2);
   * // Generates: (condition1) OR (condition2)
   * ```
   */
  or(other: ConditionBuilder): ConditionBuilder {
    const combined = new ConditionBuilder();
    combined.counter = Math.max(this.counter, other.counter);

    // Merge names and values
    combined.names = { ...this.names, ...other.names };
    combined.values = { ...this.values, ...other.values };

    // Combine conditions with OR
    if (this.conditions.length > 0 && other.conditions.length > 0) {
      const thisExpr = this.conditions.length > 1
        ? `(${this.conditions.join(this.operator ? ` ${this.operator} ` : ' AND ')})`
        : this.conditions[0];
      const otherExpr = other.conditions.length > 1
        ? `(${other.conditions.join(other.operator ? ` ${other.operator} ` : ' AND ')})`
        : other.conditions[0];
      combined.conditions = [thisExpr, otherExpr];
      combined.operator = 'OR';
    } else if (this.conditions.length > 0) {
      combined.conditions = [...this.conditions];
      combined.operator = this.operator;
    } else {
      combined.conditions = [...other.conditions];
      combined.operator = other.operator;
    }

    return combined;
  }

  /**
   * Negate the condition with NOT
   *
   * @returns A new builder with the negated condition
   *
   * @example
   * ```typescript
   * const condition = builder.equals('status', 'active').not();
   * // Generates: NOT (#attr0 = :val0)
   * ```
   */
  not(): ConditionBuilder {
    const negated = new ConditionBuilder();
    negated.counter = this.counter;
    negated.names = { ...this.names };
    negated.values = { ...this.values };

    if (this.conditions.length > 0) {
      const expr = this.conditions.length > 1
        ? `(${this.conditions.join(this.operator ? ` ${this.operator} ` : ' AND ')})`
        : this.conditions[0];
      negated.conditions = [`NOT ${expr}`];
    }

    return negated;
  }

  /**
   * Build the complete condition expression
   *
   * Combines all added conditions into a complete ConditionExpression.
   *
   * @returns The complete condition expression with names and values
   * @throws {Error} If no conditions have been added
   *
   * @example
   * ```typescript
   * const { expression, names, values } = builder.build();
   * // expression: "#attr0 = :val0 AND attribute_exists(#attr1)"
   * // names: { "#attr0": "status", "#attr1": "email" }
   * // values: { ":val0": "active" }
   * ```
   */
  build(): ConditionExpression {
    if (this.conditions.length === 0) {
      throw new Error('No conditions specified');
    }

    const expression = this.conditions.join(this.operator ? ` ${this.operator} ` : ' AND ');

    return {
      expression,
      names: this.names,
      values: this.values,
    };
  }

  /**
   * Clear all conditions and start fresh
   *
   * @returns This builder for chaining
   */
  clear(): ConditionBuilder {
    this.conditions = [];
    this.names = {};
    this.values = {};
    this.counter = 0;
    this.operator = null;
    return this;
  }
}

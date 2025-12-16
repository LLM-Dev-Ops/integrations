/**
 * UpdateExpression Builder
 *
 * Fluent builder for constructing DynamoDB UpdateExpression strings
 * with proper expression attribute names and values.
 */

/**
 * Result of building an update expression
 */
export interface UpdateExpression {
  /** The complete update expression string */
  expression: string;
  /** Expression attribute names mapping (#attr -> actual attribute name) */
  names: Record<string, string>;
  /** Expression attribute values mapping (:val -> actual value) */
  values: Record<string, any>;
}

/**
 * Builder for DynamoDB UpdateExpression
 *
 * Provides a fluent interface for building update expressions with
 * automatic handling of expression attribute names and values.
 *
 * @example
 * ```typescript
 * const update = new UpdateExpressionBuilder()
 *   .set('name', 'John')
 *   .increment('viewCount', 1)
 *   .remove('deprecated')
 *   .build();
 * ```
 */
export class UpdateExpressionBuilder {
  private setExpressions: string[] = [];
  private removeExpressions: string[] = [];
  private addExpressions: string[] = [];
  private deleteExpressions: string[] = [];
  private names: Record<string, string> = {};
  private values: Record<string, any> = {};
  private counter = 0;

  /**
   * SET attribute = value
   *
   * Sets an attribute to a specific value.
   *
   * @param attribute - The attribute name to set
   * @param value - The value to set
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.set('name', 'John').set('age', 30);
   * // Generates: SET #attr0 = :val0, #attr1 = :val1
   * ```
   */
  set(attribute: string, value: any): UpdateExpressionBuilder {
    const nameKey = `#attr${this.counter}`;
    const valueKey = `:val${this.counter}`;
    this.counter++;
    this.setExpressions.push(`${nameKey} = ${valueKey}`);
    this.names[nameKey] = attribute;
    this.values[valueKey] = value;
    return this;
  }

  /**
   * SET attribute = if_not_exists(attribute, value)
   *
   * Sets an attribute to a value only if it doesn't exist.
   *
   * @param attribute - The attribute name
   * @param value - The default value if attribute doesn't exist
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.setIfNotExists('createdAt', Date.now());
   * // Generates: SET #attr0 = if_not_exists(#attr0, :val0)
   * ```
   */
  setIfNotExists(attribute: string, value: any): UpdateExpressionBuilder {
    const nameKey = `#attr${this.counter}`;
    const valueKey = `:val${this.counter}`;
    this.counter++;
    this.setExpressions.push(`${nameKey} = if_not_exists(${nameKey}, ${valueKey})`);
    this.names[nameKey] = attribute;
    this.values[valueKey] = value;
    return this;
  }

  /**
   * SET attribute = attribute + delta (increment)
   *
   * Increments a numeric attribute by the specified delta.
   * Can also be used to decrement by passing a negative delta.
   *
   * @param attribute - The attribute name to increment
   * @param delta - The amount to add (can be negative)
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.increment('viewCount', 1);
   * // Generates: SET #attr0 = #attr0 + :val0
   * ```
   */
  increment(attribute: string, delta: number): UpdateExpressionBuilder {
    const nameKey = `#attr${this.counter}`;
    const valueKey = `:val${this.counter}`;
    this.counter++;
    this.setExpressions.push(`${nameKey} = ${nameKey} + ${valueKey}`);
    this.names[nameKey] = attribute;
    this.values[valueKey] = delta;
    return this;
  }

  /**
   * SET attribute = if_not_exists(attribute, default) + delta
   *
   * Increments an attribute by delta, initializing it to defaultValue if it doesn't exist.
   * Useful for counters that may not be initialized.
   *
   * @param attribute - The attribute name to increment
   * @param delta - The amount to add
   * @param defaultValue - The initial value if attribute doesn't exist (default: 0)
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.incrementOrDefault('viewCount', 1, 0);
   * // Generates: SET #attr0 = if_not_exists(#attr0, :val0) + :val1
   * ```
   */
  incrementOrDefault(
    attribute: string,
    delta: number,
    defaultValue: number = 0
  ): UpdateExpressionBuilder {
    const nameKey = `#attr${this.counter}`;
    const defaultKey = `:val${this.counter}`;
    this.counter++;
    const deltaKey = `:val${this.counter}`;
    this.counter++;
    this.setExpressions.push(
      `${nameKey} = if_not_exists(${nameKey}, ${defaultKey}) + ${deltaKey}`
    );
    this.names[nameKey] = attribute;
    this.values[defaultKey] = defaultValue;
    this.values[deltaKey] = delta;
    return this;
  }

  /**
   * SET attribute = list_append(attribute, value) or list_append(value, attribute)
   *
   * Appends elements to a list attribute.
   *
   * @param attribute - The list attribute name
   * @param value - The value(s) to append (must be an array)
   * @param prepend - If true, prepends instead of appends
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.appendToList('tags', ['new-tag']);
   * // Generates: SET #attr0 = list_append(#attr0, :val0)
   * ```
   */
  appendToList(attribute: string, value: any[], prepend: boolean = false): UpdateExpressionBuilder {
    const nameKey = `#attr${this.counter}`;
    const valueKey = `:val${this.counter}`;
    this.counter++;
    if (prepend) {
      this.setExpressions.push(`${nameKey} = list_append(${valueKey}, ${nameKey})`);
    } else {
      this.setExpressions.push(`${nameKey} = list_append(${nameKey}, ${valueKey})`);
    }
    this.names[nameKey] = attribute;
    this.values[valueKey] = value;
    return this;
  }

  /**
   * REMOVE attribute
   *
   * Removes an attribute from the item.
   *
   * @param attribute - The attribute name to remove
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.remove('deprecated');
   * // Generates: REMOVE #attr0
   * ```
   */
  remove(attribute: string): UpdateExpressionBuilder {
    const nameKey = `#attr${this.counter}`;
    this.counter++;
    this.removeExpressions.push(nameKey);
    this.names[nameKey] = attribute;
    return this;
  }

  /**
   * ADD to numeric attribute or set
   *
   * For numbers: adds the value to the attribute (atomic increment).
   * For sets: adds elements to a string set or number set.
   *
   * @param attribute - The attribute name
   * @param values - The value(s) to add (Set for set attributes, number for numeric)
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.addToSet('tags', new Set(['tag1', 'tag2']));
   * // Generates: ADD #attr0 :val0
   * ```
   */
  addToSet(attribute: string, values: Set<string | number>): UpdateExpressionBuilder {
    const nameKey = `#attr${this.counter}`;
    const valueKey = `:val${this.counter}`;
    this.counter++;
    this.addExpressions.push(`${nameKey} ${valueKey}`);
    this.names[nameKey] = attribute;
    this.values[valueKey] = values;
    return this;
  }

  /**
   * ADD numeric value
   *
   * Atomically adds a numeric value to an attribute.
   * Similar to increment but uses ADD syntax.
   *
   * @param attribute - The attribute name
   * @param value - The numeric value to add
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.add('count', 5);
   * // Generates: ADD #attr0 :val0
   * ```
   */
  add(attribute: string, value: number): UpdateExpressionBuilder {
    const nameKey = `#attr${this.counter}`;
    const valueKey = `:val${this.counter}`;
    this.counter++;
    this.addExpressions.push(`${nameKey} ${valueKey}`);
    this.names[nameKey] = attribute;
    this.values[valueKey] = value;
    return this;
  }

  /**
   * DELETE from set
   *
   * Removes elements from a string set or number set.
   *
   * @param attribute - The set attribute name
   * @param values - The values to remove from the set
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.deleteFromSet('tags', new Set(['old-tag']));
   * // Generates: DELETE #attr0 :val0
   * ```
   */
  deleteFromSet(attribute: string, values: Set<string | number>): UpdateExpressionBuilder {
    const nameKey = `#attr${this.counter}`;
    const valueKey = `:val${this.counter}`;
    this.counter++;
    this.deleteExpressions.push(`${nameKey} ${valueKey}`);
    this.names[nameKey] = attribute;
    this.values[valueKey] = values;
    return this;
  }

  /**
   * Build the complete update expression
   *
   * Combines all added operations into a complete UpdateExpression.
   *
   * @returns The complete update expression with names and values
   * @throws {Error} If no update operations have been added
   *
   * @example
   * ```typescript
   * const { expression, names, values } = builder.build();
   * // expression: "SET #attr0 = :val0 REMOVE #attr1"
   * // names: { "#attr0": "name", "#attr1": "deprecated" }
   * // values: { ":val0": "John" }
   * ```
   */
  build(): UpdateExpression {
    const parts: string[] = [];

    if (this.setExpressions.length > 0) {
      parts.push(`SET ${this.setExpressions.join(', ')}`);
    }
    if (this.removeExpressions.length > 0) {
      parts.push(`REMOVE ${this.removeExpressions.join(', ')}`);
    }
    if (this.addExpressions.length > 0) {
      parts.push(`ADD ${this.addExpressions.join(', ')}`);
    }
    if (this.deleteExpressions.length > 0) {
      parts.push(`DELETE ${this.deleteExpressions.join(', ')}`);
    }

    if (parts.length === 0) {
      throw new Error('No update operations specified');
    }

    return {
      expression: parts.join(' '),
      names: this.names,
      values: this.values,
    };
  }

  /**
   * Clear all operations and start fresh
   *
   * @returns This builder for chaining
   */
  clear(): UpdateExpressionBuilder {
    this.setExpressions = [];
    this.removeExpressions = [];
    this.addExpressions = [];
    this.deleteExpressions = [];
    this.names = {};
    this.values = {};
    this.counter = 0;
    return this;
  }
}

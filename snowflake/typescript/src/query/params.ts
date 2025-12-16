/**
 * Parameter Binding Utilities
 *
 * Utilities for binding parameters to SQL queries.
 * @module @llmdevops/snowflake-integration/query/params
 */

import { Value, toValue } from '../types/index.js';

/**
 * Parameter binding type.
 */
export type ParameterBinding =
  | { type: 'positional'; values: Value[] }
  | { type: 'named'; values: Map<string, Value> };

/**
 * Creates a positional parameter binding.
 */
export function createPositionalBinding(values: Value[] = []): ParameterBinding {
  return { type: 'positional', values };
}

/**
 * Creates a named parameter binding.
 */
export function createNamedBinding(values: Map<string, Value> = new Map()): ParameterBinding {
  return { type: 'named', values };
}

/**
 * Adds a positional parameter value.
 */
export function addPositionalParam(binding: ParameterBinding, value: Value): void {
  if (binding.type !== 'positional') {
    throw new Error('Cannot add positional parameter to named binding');
  }
  binding.values.push(value);
}

/**
 * Adds a named parameter value.
 */
export function addNamedParam(binding: ParameterBinding, name: string, value: Value): void {
  if (binding.type !== 'named') {
    throw new Error('Cannot add named parameter to positional binding');
  }
  binding.values.set(name, value);
}

/**
 * Gets parameter value by index (positional) or name (named).
 */
export function getParameter(binding: ParameterBinding, key: string | number): Value | undefined {
  if (binding.type === 'positional' && typeof key === 'number') {
    return binding.values[key];
  }
  if (binding.type === 'named' && typeof key === 'string') {
    return binding.values.get(key);
  }
  return undefined;
}

/**
 * Gets all parameter values as an array (for positional) or object (for named).
 */
export function getParameterValues(binding: ParameterBinding): Value[] | Record<string, Value> {
  if (binding.type === 'positional') {
    return binding.values;
  }
  return Object.fromEntries(binding.values.entries());
}

/**
 * Converts parameters to a format suitable for the Snowflake SDK.
 */
export function toSdkBinds(binding: ParameterBinding): unknown[] | Record<string, unknown> {
  if (binding.type === 'positional') {
    return binding.values.map((v) => {
      if (v.type === 'null') return null;
      if (v.type === 'date' || v.type === 'timestamp') return v.value;
      if (v.type === 'binary') return Buffer.from(v.value);
      if (v.type === 'bigint') return v.value.toString();
      return v.value;
    });
  }

  const result: Record<string, unknown> = {};
  for (const [name, value] of Array.from(binding.values.entries())) {
    if (value.type === 'null') {
      result[name] = null;
    } else if (value.type === 'date' || value.type === 'timestamp') {
      result[name] = value.value;
    } else if (value.type === 'binary') {
      result[name] = Buffer.from(value.value);
    } else if (value.type === 'bigint') {
      result[name] = value.value.toString();
    } else {
      result[name] = value.value;
    }
  }
  return result;
}

/**
 * Validates parameter binding.
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
 * Helper to create a parameter binding from raw values.
 */
export function fromRawValues(values: unknown[] | Record<string, unknown>): ParameterBinding {
  if (Array.isArray(values)) {
    return {
      type: 'positional',
      values: values.map(toValue),
    };
  }

  const map = new Map<string, Value>();
  for (const [key, value] of Object.entries(values)) {
    map.set(key, toValue(value));
  }
  return { type: 'named', values: map };
}

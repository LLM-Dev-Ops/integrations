/**
 * Azure Cognitive Search - Metadata Filter Builder
 *
 * Converts platform MetadataFilter to Azure OData filter expressions.
 */

import type { MetadataFilter, FilterCondition, FilterOperator, FilterValue } from './types.js';

/**
 * Build OData filter expression from MetadataFilter
 */
export function buildMetadataFilter(filter: MetadataFilter | undefined, metadataField?: string): string | undefined {
  if (!filter || filter.conditions.length === 0) {
    return undefined;
  }

  const conditions = filter.conditions.map((c) => buildCondition(c, metadataField));
  const operator = filter.operator === 'or' ? ' or ' : ' and ';

  return conditions.join(operator);
}

/**
 * Build a single filter condition
 */
function buildCondition(condition: FilterCondition, metadataField?: string): string {
  const fieldPath = metadataField ? `${metadataField}/${condition.field}` : condition.field;
  const escapedValue = escapeValue(condition.value);

  switch (condition.operator) {
    case 'eq':
      return `${fieldPath} eq ${escapedValue}`;

    case 'ne':
      return `${fieldPath} ne ${escapedValue}`;

    case 'gt':
      return `${fieldPath} gt ${escapedValue}`;

    case 'lt':
      return `${fieldPath} lt ${escapedValue}`;

    case 'ge':
      return `${fieldPath} ge ${escapedValue}`;

    case 'le':
      return `${fieldPath} le ${escapedValue}`;

    case 'in':
      if (Array.isArray(condition.value)) {
        const values = condition.value.map((v) => escapeStringValue(String(v))).join(',');
        return `search.in(${fieldPath}, '${values}', ',')`;
      }
      return `${fieldPath} eq ${escapedValue}`;

    case 'contains':
      if (typeof condition.value === 'string') {
        return `search.ismatch('${escapeODataString(condition.value)}', '${fieldPath}')`;
      }
      return `${fieldPath} eq ${escapedValue}`;

    default:
      throw new Error(`Unsupported filter operator: ${condition.operator}`);
  }
}

/**
 * Escape a value for OData
 */
function escapeValue(value: FilterValue): string {
  if (typeof value === 'string') {
    return `'${escapeODataString(value)}'`;
  }

  if (typeof value === 'number') {
    return String(value);
  }

  if (typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    // For arrays, just return the first value for simple eq
    const first = value[0];
    if (first !== undefined) {
      return escapeValue(first);
    }
    return "''";
  }

  return String(value);
}

/**
 * Escape a string for OData string literal
 */
function escapeODataString(value: string): string {
  // Single quotes must be doubled in OData
  return value.replace(/'/g, "''");
}

/**
 * Escape a string value for search.in function
 */
function escapeStringValue(value: string): string {
  // For search.in, values are comma-separated, so escape commas
  return value.replace(/,/g, '\\,').replace(/'/g, "''");
}

/**
 * Helper class for building filters fluently
 */
export class FilterBuilder {
  private conditions: FilterCondition[] = [];
  private op: 'and' | 'or' = 'and';

  /** Set operator to AND */
  and(): this {
    this.op = 'and';
    return this;
  }

  /** Set operator to OR */
  or(): this {
    this.op = 'or';
    return this;
  }

  /** Add equals condition */
  eq(field: string, value: string | number | boolean): this {
    this.conditions.push({ field, operator: 'eq', value });
    return this;
  }

  /** Add not equals condition */
  ne(field: string, value: string | number | boolean): this {
    this.conditions.push({ field, operator: 'ne', value });
    return this;
  }

  /** Add greater than condition */
  gt(field: string, value: number): this {
    this.conditions.push({ field, operator: 'gt', value });
    return this;
  }

  /** Add less than condition */
  lt(field: string, value: number): this {
    this.conditions.push({ field, operator: 'lt', value });
    return this;
  }

  /** Add greater than or equal condition */
  ge(field: string, value: number): this {
    this.conditions.push({ field, operator: 'ge', value });
    return this;
  }

  /** Add less than or equal condition */
  le(field: string, value: number): this {
    this.conditions.push({ field, operator: 'le', value });
    return this;
  }

  /** Add in condition */
  in(field: string, values: string[] | number[]): this {
    this.conditions.push({ field, operator: 'in', value: values });
    return this;
  }

  /** Add contains condition */
  contains(field: string, value: string): this {
    this.conditions.push({ field, operator: 'contains', value });
    return this;
  }

  /** Build the MetadataFilter */
  build(): MetadataFilter {
    return {
      conditions: [...this.conditions],
      operator: this.op,
    };
  }

  /** Build directly to OData string */
  toOData(metadataField?: string): string | undefined {
    return buildMetadataFilter(this.build(), metadataField);
  }
}

/** Create a new filter builder */
export function filter(): FilterBuilder {
  return new FilterBuilder();
}

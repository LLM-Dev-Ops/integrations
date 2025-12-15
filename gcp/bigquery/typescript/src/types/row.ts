/**
 * Row and cell types for BigQuery query results.
 *
 * Following the SPARC specification for Google BigQuery integration.
 */

/**
 * Single cell value in a table row.
 */
export interface TableCell {
  /** Cell value (can be string, number, boolean, object, or null). */
  v: unknown;
}

/**
 * Table row containing an array of cell values.
 */
export interface TableRow {
  /** Array of cell values. */
  f: TableCell[];
}

/**
 * Parse a single cell value from BigQuery JSON response.
 */
export function parseTableCell(json: Record<string, unknown>): TableCell {
  return {
    v: json.v,
  };
}

/**
 * Parse a table row from BigQuery JSON response.
 */
export function parseTableRow(json: Record<string, unknown>): TableRow {
  const cells = (json.f as Record<string, unknown>[]) ?? [];
  return {
    f: cells.map(parseTableCell),
  };
}

/**
 * Serialize a table cell to BigQuery JSON format.
 */
export function serializeTableCell(cell: TableCell): Record<string, unknown> {
  return {
    v: cell.v,
  };
}

/**
 * Serialize a table row to BigQuery JSON format.
 */
export function serializeTableRow(row: TableRow): Record<string, unknown> {
  return {
    f: row.f.map(serializeTableCell),
  };
}

/**
 * Convert a table row to a typed object using schema field names.
 */
export function rowToObject(row: TableRow, fieldNames: string[]): Record<string, unknown> {
  const obj: Record<string, unknown> = {};

  for (let i = 0; i < Math.min(row.f.length, fieldNames.length); i++) {
    const fieldName = fieldNames[i];
    const cell = row.f[i];
    if (fieldName !== undefined && cell !== undefined) {
      obj[fieldName] = cell.v;
    }
  }

  return obj;
}

/**
 * Convert an object to a table row.
 */
export function objectToRow(obj: Record<string, unknown>, fieldNames: string[]): TableRow {
  return {
    f: fieldNames.map((name) => ({ v: obj[name] })),
  };
}

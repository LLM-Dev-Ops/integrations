/**
 * Snowflake Result Exporter
 *
 * Export query results to various formats (CSV, JSON, JSON Lines).
 * @module @llmdevops/snowflake-integration/result/export
 */

import type { ResultSet, Row, Value } from '../types/index.js';
import { extractValue } from '../types/index.js';
import { QueryError } from '../errors/index.js';
import type { ResultStream } from './stream.js';

// ============================================================================
// Export Options
// ============================================================================

/**
 * Options for CSV export.
 */
export interface CsvExportOptions {
  /** Include header row (default: true) */
  includeHeader?: boolean;
  /** Field delimiter (default: ',') */
  delimiter?: string;
  /** Field quote character (default: '"') */
  quote?: string;
  /** Line terminator (default: '\n') */
  lineTerminator?: string;
  /** Escape quote characters by doubling (default: true) */
  escapeQuotes?: boolean;
  /** Quote all fields (default: false) */
  quoteAll?: boolean;
  /** Date format function */
  dateFormat?: (date: Date) => string;
  /** Null value representation (default: '') */
  nullValue?: string;
}

/**
 * Options for JSON export.
 */
export interface JsonExportOptions {
  /** Pretty print with indentation (default: false) */
  pretty?: boolean;
  /** Indentation string (default: '  ') */
  indent?: string;
  /** Include column metadata (default: false) */
  includeMetadata?: boolean;
  /** Date format: 'iso' | 'epoch' | function (default: 'iso') */
  dateFormat?: 'iso' | 'epoch' | ((date: Date) => string | number);
}

/**
 * Options for JSON Lines export.
 */
export interface JsonLinesExportOptions {
  /** Line terminator (default: '\n') */
  lineTerminator?: string;
  /** Date format: 'iso' | 'epoch' | function (default: 'iso') */
  dateFormat?: 'iso' | 'epoch' | ((date: Date) => string | number);
}

/**
 * Options for streaming export.
 */
export interface StreamExportOptions {
  /** Chunk size for processing (default: 100) */
  chunkSize?: number;
  /** Callback for progress updates */
  onProgress?: (processed: number, total?: number) => void;
}

// ============================================================================
// Value Formatting Utilities
// ============================================================================

/**
 * Formats a value for CSV export.
 */
function formatCsvValue(
  value: Value,
  options: Required<Pick<CsvExportOptions, 'quote' | 'escapeQuotes' | 'quoteAll' | 'nullValue'>> & {
    dateFormat?: (date: Date) => string;
  }
): string {
  const rawValue = extractValue(value);

  // Handle null
  if (rawValue === null || rawValue === undefined) {
    return options.nullValue;
  }

  // Handle dates
  if (rawValue instanceof Date) {
    const formatted = options.dateFormat
      ? options.dateFormat(rawValue)
      : rawValue.toISOString();
    return options.quoteAll ? `${options.quote}${formatted}${options.quote}` : formatted;
  }

  // Handle binary
  if (rawValue instanceof Uint8Array) {
    const hex = Array.from(rawValue)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return options.quoteAll ? `${options.quote}${hex}${options.quote}` : hex;
  }

  // Convert to string
  let str: string;
  if (typeof rawValue === 'object') {
    str = JSON.stringify(rawValue);
  } else {
    str = String(rawValue);
  }

  // Check if quoting is needed
  const needsQuoting =
    options.quoteAll ||
    str.includes(options.quote) ||
    str.includes(',') ||
    str.includes('\n') ||
    str.includes('\r');

  if (!needsQuoting) {
    return str;
  }

  // Escape quotes
  if (options.escapeQuotes && str.includes(options.quote)) {
    str = str.replace(new RegExp(options.quote, 'g'), options.quote + options.quote);
  }

  return `${options.quote}${str}${options.quote}`;
}

/**
 * Formats a value for JSON export.
 */
function formatJsonValue(value: Value, dateFormat?: JsonExportOptions['dateFormat']): unknown {
  const rawValue = extractValue(value);

  // Handle null
  if (rawValue === null || rawValue === undefined) {
    return null;
  }

  // Handle dates
  if (rawValue instanceof Date) {
    if (dateFormat === 'epoch') {
      return rawValue.getTime();
    } else if (typeof dateFormat === 'function') {
      return dateFormat(rawValue);
    } else {
      return rawValue.toISOString();
    }
  }

  // Handle binary
  if (rawValue instanceof Uint8Array) {
    return Array.from(rawValue)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  // Return other values as-is
  return rawValue;
}

// ============================================================================
// CSV Export
// ============================================================================

/**
 * Exports a ResultSet to CSV format.
 */
export function toCsv(result: ResultSet, options: CsvExportOptions = {}): string {
  const opts = {
    includeHeader: options.includeHeader ?? true,
    delimiter: options.delimiter ?? ',',
    quote: options.quote ?? '"',
    lineTerminator: options.lineTerminator ?? '\n',
    escapeQuotes: options.escapeQuotes ?? true,
    quoteAll: options.quoteAll ?? false,
    dateFormat: options.dateFormat ?? ((date: Date) => date.toISOString()),
    nullValue: options.nullValue ?? '',
  };

  const lines: string[] = [];

  // Add header row
  if (opts.includeHeader) {
    const header = result.columns
      .map((col) =>
        formatCsvValue(
          { type: 'string', value: col.name },
          {
            quote: opts.quote,
            escapeQuotes: opts.escapeQuotes,
            quoteAll: opts.quoteAll,
            nullValue: opts.nullValue,
          }
        )
      )
      .join(opts.delimiter);
    lines.push(header);
  }

  // Add data rows
  for (const row of result.rows) {
    const csvRow = row.values
      .map((value) =>
        formatCsvValue(value, {
          quote: opts.quote,
          escapeQuotes: opts.escapeQuotes,
          quoteAll: opts.quoteAll,
          dateFormat: opts.dateFormat,
          nullValue: opts.nullValue,
        })
      )
      .join(opts.delimiter);
    lines.push(csvRow);
  }

  return lines.join(opts.lineTerminator);
}

/**
 * Exports a ResultStream to CSV format.
 */
export async function toCsvStream(
  stream: ResultStream,
  options: CsvExportOptions & StreamExportOptions = {}
): Promise<string> {
  const opts = {
    includeHeader: options.includeHeader ?? true,
    delimiter: options.delimiter ?? ',',
    quote: options.quote ?? '"',
    lineTerminator: options.lineTerminator ?? '\n',
    escapeQuotes: options.escapeQuotes ?? true,
    quoteAll: options.quoteAll ?? false,
    dateFormat: options.dateFormat ?? ((date: Date) => date.toISOString()),
    nullValue: options.nullValue ?? '',
  };

  const lines: string[] = [];
  let processedRows = 0;

  // We need to get the first row to know the columns
  const firstResult = await stream.next();
  if (firstResult.done) {
    return ''; // Empty result
  }

  const firstRow = firstResult.value;

  // Add header row if columns are available
  if (opts.includeHeader && firstRow.values.length > 0) {
    // Extract column names from the row
    // Note: We would need columns metadata from the stream
    // For now, we'll use generic column names
    const columnCount = firstRow.values.length;
    const header = Array.from({ length: columnCount }, (_, i) => `column${i + 1}`).join(
      opts.delimiter
    );
    lines.push(header);
  }

  // Add first row
  const firstCsvRow = firstRow.values
    .map((value) =>
      formatCsvValue(value, {
        quote: opts.quote,
        escapeQuotes: opts.escapeQuotes,
        quoteAll: opts.quoteAll,
        dateFormat: opts.dateFormat,
        nullValue: opts.nullValue,
      })
    )
    .join(opts.delimiter);
  lines.push(firstCsvRow);
  processedRows++;

  // Process remaining rows
  for await (const row of stream) {
    const csvRow = row.values
      .map((value) =>
        formatCsvValue(value, {
          quote: opts.quote,
          escapeQuotes: opts.escapeQuotes,
          quoteAll: opts.quoteAll,
          dateFormat: opts.dateFormat,
          nullValue: opts.nullValue,
        })
      )
      .join(opts.delimiter);
    lines.push(csvRow);
    processedRows++;

    if (options.onProgress && processedRows % (options.chunkSize ?? 100) === 0) {
      options.onProgress(processedRows);
    }
  }

  if (options.onProgress) {
    options.onProgress(processedRows);
  }

  return lines.join(opts.lineTerminator);
}

// ============================================================================
// JSON Export
// ============================================================================

/**
 * Exports a ResultSet to JSON format.
 */
export function toJson(result: ResultSet, options: JsonExportOptions = {}): string {
  const opts: Required<JsonExportOptions> = {
    pretty: options.pretty ?? false,
    indent: options.indent ?? '  ',
    includeMetadata: options.includeMetadata ?? false,
    dateFormat: options.dateFormat ?? 'iso',
  };

  // Convert rows to objects
  const data = result.rows.map((row) => {
    const obj: Record<string, unknown> = {};
    for (let i = 0; i < result.columns.length; i++) {
      const col = result.columns[i]!;
      const value = row.values[i] ?? { type: 'null' } as Value;
      obj[col.name] = formatJsonValue(value, opts.dateFormat);
    }
    return obj;
  });

  // Create output structure
  const output: {
    data: Record<string, unknown>[];
    metadata?: {
      columns: typeof result.columns;
      rowCount: number;
      hasMore: boolean;
    };
  } = { data };

  if (opts.includeMetadata) {
    output.metadata = {
      columns: result.columns,
      rowCount: result.rowCount,
      hasMore: result.hasMore,
    };
  }

  // Serialize
  if (opts.pretty) {
    return JSON.stringify(output, null, opts.indent);
  } else {
    return JSON.stringify(output);
  }
}

/**
 * Exports a ResultStream to JSON format.
 */
export async function toJsonStream(
  stream: ResultStream,
  options: JsonExportOptions & StreamExportOptions = {}
): Promise<string> {
  const rows = await stream.toArray();
  const resultSet = await stream.toResultSet();
  return toJson(resultSet, options);
}

// ============================================================================
// JSON Lines Export
// ============================================================================

/**
 * Exports a ResultSet to JSON Lines format (newline-delimited JSON).
 */
export function toJsonLines(result: ResultSet, options: JsonLinesExportOptions = {}): string {
  const opts: Required<JsonLinesExportOptions> = {
    lineTerminator: options.lineTerminator ?? '\n',
    dateFormat: options.dateFormat ?? 'iso',
  };

  const lines: string[] = [];

  for (const row of result.rows) {
    const obj: Record<string, unknown> = {};
    for (let i = 0; i < result.columns.length; i++) {
      const col = result.columns[i]!;
      const value = row.values[i] ?? { type: 'null' } as Value;
      obj[col.name] = formatJsonValue(value, opts.dateFormat);
    }
    lines.push(JSON.stringify(obj));
  }

  return lines.join(opts.lineTerminator);
}

/**
 * Exports a ResultStream to JSON Lines format.
 */
export async function toJsonLinesStream(
  stream: ResultStream,
  options: JsonLinesExportOptions & StreamExportOptions = {}
): Promise<string> {
  const opts: Required<JsonLinesExportOptions> = {
    lineTerminator: options.lineTerminator ?? '\n',
    dateFormat: options.dateFormat ?? 'iso',
  };

  const lines: string[] = [];
  let processedRows = 0;

  for await (const row of stream) {
    const obj: Record<string, unknown> = {};
    // Note: We don't have column metadata in the stream iterator
    // This is a limitation - ideally the stream should provide columns
    for (let i = 0; i < row.values.length; i++) {
      const value = row.values[i] ?? { type: 'null' } as Value;
      obj[`column${i + 1}`] = formatJsonValue(value, opts.dateFormat);
    }
    lines.push(JSON.stringify(obj));
    processedRows++;

    if (options.onProgress && processedRows % (options.chunkSize ?? 100) === 0) {
      options.onProgress(processedRows);
    }
  }

  if (options.onProgress) {
    options.onProgress(processedRows);
  }

  return lines.join(opts.lineTerminator);
}

// ============================================================================
// Export Utilities
// ============================================================================

/**
 * Result exporter with multiple format support.
 */
export class ResultExporter {
  constructor(private readonly result: ResultSet) {}

  /**
   * Exports to CSV format.
   */
  toCsv(options?: CsvExportOptions): string {
    return toCsv(this.result, options);
  }

  /**
   * Exports to JSON format.
   */
  toJson(options?: JsonExportOptions): string {
    return toJson(this.result, options);
  }

  /**
   * Exports to JSON Lines format.
   */
  toJsonLines(options?: JsonLinesExportOptions): string {
    return toJsonLines(this.result, options);
  }

  /**
   * Exports to the specified format.
   */
  export(format: 'csv' | 'json' | 'jsonlines', options?: Record<string, unknown>): string {
    switch (format) {
      case 'csv':
        return this.toCsv(options as CsvExportOptions);
      case 'json':
        return this.toJson(options as JsonExportOptions);
      case 'jsonlines':
        return this.toJsonLines(options as JsonLinesExportOptions);
      default:
        throw new QueryError(`Unsupported export format: ${format}`, {
          cause: new Error('Valid formats: csv, json, jsonlines'),
        });
    }
  }
}

/**
 * Creates a ResultExporter for the given result set.
 */
export function createExporter(result: ResultSet): ResultExporter {
  return new ResultExporter(result);
}

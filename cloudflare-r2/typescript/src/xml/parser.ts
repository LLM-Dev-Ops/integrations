/**
 * Core XML parsing utilities for S3/R2 API responses
 * @module @studiorack/cloudflare-r2/xml/parser
 */

import { XMLParser, XMLBuilder } from 'fast-xml-parser';

/**
 * Parser options optimized for S3/R2 XML format
 */
const PARSER_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  ignoreDeclaration: true,
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
  cdataPropName: '__cdata',
  allowBooleanAttributes: true,
  updateTag: undefined,
};

/**
 * Builder options for generating S3/R2 XML requests
 */
const BUILDER_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  format: false,
  suppressEmptyNode: true,
  suppressBooleanAttributes: false,
};

/**
 * Creates a configured XML parser instance for S3/R2 responses
 *
 * @returns Configured XMLParser instance
 *
 * @example
 * ```typescript
 * const parser = createXmlParser();
 * const result = parser.parse(xmlString);
 * ```
 */
export function createXmlParser(): XMLParser {
  return new XMLParser(PARSER_OPTIONS);
}

/**
 * Creates a configured XML builder instance for S3/R2 requests
 *
 * @returns Configured XMLBuilder instance
 *
 * @example
 * ```typescript
 * const builder = createXmlBuilder();
 * const xml = builder.build(object);
 * ```
 */
export function createXmlBuilder(): XMLBuilder {
  return new XMLBuilder(BUILDER_OPTIONS);
}

/**
 * Parses XML string into a typed object
 *
 * @param xml - XML string to parse
 * @returns Parsed object of type T
 * @throws Error if XML is invalid
 *
 * @example
 * ```typescript
 * interface MyResponse {
 *   Root: {
 *     Value: string;
 *   };
 * }
 *
 * const result = parseXml<MyResponse>(xmlString);
 * console.log(result.Root.Value);
 * ```
 */
export function parseXml<T>(xml: string): T {
  const parser = createXmlParser();
  try {
    return parser.parse(xml) as T;
  } catch (error) {
    throw new Error(
      `Failed to parse XML: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Converts an object to XML string
 *
 * @param obj - Object to convert to XML
 * @returns XML string representation
 *
 * @example
 * ```typescript
 * const obj = {
 *   Root: {
 *     Value: 'example'
 *   }
 * };
 *
 * const xml = buildXml(obj);
 * console.log(xml); // <Root><Value>example</Value></Root>
 * ```
 */
export function buildXml(obj: Record<string, unknown>): string {
  const builder = createXmlBuilder();
  try {
    return builder.build(obj);
  } catch (error) {
    throw new Error(
      `Failed to build XML: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Normalizes array-or-single-item XML parsing behavior
 * S3/R2 returns single objects when there's only one item, arrays when multiple
 *
 * @param value - Value that may be single item or array
 * @returns Always returns an array
 *
 * @example
 * ```typescript
 * normalizeArray(undefined); // []
 * normalizeArray('single'); // ['single']
 * normalizeArray(['a', 'b']); // ['a', 'b']
 * ```
 */
export function normalizeArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

/**
 * Removes surrounding quotes from ETag values
 * S3/R2 returns ETags wrapped in quotes
 *
 * @param eTag - ETag value (may include quotes)
 * @returns ETag without quotes
 *
 * @example
 * ```typescript
 * cleanETag('"abc123"'); // 'abc123'
 * cleanETag('abc123'); // 'abc123'
 * ```
 */
export function cleanETag(eTag: string): string {
  return eTag.replace(/^"(.+)"$/, '$1');
}

/**
 * Parses ISO 8601 date string to Date object
 *
 * @param dateStr - ISO 8601 date string
 * @returns Date object
 * @throws Error if date string is invalid
 *
 * @example
 * ```typescript
 * parseDate('2024-01-15T10:30:00.000Z'); // Date object
 * ```
 */
export function parseDate(dateStr: string): Date {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date string: ${dateStr}`);
  }
  return date;
}

/**
 * Safely parses an integer from a string
 *
 * @param value - String to parse
 * @param defaultValue - Default value if parsing fails
 * @returns Parsed integer or default value
 *
 * @example
 * ```typescript
 * parseInt('123', 0); // 123
 * parseInt('invalid', 0); // 0
 * parseInt('', 10); // 10
 * ```
 */
export function parseIntSafe(value: string | undefined, defaultValue: number): number {
  if (!value) {
    return defaultValue;
  }
  const parsed = Number.parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Safely parses a boolean from a string
 * S3/R2 uses 'true'/'false' strings
 *
 * @param value - String to parse ('true' or 'false')
 * @param defaultValue - Default value if parsing fails
 * @returns Parsed boolean or default value
 *
 * @example
 * ```typescript
 * parseBooleanSafe('true', false); // true
 * parseBooleanSafe('false', true); // false
 * parseBooleanSafe('invalid', false); // false
 * ```
 */
export function parseBooleanSafe(value: string | undefined, defaultValue: boolean): boolean {
  if (!value) {
    return defaultValue;
  }
  return value.toLowerCase() === 'true';
}

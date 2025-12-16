/**
 * XML parsing and building utilities for Cloudflare R2 Storage Integration
 *
 * This module provides utilities for parsing S3/R2 XML responses and building
 * XML request bodies. R2 uses S3-compatible XML format for its API.
 *
 * @module @studiorack/cloudflare-r2/xml
 *
 * @example
 * ```typescript
 * import {
 *   parseListObjectsResponse,
 *   parseErrorResponse,
 *   buildDeleteObjectsXml
 * } from '@studiorack/cloudflare-r2/xml';
 *
 * // Parse a listing response
 * const listResult = parseListObjectsResponse(xmlString);
 * console.log(listResult.contents);
 *
 * // Check for errors
 * if (isErrorResponse(xmlString)) {
 *   const error = parseErrorResponse(xmlString);
 *   console.error(error.code, error.message);
 * }
 *
 * // Build delete request
 * const deleteXml = buildDeleteObjectsXml([
 *   { key: 'file1.txt' },
 *   { key: 'file2.txt' }
 * ]);
 * ```
 */

// Core parser utilities
export {
  createXmlParser,
  createXmlBuilder,
  parseXml,
  buildXml,
  normalizeArray,
  cleanETag,
  parseDate,
  parseIntSafe,
  parseBooleanSafe,
} from './parser.js';

// List objects parsing
export { parseListObjectsResponse } from './list-objects.js';

// Error parsing
export {
  parseErrorResponse,
  isErrorResponse,
  formatErrorMessage,
  type ParsedError,
} from './error.js';

// Multipart upload parsing
export {
  parseInitiateMultipartResponse,
  parseCompleteMultipartResponse,
  parseListPartsResponse,
} from './multipart.js';

// Copy object parsing
export { parseCopyObjectResponse } from './copy.js';

// Delete objects parsing
export { parseDeleteObjectsResponse } from './delete.js';

// XML builders
export {
  buildDeleteObjectsXml,
  buildCompleteMultipartXml,
  buildTaggingXml,
  buildLifecycleConfigurationXml,
  escapeXml,
  validateObjectKey,
} from './builders.js';

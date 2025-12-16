/**
 * XML parsing for copy object operations
 * @module @studiorack/cloudflare-r2/xml/copy
 */

import type { CopyObjectOutput } from '../types/index.js';
import { parseXml, cleanETag, parseDate } from './parser.js';

/**
 * CopyObjectResult XML structure
 */
interface CopyObjectResultXml {
  CopyObjectResult: {
    ETag: string;
    LastModified: string;
  };
}

/**
 * Parses CopyObject XML response
 *
 * The CopyObject operation returns a minimal XML response containing
 * only the ETag and LastModified timestamp of the copied object.
 *
 * @param xml - Raw XML response from CopyObject API
 * @returns Parsed CopyObjectOutput with ETag and timestamp
 * @throws Error if XML is malformed or missing required fields
 *
 * @example
 * ```typescript
 * const xml = `
 *   <CopyObjectResult>
 *     <ETag>"abc123def456"</ETag>
 *     <LastModified>2024-01-15T10:30:00.000Z</LastModified>
 *   </CopyObjectResult>
 * `;
 *
 * const result = parseCopyObjectResponse(xml);
 * console.log(result.eTag); // 'abc123def456' (quotes removed)
 * console.log(result.lastModified); // Date object
 * ```
 */
export function parseCopyObjectResponse(xml: string): CopyObjectOutput {
  try {
    const parsed = parseXml<CopyObjectResultXml>(xml);

    if (!parsed.CopyObjectResult) {
      throw new Error('Invalid CopyObject response: missing CopyObjectResult element');
    }

    const result = parsed.CopyObjectResult;

    if (!result.ETag) {
      throw new Error('Invalid CopyObject response: missing ETag element');
    }

    if (!result.LastModified) {
      throw new Error('Invalid CopyObject response: missing LastModified element');
    }

    return {
      eTag: cleanETag(result.ETag),
      lastModified: parseDate(result.LastModified),
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to parse CopyObject response: ${error.message}`);
    }
    throw error;
  }
}

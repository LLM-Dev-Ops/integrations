/**
 * XML parsing for ListObjectsV2 responses
 * @module @studiorack/cloudflare-r2/xml/list-objects
 */

import type { ListObjectsOutput, R2Object, CommonPrefix } from '../types/index.js';
import {
  parseXml,
  normalizeArray,
  cleanETag,
  parseDate,
  parseIntSafe,
  parseBooleanSafe,
} from './parser.js';

/**
 * S3/R2 ListBucketResult XML structure
 */
interface ListBucketResultXml {
  ListBucketResult: {
    IsTruncated: string;
    Contents?: XmlContents | XmlContents[];
    CommonPrefixes?: XmlCommonPrefix | XmlCommonPrefix[];
    Name: string;
    Prefix?: string;
    Delimiter?: string;
    MaxKeys: string;
    KeyCount: string;
    ContinuationToken?: string;
    NextContinuationToken?: string;
  };
}

/**
 * XML structure for an object in Contents
 */
interface XmlContents {
  Key: string;
  LastModified: string;
  ETag: string;
  Size: string;
  StorageClass?: string;
  Owner?: {
    ID: string;
    DisplayName?: string;
  };
}

/**
 * XML structure for a common prefix
 */
interface XmlCommonPrefix {
  Prefix: string;
}

/**
 * Converts XML Contents element to R2Object
 *
 * @param xmlContents - Raw XML contents element
 * @returns Parsed R2Object
 */
function parseContents(xmlContents: XmlContents): R2Object {
  return {
    key: xmlContents.Key,
    lastModified: parseDate(xmlContents.LastModified),
    eTag: cleanETag(xmlContents.ETag),
    size: parseIntSafe(xmlContents.Size, 0),
    storageClass: (xmlContents.StorageClass || 'STANDARD') as 'STANDARD' | 'INFREQUENT_ACCESS',
    ...(xmlContents.Owner && {
      owner: {
        id: xmlContents.Owner.ID,
        ...(xmlContents.Owner.DisplayName && {
          displayName: xmlContents.Owner.DisplayName,
        }),
      },
    }),
  };
}

/**
 * Converts XML CommonPrefixes element to CommonPrefix
 *
 * @param xmlPrefix - Raw XML common prefix element
 * @returns Parsed CommonPrefix
 */
function parseCommonPrefix(xmlPrefix: XmlCommonPrefix): CommonPrefix {
  return {
    prefix: xmlPrefix.Prefix,
  };
}

/**
 * Parses S3/R2 ListObjectsV2 XML response into structured output
 *
 * Handles edge cases:
 * - Single vs multiple Contents (S3 returns object instead of array for single item)
 * - Single vs multiple CommonPrefixes
 * - Missing optional fields
 * - Empty results
 *
 * @param xml - Raw XML response string from ListObjectsV2 API
 * @returns Parsed ListObjectsOutput with typed objects
 * @throws Error if XML is malformed or missing required fields
 *
 * @example
 * ```typescript
 * const xml = `
 *   <ListBucketResult>
 *     <Name>my-bucket</Name>
 *     <IsTruncated>false</IsTruncated>
 *     <MaxKeys>1000</MaxKeys>
 *     <KeyCount>2</KeyCount>
 *     <Contents>
 *       <Key>file1.txt</Key>
 *       <LastModified>2024-01-15T10:30:00.000Z</LastModified>
 *       <ETag>"abc123"</ETag>
 *       <Size>1024</Size>
 *       <StorageClass>STANDARD</StorageClass>
 *     </Contents>
 *   </ListBucketResult>
 * `;
 *
 * const result = parseListObjectsResponse(xml);
 * console.log(result.contents.length); // 1
 * console.log(result.contents[0].key); // 'file1.txt'
 * ```
 */
export function parseListObjectsResponse(xml: string): ListObjectsOutput {
  try {
    const parsed = parseXml<ListBucketResultXml>(xml);

    if (!parsed.ListBucketResult) {
      throw new Error('Invalid ListObjectsV2 response: missing ListBucketResult element');
    }

    const result = parsed.ListBucketResult;

    // Normalize Contents (may be single object or array)
    const contentsArray = normalizeArray(result.Contents);
    const contents = contentsArray.map(parseContents);

    // Normalize CommonPrefixes (may be single object or array)
    const commonPrefixesArray = normalizeArray(result.CommonPrefixes);
    const commonPrefixes = commonPrefixesArray.map(parseCommonPrefix);

    return {
      isTruncated: parseBooleanSafe(result.IsTruncated, false),
      contents,
      commonPrefixes,
      name: result.Name,
      prefix: result.Prefix,
      delimiter: result.Delimiter,
      maxKeys: parseIntSafe(result.MaxKeys, 1000),
      keyCount: parseIntSafe(result.KeyCount, 0),
      continuationToken: result.ContinuationToken,
      nextContinuationToken: result.NextContinuationToken,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to parse ListObjectsV2 response: ${error.message}`);
    }
    throw error;
  }
}

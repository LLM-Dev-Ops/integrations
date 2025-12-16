/**
 * XML parsing for multipart upload operations
 * @module @studiorack/cloudflare-r2/xml/multipart
 */

import type {
  CreateMultipartOutput,
  CompleteMultipartOutput,
  ListPartsOutput,
  Part,
} from '../types/index.js';
import {
  parseXml,
  normalizeArray,
  cleanETag,
  parseDate,
  parseIntSafe,
  parseBooleanSafe,
} from './parser.js';

/**
 * InitiateMultipartUploadResult XML structure
 */
interface InitiateMultipartXml {
  InitiateMultipartUploadResult: {
    Bucket: string;
    Key: string;
    UploadId: string;
  };
}

/**
 * CompleteMultipartUploadResult XML structure
 */
interface CompleteMultipartXml {
  CompleteMultipartUploadResult: {
    Location: string;
    Bucket: string;
    Key: string;
    ETag: string;
  };
}

/**
 * ListPartsResult XML structure
 */
interface ListPartsXml {
  ListPartsResult: {
    Bucket: string;
    Key: string;
    UploadId: string;
    IsTruncated: string;
    PartNumberMarker?: string;
    NextPartNumberMarker?: string;
    MaxParts?: string;
    Part?: XmlPart | XmlPart[];
    Initiator?: {
      ID: string;
      DisplayName?: string;
    };
    Owner?: {
      ID: string;
      DisplayName?: string;
    };
    StorageClass?: string;
  };
}

/**
 * XML structure for an uploaded part
 */
interface XmlPart {
  PartNumber: string;
  ETag: string;
  Size: string;
  LastModified: string;
}

/**
 * Converts XML Part element to Part object
 *
 * @param xmlPart - Raw XML part element
 * @returns Parsed Part
 */
function parsePart(xmlPart: XmlPart): Part {
  return {
    partNumber: parseIntSafe(xmlPart.PartNumber, 0),
    eTag: cleanETag(xmlPart.ETag),
    size: parseIntSafe(xmlPart.Size, 0),
    lastModified: parseDate(xmlPart.LastModified),
  };
}

/**
 * Parses InitiateMultipartUpload XML response
 *
 * @param xml - Raw XML response from InitiateMultipartUpload API
 * @returns Parsed CreateMultipartOutput with upload ID
 * @throws Error if XML is malformed or missing required fields
 *
 * @example
 * ```typescript
 * const xml = `
 *   <InitiateMultipartUploadResult>
 *     <Bucket>my-bucket</Bucket>
 *     <Key>large-file.bin</Key>
 *     <UploadId>VXBsb2FkIElEIGZvciBpbGx1c3RyYXRpb24</UploadId>
 *   </InitiateMultipartUploadResult>
 * `;
 *
 * const result = parseInitiateMultipartResponse(xml);
 * console.log(result.uploadId); // 'VXBsb2FkIElEIGZvciBpbGx1c3RyYXRpb24'
 * ```
 */
export function parseInitiateMultipartResponse(xml: string): CreateMultipartOutput {
  try {
    const parsed = parseXml<InitiateMultipartXml>(xml);

    if (!parsed.InitiateMultipartUploadResult) {
      throw new Error(
        'Invalid InitiateMultipartUpload response: missing InitiateMultipartUploadResult element'
      );
    }

    const result = parsed.InitiateMultipartUploadResult;

    if (!result.Bucket) {
      throw new Error('Invalid InitiateMultipartUpload response: missing Bucket element');
    }

    if (!result.Key) {
      throw new Error('Invalid InitiateMultipartUpload response: missing Key element');
    }

    if (!result.UploadId) {
      throw new Error('Invalid InitiateMultipartUpload response: missing UploadId element');
    }

    return {
      bucket: result.Bucket,
      key: result.Key,
      uploadId: result.UploadId,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to parse InitiateMultipartUpload response: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Parses CompleteMultipartUpload XML response
 *
 * @param xml - Raw XML response from CompleteMultipartUpload API
 * @returns Parsed CompleteMultipartOutput with location and ETag
 * @throws Error if XML is malformed or missing required fields
 *
 * @example
 * ```typescript
 * const xml = `
 *   <CompleteMultipartUploadResult>
 *     <Location>https://my-bucket.r2.cloudflarestorage.com/large-file.bin</Location>
 *     <Bucket>my-bucket</Bucket>
 *     <Key>large-file.bin</Key>
 *     <ETag>"abc123def456"</ETag>
 *   </CompleteMultipartUploadResult>
 * `;
 *
 * const result = parseCompleteMultipartResponse(xml);
 * console.log(result.eTag); // 'abc123def456' (quotes removed)
 * ```
 */
export function parseCompleteMultipartResponse(xml: string): CompleteMultipartOutput {
  try {
    const parsed = parseXml<CompleteMultipartXml>(xml);

    if (!parsed.CompleteMultipartUploadResult) {
      throw new Error(
        'Invalid CompleteMultipartUpload response: missing CompleteMultipartUploadResult element'
      );
    }

    const result = parsed.CompleteMultipartUploadResult;

    if (!result.Location) {
      throw new Error('Invalid CompleteMultipartUpload response: missing Location element');
    }

    if (!result.Bucket) {
      throw new Error('Invalid CompleteMultipartUpload response: missing Bucket element');
    }

    if (!result.Key) {
      throw new Error('Invalid CompleteMultipartUpload response: missing Key element');
    }

    if (!result.ETag) {
      throw new Error('Invalid CompleteMultipartUpload response: missing ETag element');
    }

    return {
      location: result.Location,
      bucket: result.Bucket,
      key: result.Key,
      eTag: cleanETag(result.ETag),
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to parse CompleteMultipartUpload response: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Parses ListParts XML response
 *
 * Handles edge cases:
 * - Single vs multiple Part elements
 * - Missing optional fields
 * - Empty parts list
 *
 * @param xml - Raw XML response from ListParts API
 * @returns Parsed ListPartsOutput with list of uploaded parts
 * @throws Error if XML is malformed or missing required fields
 *
 * @example
 * ```typescript
 * const xml = `
 *   <ListPartsResult>
 *     <Bucket>my-bucket</Bucket>
 *     <Key>large-file.bin</Key>
 *     <UploadId>VXBsb2FkIElEIGZvciBpbGx1c3RyYXRpb24</UploadId>
 *     <IsTruncated>false</IsTruncated>
 *     <Part>
 *       <PartNumber>1</PartNumber>
 *       <ETag>"abc123"</ETag>
 *       <Size>5242880</Size>
 *       <LastModified>2024-01-15T10:30:00.000Z</LastModified>
 *     </Part>
 *     <Part>
 *       <PartNumber>2</PartNumber>
 *       <ETag>"def456"</ETag>
 *       <Size>5242880</Size>
 *       <LastModified>2024-01-15T10:31:00.000Z</LastModified>
 *     </Part>
 *   </ListPartsResult>
 * `;
 *
 * const result = parseListPartsResponse(xml);
 * console.log(result.parts.length); // 2
 * console.log(result.parts[0].partNumber); // 1
 * ```
 */
export function parseListPartsResponse(xml: string): ListPartsOutput {
  try {
    const parsed = parseXml<ListPartsXml>(xml);

    if (!parsed.ListPartsResult) {
      throw new Error('Invalid ListParts response: missing ListPartsResult element');
    }

    const result = parsed.ListPartsResult;

    if (!result.Bucket) {
      throw new Error('Invalid ListParts response: missing Bucket element');
    }

    if (!result.Key) {
      throw new Error('Invalid ListParts response: missing Key element');
    }

    if (!result.UploadId) {
      throw new Error('Invalid ListParts response: missing UploadId element');
    }

    // Normalize Part (may be single object or array)
    const partsArray = normalizeArray(result.Part);
    const parts = partsArray.map(parsePart);

    // Parse NextPartNumberMarker
    let nextPartNumberMarker: number | undefined;
    if (result.NextPartNumberMarker) {
      nextPartNumberMarker = parseIntSafe(result.NextPartNumberMarker, undefined as any);
      if (nextPartNumberMarker === undefined) {
        // If parsing failed, leave it undefined
        nextPartNumberMarker = undefined;
      }
    }

    // Parse MaxParts (default to 1000 if not specified, which is the S3 default)
    const maxParts = result.MaxParts ? parseIntSafe(result.MaxParts, 1000) : 1000;

    return {
      bucket: result.Bucket,
      key: result.Key,
      uploadId: result.UploadId,
      isTruncated: parseBooleanSafe(result.IsTruncated, false),
      parts,
      maxParts,
      nextPartNumberMarker,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to parse ListParts response: ${error.message}`);
    }
    throw error;
  }
}

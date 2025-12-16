/**
 * XML builders for request bodies
 * @module @studiorack/cloudflare-r2/xml/builders
 */

import type { ObjectIdentifier, CompletedPart } from '../types/index.js';
import { buildXml } from './parser.js';

/**
 * Escapes special XML characters in a string
 *
 * Escapes the following characters:
 * - & -> &amp;
 * - < -> &lt;
 * - > -> &gt;
 * - " -> &quot;
 * - ' -> &apos;
 *
 * @param str - String to escape
 * @returns Escaped string safe for XML
 *
 * @example
 * ```typescript
 * escapeXml('Hello & "World"'); // 'Hello &amp; &quot;World&quot;'
 * escapeXml('<tag>'); // '&lt;tag&gt;'
 * ```
 */
export function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Builds XML for DeleteObjects request
 *
 * Creates the request body for deleting multiple objects in a single operation.
 * The quiet mode controls whether the response includes successfully deleted objects.
 *
 * @param objects - Array of object identifiers to delete
 * @param quiet - If true, only return errors in response (default: false)
 * @returns XML string for DeleteObjects request body
 *
 * @example
 * ```typescript
 * const objects = [
 *   { key: 'file1.txt' },
 *   { key: 'file2.txt', versionId: 'v123' }
 * ];
 *
 * const xml = buildDeleteObjectsXml(objects, false);
 * // Result:
 * // <Delete>
 * //   <Quiet>false</Quiet>
 * //   <Object>
 * //     <Key>file1.txt</Key>
 * //   </Object>
 * //   <Object>
 * //     <Key>file2.txt</Key>
 * //     <VersionId>v123</VersionId>
 * //   </Object>
 * // </Delete>
 * ```
 */
export function buildDeleteObjectsXml(
  objects: ObjectIdentifier[],
  quiet: boolean = false
): string {
  if (!objects || objects.length === 0) {
    throw new Error('Cannot build DeleteObjects XML: objects array is empty');
  }

  if (objects.length > 1000) {
    throw new Error(
      `Cannot delete more than 1000 objects at once (got ${objects.length})`
    );
  }

  // Build Object elements
  const objectElements = objects.map((obj) => {
    const element: Record<string, string> = {
      Key: obj.key,
    };

    if (obj.versionId) {
      element.VersionId = obj.versionId;
    }

    return element;
  });

  const deleteRequest = {
    Delete: {
      Quiet: quiet.toString(),
      Object: objectElements,
    },
  };

  return buildXml(deleteRequest);
}

/**
 * Builds XML for CompleteMultipartUpload request
 *
 * Creates the request body for completing a multipart upload.
 * Parts must be provided in ascending order by part number.
 *
 * @param parts - Array of completed parts with part numbers and ETags
 * @returns XML string for CompleteMultipartUpload request body
 * @throws Error if parts array is empty or invalid
 *
 * @example
 * ```typescript
 * const parts = [
 *   { partNumber: 1, eTag: 'abc123' },
 *   { partNumber: 2, eTag: 'def456' }
 * ];
 *
 * const xml = buildCompleteMultipartXml(parts);
 * // Result:
 * // <CompleteMultipartUpload>
 * //   <Part>
 * //     <PartNumber>1</PartNumber>
 * //     <ETag>abc123</ETag>
 * //   </Part>
 * //   <Part>
 * //     <PartNumber>2</PartNumber>
 * //     <ETag>def456</ETag>
 * //   </Part>
 * // </CompleteMultipartUpload>
 * ```
 */
export function buildCompleteMultipartXml(parts: CompletedPart[]): string {
  if (!parts || parts.length === 0) {
    throw new Error('Cannot build CompleteMultipartUpload XML: parts array is empty');
  }

  // Validate parts
  for (const part of parts) {
    if (!part.partNumber || part.partNumber < 1 || part.partNumber > 10000) {
      throw new Error(
        `Invalid part number: ${part.partNumber}. Must be between 1 and 10000.`
      );
    }

    if (!part.eTag) {
      throw new Error(`Part ${part.partNumber} is missing ETag`);
    }
  }

  // Sort parts by part number (ascending)
  const sortedParts = [...parts].sort((a, b) => a.partNumber - b.partNumber);

  // Build Part elements
  const partElements = sortedParts.map((part) => ({
    PartNumber: part.partNumber.toString(),
    ETag: part.eTag,
  }));

  const completeRequest = {
    CompleteMultipartUpload: {
      Part: partElements,
    },
  };

  return buildXml(completeRequest);
}

/**
 * Builds XML for bucket lifecycle configuration
 *
 * Note: This is a helper for future lifecycle rule support.
 * R2 supports S3-compatible lifecycle rules.
 *
 * @param rules - Array of lifecycle rules
 * @returns XML string for lifecycle configuration
 *
 * @internal
 */
export function buildLifecycleConfigurationXml(rules: unknown[]): string {
  if (!rules || rules.length === 0) {
    throw new Error('Cannot build LifecycleConfiguration XML: rules array is empty');
  }

  // This is a placeholder for future implementation
  // S3 lifecycle configuration structure is complex and varies by rule type
  throw new Error('Lifecycle configuration is not yet implemented');
}

/**
 * Builds XML for bucket tagging
 *
 * Note: This is a helper for future tagging support.
 * R2 supports S3-compatible bucket tagging.
 *
 * @param tags - Tag key-value pairs
 * @returns XML string for tagging
 *
 * @example
 * ```typescript
 * const tags = {
 *   Environment: 'production',
 *   Project: 'web-app'
 * };
 *
 * const xml = buildTaggingXml(tags);
 * // Result:
 * // <Tagging>
 * //   <TagSet>
 * //     <Tag>
 * //       <Key>Environment</Key>
 * //       <Value>production</Value>
 * //     </Tag>
 * //     <Tag>
 * //       <Key>Project</Key>
 * //       <Value>web-app</Value>
 * //     </Tag>
 * //   </TagSet>
 * // </Tagging>
 * ```
 */
export function buildTaggingXml(tags: Record<string, string>): string {
  const keys = Object.keys(tags);

  if (keys.length === 0) {
    throw new Error('Cannot build Tagging XML: tags object is empty');
  }

  if (keys.length > 50) {
    throw new Error(`Cannot have more than 50 tags (got ${keys.length})`);
  }

  // Build Tag elements
  const tagElements = keys.map((key) => ({
    Key: key,
    Value: tags[key],
  }));

  const tagging = {
    Tagging: {
      TagSet: {
        Tag: tagElements,
      },
    },
  };

  return buildXml(tagging);
}

/**
 * Validates object key for S3/R2 compatibility
 *
 * Object keys must:
 * - Be 1-1024 characters long
 * - Be valid UTF-8
 * - Not contain certain problematic characters
 *
 * @param key - Object key to validate
 * @throws Error if key is invalid
 *
 * @example
 * ```typescript
 * validateObjectKey('valid/path/file.txt'); // OK
 * validateObjectKey(''); // Throws error
 * validateObjectKey('a'.repeat(1025)); // Throws error
 * ```
 */
export function validateObjectKey(key: string): void {
  if (!key || key.length === 0) {
    throw new Error('Object key cannot be empty');
  }

  if (key.length > 1024) {
    throw new Error(`Object key too long: ${key.length} characters (max 1024)`);
  }

  // Check for problematic characters
  // While S3 technically allows many characters, some are problematic
  if (key.includes('\0')) {
    throw new Error('Object key cannot contain null bytes');
  }

  // Warn about potentially problematic keys (leading/trailing spaces, etc.)
  if (key !== key.trim()) {
    console.warn('Object key has leading or trailing whitespace:', key);
  }
}

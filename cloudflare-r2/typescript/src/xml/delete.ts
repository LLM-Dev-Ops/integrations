/**
 * XML parsing for delete objects operations
 * @module @studiorack/cloudflare-r2/xml/delete
 */

import type { DeleteObjectsOutput, DeletedObject, DeleteError } from '../types/index.js';
import { parseXml, normalizeArray, parseBooleanSafe } from './parser.js';

/**
 * DeleteResult XML structure
 */
interface DeleteResultXml {
  DeleteResult: {
    Deleted?: XmlDeleted | XmlDeleted[];
    Error?: XmlDeleteError | XmlDeleteError[];
  };
}

/**
 * XML structure for a successfully deleted object
 */
interface XmlDeleted {
  Key: string;
  VersionId?: string;
  DeleteMarker?: string;
  DeleteMarkerVersionId?: string;
}

/**
 * XML structure for a delete error
 */
interface XmlDeleteError {
  Key: string;
  Code: string;
  Message: string;
  VersionId?: string;
}

/**
 * Converts XML Deleted element to DeletedObject
 *
 * @param xmlDeleted - Raw XML deleted element
 * @returns Parsed DeletedObject
 */
function parseDeleted(xmlDeleted: XmlDeleted): DeletedObject {
  return {
    key: xmlDeleted.Key,
    ...(xmlDeleted.VersionId && { versionId: xmlDeleted.VersionId }),
    ...(xmlDeleted.DeleteMarker && {
      deleteMarker: parseBooleanSafe(xmlDeleted.DeleteMarker, false),
    }),
    ...(xmlDeleted.DeleteMarkerVersionId && {
      deleteMarkerVersionId: xmlDeleted.DeleteMarkerVersionId,
    }),
  };
}

/**
 * Converts XML Error element to DeleteError
 *
 * @param xmlError - Raw XML error element
 * @returns Parsed DeleteError
 */
function parseDeleteError(xmlError: XmlDeleteError): DeleteError {
  return {
    key: xmlError.Key,
    code: xmlError.Code,
    message: xmlError.Message,
    ...(xmlError.VersionId && { versionId: xmlError.VersionId }),
  };
}

/**
 * Parses DeleteObjects XML response
 *
 * The DeleteObjects operation can delete multiple objects in a single request.
 * The response contains two lists:
 * - Deleted: Successfully deleted objects
 * - Error: Objects that failed to delete with error details
 *
 * Handles edge cases:
 * - Single vs multiple Deleted elements
 * - Single vs multiple Error elements
 * - Empty results (all succeeded or all failed)
 * - Missing optional fields
 *
 * @param xml - Raw XML response from DeleteObjects API
 * @returns Parsed DeleteObjectsOutput with deleted objects and errors
 * @throws Error if XML is malformed
 *
 * @example
 * ```typescript
 * const xml = `
 *   <DeleteResult>
 *     <Deleted>
 *       <Key>file1.txt</Key>
 *     </Deleted>
 *     <Deleted>
 *       <Key>file2.txt</Key>
 *     </Deleted>
 *     <Error>
 *       <Key>file3.txt</Key>
 *       <Code>AccessDenied</Code>
 *       <Message>Access Denied</Message>
 *     </Error>
 *   </DeleteResult>
 * `;
 *
 * const result = parseDeleteObjectsResponse(xml);
 * console.log(result.deleted.length); // 2
 * console.log(result.errors.length); // 1
 * console.log(result.errors[0].code); // 'AccessDenied'
 * ```
 */
export function parseDeleteObjectsResponse(xml: string): DeleteObjectsOutput {
  try {
    const parsed = parseXml<DeleteResultXml>(xml);

    if (!parsed.DeleteResult) {
      throw new Error('Invalid DeleteObjects response: missing DeleteResult element');
    }

    const result = parsed.DeleteResult;

    // Normalize Deleted (may be single object, array, or undefined)
    const deletedArray = normalizeArray(result.Deleted);
    const deleted = deletedArray.map(parseDeleted);

    // Normalize Error (may be single object, array, or undefined)
    const errorArray = normalizeArray(result.Error);
    const errors = errorArray.map(parseDeleteError);

    return {
      deleted,
      errors,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to parse DeleteObjects response: ${error.message}`);
    }
    throw error;
  }
}

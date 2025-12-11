/**
 * XML Parsing and Building
 *
 * Simple XML parser and builder for S3 API responses and requests.
 */

import { S3ErrorResponse } from "../error";
import {
  S3Object,
  Bucket,
  Owner,
  Part,
  DeletedObject,
  DeleteError,
  Tag,
  ObjectIdentifier,
  CompletedPart,
  StorageClass,
  MultipartUpload,
} from "../types";

/**
 * Simple XML element extraction.
 */
function extractElement(xml: string, tag: string): string | undefined {
  const regex = new RegExp(`<${tag}>([^<]*)</${tag}>`, "s");
  const match = xml.match(regex);
  return match ? unescapeXml(match[1].trim()) : undefined;
}

/**
 * Extract all elements with a given tag.
 */
function extractAllElements(xml: string, tag: string): string[] {
  const regex = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g");
  const results: string[] = [];
  let match;
  while ((match = regex.exec(xml)) !== null) {
    results.push(match[1].trim());
  }
  return results;
}

/**
 * Escape XML special characters.
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Unescape XML special characters.
 */
function unescapeXml(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/**
 * Parse S3 error response.
 */
export function parseErrorResponse(xml: string): S3ErrorResponse {
  return {
    code: extractElement(xml, "Code") ?? "UnknownError",
    message: extractElement(xml, "Message") ?? "Unknown error",
    key: extractElement(xml, "Key"),
    bucket: extractElement(xml, "BucketName"),
    requestId: extractElement(xml, "RequestId"),
    hostId: extractElement(xml, "HostId"),
  };
}

/**
 * Parse ListBucketResult (ListObjectsV2).
 */
export function parseListObjectsV2(xml: string): {
  name?: string;
  prefix?: string;
  delimiter?: string;
  maxKeys?: number;
  keyCount?: number;
  isTruncated: boolean;
  nextContinuationToken?: string;
  startAfter?: string;
  continuationToken?: string;
  contents: S3Object[];
  commonPrefixes: string[];
} {
  return {
    name: extractElement(xml, "Name"),
    prefix: extractElement(xml, "Prefix"),
    delimiter: extractElement(xml, "Delimiter"),
    maxKeys: extractElement(xml, "MaxKeys") ? parseInt(extractElement(xml, "MaxKeys")!) : undefined,
    keyCount: extractElement(xml, "KeyCount") ? parseInt(extractElement(xml, "KeyCount")!) : undefined,
    isTruncated: extractElement(xml, "IsTruncated") === "true",
    nextContinuationToken: extractElement(xml, "NextContinuationToken"),
    startAfter: extractElement(xml, "StartAfter"),
    continuationToken: extractElement(xml, "ContinuationToken"),
    contents: extractAllElements(xml, "Contents").map(parseS3Object),
    commonPrefixes: extractAllElements(xml, "CommonPrefixes").map(
      (cp) => extractElement(cp, "Prefix") ?? ""
    ),
  };
}

/**
 * Parse S3 object from Contents element.
 */
function parseS3Object(xml: string): S3Object {
  return {
    key: extractElement(xml, "Key") ?? "",
    lastModified: extractElement(xml, "LastModified"),
    eTag: extractElement(xml, "ETag"),
    size: extractElement(xml, "Size") ? parseInt(extractElement(xml, "Size")!) : undefined,
    storageClass: extractElement(xml, "StorageClass") as StorageClass | undefined,
    owner: parseOwnerIfPresent(xml),
  };
}

/**
 * Parse owner if present.
 */
function parseOwnerIfPresent(xml: string): Owner | undefined {
  const ownerXml = extractAllElements(xml, "Owner")[0];
  if (!ownerXml) {
    return undefined;
  }
  return {
    id: extractElement(ownerXml, "ID"),
    displayName: extractElement(ownerXml, "DisplayName"),
  };
}

/**
 * Parse ListAllMyBucketsResult.
 */
export function parseListBuckets(xml: string): {
  owner?: Owner;
  buckets: Bucket[];
} {
  const bucketsXml = extractAllElements(xml, "Bucket");
  return {
    owner: parseOwnerIfPresent(xml),
    buckets: bucketsXml.map((b) => ({
      name: extractElement(b, "Name") ?? "",
      creationDate: extractElement(b, "CreationDate"),
    })),
  };
}

/**
 * Parse GetBucketLocation response.
 */
export function parseGetBucketLocation(xml: string): string | undefined {
  return extractElement(xml, "LocationConstraint");
}

/**
 * Parse InitiateMultipartUploadResult.
 */
export function parseCreateMultipartUpload(xml: string): {
  bucket: string;
  key: string;
  uploadId: string;
} {
  return {
    bucket: extractElement(xml, "Bucket") ?? "",
    key: extractElement(xml, "Key") ?? "",
    uploadId: extractElement(xml, "UploadId") ?? "",
  };
}

/**
 * Parse CompleteMultipartUploadResult.
 */
export function parseCompleteMultipartUpload(xml: string): {
  bucket?: string;
  key?: string;
  location?: string;
  eTag?: string;
} {
  return {
    bucket: extractElement(xml, "Bucket"),
    key: extractElement(xml, "Key"),
    location: extractElement(xml, "Location"),
    eTag: extractElement(xml, "ETag"),
  };
}

/**
 * Parse ListPartsResult.
 */
export function parseListParts(xml: string): {
  bucket?: string;
  key?: string;
  uploadId?: string;
  partNumberMarker?: number;
  nextPartNumberMarker?: number;
  maxParts?: number;
  isTruncated: boolean;
  parts: Part[];
  initiator?: Owner;
  owner?: Owner;
  storageClass?: StorageClass;
} {
  const partsXml = extractAllElements(xml, "Part");
  return {
    bucket: extractElement(xml, "Bucket"),
    key: extractElement(xml, "Key"),
    uploadId: extractElement(xml, "UploadId"),
    partNumberMarker: extractElement(xml, "PartNumberMarker")
      ? parseInt(extractElement(xml, "PartNumberMarker")!)
      : undefined,
    nextPartNumberMarker: extractElement(xml, "NextPartNumberMarker")
      ? parseInt(extractElement(xml, "NextPartNumberMarker")!)
      : undefined,
    maxParts: extractElement(xml, "MaxParts")
      ? parseInt(extractElement(xml, "MaxParts")!)
      : undefined,
    isTruncated: extractElement(xml, "IsTruncated") === "true",
    parts: partsXml.map((p) => ({
      partNumber: parseInt(extractElement(p, "PartNumber") ?? "0"),
      eTag: extractElement(p, "ETag") ?? "",
      size: extractElement(p, "Size") ? parseInt(extractElement(p, "Size")!) : undefined,
      lastModified: extractElement(p, "LastModified"),
    })),
    initiator: extractAllElements(xml, "Initiator")[0]
      ? parseOwnerIfPresent(extractAllElements(xml, "Initiator")[0])
      : undefined,
    owner: parseOwnerIfPresent(xml),
    storageClass: extractElement(xml, "StorageClass") as StorageClass | undefined,
  };
}

/**
 * Parse ListMultipartUploadsResult.
 */
export function parseListMultipartUploads(xml: string): {
  bucket?: string;
  prefix?: string;
  delimiter?: string;
  keyMarker?: string;
  uploadIdMarker?: string;
  nextKeyMarker?: string;
  nextUploadIdMarker?: string;
  maxUploads?: number;
  isTruncated: boolean;
  uploads: MultipartUpload[];
  commonPrefixes: string[];
} {
  const uploadsXml = extractAllElements(xml, "Upload");
  return {
    bucket: extractElement(xml, "Bucket"),
    prefix: extractElement(xml, "Prefix"),
    delimiter: extractElement(xml, "Delimiter"),
    keyMarker: extractElement(xml, "KeyMarker"),
    uploadIdMarker: extractElement(xml, "UploadIdMarker"),
    nextKeyMarker: extractElement(xml, "NextKeyMarker"),
    nextUploadIdMarker: extractElement(xml, "NextUploadIdMarker"),
    maxUploads: extractElement(xml, "MaxUploads")
      ? parseInt(extractElement(xml, "MaxUploads")!)
      : undefined,
    isTruncated: extractElement(xml, "IsTruncated") === "true",
    uploads: uploadsXml.map((u) => ({
      key: extractElement(u, "Key") ?? "",
      uploadId: extractElement(u, "UploadId") ?? "",
      initiator: parseOwnerIfPresent(u),
      owner: parseOwnerIfPresent(u),
      storageClass: extractElement(u, "StorageClass") as StorageClass | undefined,
      initiated: extractElement(u, "Initiated"),
    })),
    commonPrefixes: extractAllElements(xml, "CommonPrefixes").map(
      (cp) => extractElement(cp, "Prefix") ?? ""
    ),
  };
}

/**
 * Parse DeleteResult.
 */
export function parseDeleteObjects(xml: string): {
  deleted: DeletedObject[];
  errors: DeleteError[];
} {
  const deletedXml = extractAllElements(xml, "Deleted");
  const errorXml = extractAllElements(xml, "Error");

  return {
    deleted: deletedXml.map((d) => ({
      key: extractElement(d, "Key") ?? "",
      versionId: extractElement(d, "VersionId"),
      deleteMarker: extractElement(d, "DeleteMarker") === "true",
      deleteMarkerVersionId: extractElement(d, "DeleteMarkerVersionId"),
    })),
    errors: errorXml.map((e) => ({
      key: extractElement(e, "Key") ?? "",
      versionId: extractElement(e, "VersionId"),
      code: extractElement(e, "Code") ?? "",
      message: extractElement(e, "Message") ?? "",
    })),
  };
}

/**
 * Parse CopyObjectResult.
 */
export function parseCopyObject(xml: string): {
  eTag?: string;
  lastModified?: string;
} {
  return {
    eTag: extractElement(xml, "ETag"),
    lastModified: extractElement(xml, "LastModified"),
  };
}

/**
 * Parse GetObjectTagging response.
 */
export function parseGetObjectTagging(xml: string): { tags: Tag[] } {
  const tagXml = extractAllElements(xml, "Tag");
  return {
    tags: tagXml.map((t) => ({
      key: extractElement(t, "Key") ?? "",
      value: extractElement(t, "Value") ?? "",
    })),
  };
}

/**
 * Build Delete request XML.
 */
export function buildDeleteObjectsXml(
  objects: ObjectIdentifier[],
  quiet: boolean
): string {
  const objectsXml = objects
    .map((o) => {
      let xml = `<Object><Key>${escapeXml(o.key)}</Key>`;
      if (o.versionId) {
        xml += `<VersionId>${escapeXml(o.versionId)}</VersionId>`;
      }
      xml += "</Object>";
      return xml;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?><Delete><Quiet>${quiet}</Quiet>${objectsXml}</Delete>`;
}

/**
 * Build CompleteMultipartUpload request XML.
 */
export function buildCompleteMultipartXml(parts: CompletedPart[]): string {
  const partsXml = parts
    .map(
      (p) =>
        `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>${escapeXml(p.eTag)}</ETag></Part>`
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?><CompleteMultipartUpload>${partsXml}</CompleteMultipartUpload>`;
}

/**
 * Build Tagging request XML.
 */
export function buildPutTaggingXml(tags: Tag[]): string {
  const tagsXml = tags
    .map(
      (t) =>
        `<Tag><Key>${escapeXml(t.key)}</Key><Value>${escapeXml(t.value)}</Value></Tag>`
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?><Tagging><TagSet>${tagsXml}</TagSet></Tagging>`;
}

/**
 * Build CreateBucketConfiguration XML.
 */
export function buildCreateBucketXml(region: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><CreateBucketConfiguration><LocationConstraint>${escapeXml(region)}</LocationConstraint></CreateBucketConfiguration>`;
}

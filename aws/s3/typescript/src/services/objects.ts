/**
 * Objects Service
 *
 * S3 object operations: put, get, delete, head, copy, list.
 */

import { S3Config, resolveEndpoint, buildPath } from "../config";
import { S3Error, mapS3ErrorCode } from "../error";
import { AwsSignerV4 } from "../signing";
import { HttpTransport, isSuccess, getHeader, getETag, getRequestId } from "../transport";
import {
  PutObjectRequest,
  GetObjectRequest,
  DeleteObjectRequest,
  DeleteObjectsRequest,
  HeadObjectRequest,
  CopyObjectRequest,
  ListObjectsV2Request,
} from "../types/requests";
import {
  PutObjectOutput,
  GetObjectOutput,
  DeleteObjectOutput,
  DeleteObjectsOutput,
  HeadObjectOutput,
  CopyObjectOutput,
  ListObjectsV2Output,
} from "../types/responses";
import { StorageClass } from "../types/common";
import * as xml from "../xml";
import * as crypto from "crypto";

/**
 * Objects service for S3 object operations.
 */
export class ObjectsService {
  private config: S3Config;
  private transport: HttpTransport;
  private signer: AwsSignerV4;

  constructor(config: S3Config, transport: HttpTransport, signer: AwsSignerV4) {
    this.config = config;
    this.transport = transport;
    this.signer = signer;
  }

  /**
   * Put (upload) an object.
   */
  async put(request: PutObjectRequest): Promise<PutObjectOutput> {
    const endpoint = resolveEndpoint(this.config, request.bucket);
    const path = buildPath(this.config, request.bucket, request.key);
    const url = new URL(path, endpoint);

    const body = request.body
      ? typeof request.body === "string"
        ? Buffer.from(request.body)
        : request.body
      : Buffer.alloc(0);

    const headers: Record<string, string> = {
      "content-length": String(body.length),
    };

    if (request.contentType) {
      headers["content-type"] = request.contentType;
    }
    if (request.contentEncoding) {
      headers["content-encoding"] = request.contentEncoding;
    }
    if (request.contentDisposition) {
      headers["content-disposition"] = request.contentDisposition;
    }
    if (request.cacheControl) {
      headers["cache-control"] = request.cacheControl;
    }
    if (request.contentMd5) {
      headers["content-md5"] = request.contentMd5;
    }
    if (request.storageClass) {
      headers["x-amz-storage-class"] = request.storageClass;
    }
    if (request.serverSideEncryption) {
      headers["x-amz-server-side-encryption"] = request.serverSideEncryption;
    }
    if (request.acl) {
      headers["x-amz-acl"] = request.acl;
    }

    // Add metadata
    if (request.metadata) {
      for (const [key, value] of Object.entries(request.metadata)) {
        headers[`x-amz-meta-${key}`] = value;
      }
    }

    // Add tagging
    if (request.tagging && request.tagging.length > 0) {
      headers["x-amz-tagging"] = request.tagging
        .map((t) => `${encodeURIComponent(t.key)}=${encodeURIComponent(t.value)}`)
        .join("&");
    }

    const signed = await this.signer.sign("PUT", url, headers, body);

    const response = await this.transport.send({
      method: "PUT",
      url: signed.url.toString(),
      headers: signed.headers,
      body,
    });

    if (!isSuccess(response)) {
      throw this.parseError(response.body.toString());
    }

    return {
      eTag: getETag(response),
      versionId: getHeader(response, "x-amz-version-id"),
      serverSideEncryption: getHeader(response, "x-amz-server-side-encryption"),
      sseKmsKeyId: getHeader(response, "x-amz-server-side-encryption-aws-kms-key-id"),
      requestId: getRequestId(response),
    };
  }

  /**
   * Get (download) an object.
   */
  async get(request: GetObjectRequest): Promise<GetObjectOutput> {
    const endpoint = resolveEndpoint(this.config, request.bucket);
    const path = buildPath(this.config, request.bucket, request.key);
    const url = new URL(path, endpoint);

    if (request.versionId) {
      url.searchParams.set("versionId", request.versionId);
    }
    if (request.partNumber) {
      url.searchParams.set("partNumber", String(request.partNumber));
    }

    const headers: Record<string, string> = {};

    if (request.range) {
      headers["range"] = request.range;
    }
    if (request.ifMatch) {
      headers["if-match"] = request.ifMatch;
    }
    if (request.ifNoneMatch) {
      headers["if-none-match"] = request.ifNoneMatch;
    }
    if (request.ifModifiedSince) {
      headers["if-modified-since"] = request.ifModifiedSince;
    }
    if (request.ifUnmodifiedSince) {
      headers["if-unmodified-since"] = request.ifUnmodifiedSince;
    }

    const signed = await this.signer.sign("GET", url, headers);

    const response = await this.transport.send({
      method: "GET",
      url: signed.url.toString(),
      headers: signed.headers,
    });

    if (!isSuccess(response)) {
      throw this.parseError(response.body.toString());
    }

    const metadata: Record<string, string> = {};
    for (const [key, value] of Object.entries(response.headers)) {
      if (key.toLowerCase().startsWith("x-amz-meta-")) {
        metadata[key.slice(11)] = value;
      }
    }

    return {
      body: response.body,
      eTag: getETag(response),
      contentLength: getHeader(response, "content-length")
        ? parseInt(getHeader(response, "content-length")!)
        : undefined,
      contentType: getHeader(response, "content-type"),
      contentEncoding: getHeader(response, "content-encoding"),
      contentDisposition: getHeader(response, "content-disposition"),
      cacheControl: getHeader(response, "cache-control"),
      lastModified: getHeader(response, "last-modified"),
      versionId: getHeader(response, "x-amz-version-id"),
      storageClass: getHeader(response, "x-amz-storage-class") as StorageClass | undefined,
      serverSideEncryption: getHeader(response, "x-amz-server-side-encryption"),
      metadata,
      deleteMarker: getHeader(response, "x-amz-delete-marker") === "true",
      requestId: getRequestId(response),
    };
  }

  /**
   * Delete an object.
   */
  async delete(request: DeleteObjectRequest): Promise<DeleteObjectOutput> {
    const endpoint = resolveEndpoint(this.config, request.bucket);
    const path = buildPath(this.config, request.bucket, request.key);
    const url = new URL(path, endpoint);

    if (request.versionId) {
      url.searchParams.set("versionId", request.versionId);
    }

    const headers: Record<string, string> = {};

    const signed = await this.signer.sign("DELETE", url, headers);

    const response = await this.transport.send({
      method: "DELETE",
      url: signed.url.toString(),
      headers: signed.headers,
    });

    if (!isSuccess(response)) {
      throw this.parseError(response.body.toString());
    }

    return {
      deleteMarker: getHeader(response, "x-amz-delete-marker") === "true",
      versionId: getHeader(response, "x-amz-version-id"),
      requestId: getRequestId(response),
    };
  }

  /**
   * Delete multiple objects.
   */
  async deleteObjects(request: DeleteObjectsRequest): Promise<DeleteObjectsOutput> {
    const endpoint = resolveEndpoint(this.config, request.bucket);
    const path = buildPath(this.config, request.bucket);
    const url = new URL(path, endpoint);
    url.searchParams.set("delete", "");

    const body = xml.buildDeleteObjectsXml(request.objects, request.quiet ?? false);
    const bodyBuffer = Buffer.from(body);
    const contentMd5 = crypto.createHash("md5").update(bodyBuffer).digest("base64");

    const headers: Record<string, string> = {
      "content-type": "application/xml",
      "content-md5": contentMd5,
      "content-length": String(bodyBuffer.length),
    };

    const signed = await this.signer.sign("POST", url, headers, bodyBuffer);

    const response = await this.transport.send({
      method: "POST",
      url: signed.url.toString(),
      headers: signed.headers,
      body: bodyBuffer,
    });

    if (!isSuccess(response)) {
      throw this.parseError(response.body.toString());
    }

    const result = xml.parseDeleteObjects(response.body.toString());

    return {
      deleted: result.deleted,
      errors: result.errors,
      requestId: getRequestId(response),
    };
  }

  /**
   * Head (get metadata of) an object.
   */
  async head(request: HeadObjectRequest): Promise<HeadObjectOutput> {
    const endpoint = resolveEndpoint(this.config, request.bucket);
    const path = buildPath(this.config, request.bucket, request.key);
    const url = new URL(path, endpoint);

    if (request.versionId) {
      url.searchParams.set("versionId", request.versionId);
    }

    const headers: Record<string, string> = {};

    if (request.ifMatch) {
      headers["if-match"] = request.ifMatch;
    }
    if (request.ifNoneMatch) {
      headers["if-none-match"] = request.ifNoneMatch;
    }

    const signed = await this.signer.sign("HEAD", url, headers);

    const response = await this.transport.send({
      method: "HEAD",
      url: signed.url.toString(),
      headers: signed.headers,
    });

    if (!isSuccess(response)) {
      throw this.parseError(response.body.toString());
    }

    const metadata: Record<string, string> = {};
    for (const [key, value] of Object.entries(response.headers)) {
      if (key.toLowerCase().startsWith("x-amz-meta-")) {
        metadata[key.slice(11)] = value;
      }
    }

    return {
      eTag: getETag(response),
      contentLength: getHeader(response, "content-length")
        ? parseInt(getHeader(response, "content-length")!)
        : undefined,
      contentType: getHeader(response, "content-type"),
      lastModified: getHeader(response, "last-modified"),
      versionId: getHeader(response, "x-amz-version-id"),
      storageClass: getHeader(response, "x-amz-storage-class") as StorageClass | undefined,
      serverSideEncryption: getHeader(response, "x-amz-server-side-encryption"),
      metadata,
      deleteMarker: getHeader(response, "x-amz-delete-marker") === "true",
      requestId: getRequestId(response),
    };
  }

  /**
   * Copy an object.
   */
  async copy(request: CopyObjectRequest): Promise<CopyObjectOutput> {
    const endpoint = resolveEndpoint(this.config, request.destBucket);
    const path = buildPath(this.config, request.destBucket, request.destKey);
    const url = new URL(path, endpoint);

    let copySource = `/${request.sourceBucket}/${request.sourceKey}`;
    if (request.sourceVersionId) {
      copySource += `?versionId=${request.sourceVersionId}`;
    }

    const headers: Record<string, string> = {
      "x-amz-copy-source": copySource,
    };

    if (request.metadataDirective) {
      headers["x-amz-metadata-directive"] = request.metadataDirective;
    }
    if (request.contentType) {
      headers["content-type"] = request.contentType;
    }
    if (request.storageClass) {
      headers["x-amz-storage-class"] = request.storageClass;
    }
    if (request.acl) {
      headers["x-amz-acl"] = request.acl;
    }

    // Add metadata
    if (request.metadata) {
      for (const [key, value] of Object.entries(request.metadata)) {
        headers[`x-amz-meta-${key}`] = value;
      }
    }

    const signed = await this.signer.sign("PUT", url, headers);

    const response = await this.transport.send({
      method: "PUT",
      url: signed.url.toString(),
      headers: signed.headers,
    });

    if (!isSuccess(response)) {
      throw this.parseError(response.body.toString());
    }

    const result = xml.parseCopyObject(response.body.toString());

    return {
      eTag: result.eTag,
      lastModified: result.lastModified,
      versionId: getHeader(response, "x-amz-version-id"),
      copySourceVersionId: getHeader(response, "x-amz-copy-source-version-id"),
      serverSideEncryption: getHeader(response, "x-amz-server-side-encryption"),
      requestId: getRequestId(response),
    };
  }

  /**
   * List objects in a bucket.
   */
  async list(request: ListObjectsV2Request): Promise<ListObjectsV2Output> {
    const endpoint = resolveEndpoint(this.config, request.bucket);
    const path = buildPath(this.config, request.bucket);
    const url = new URL(path, endpoint);
    url.searchParams.set("list-type", "2");

    if (request.prefix) {
      url.searchParams.set("prefix", request.prefix);
    }
    if (request.delimiter) {
      url.searchParams.set("delimiter", request.delimiter);
    }
    if (request.maxKeys) {
      url.searchParams.set("max-keys", String(request.maxKeys));
    }
    if (request.continuationToken) {
      url.searchParams.set("continuation-token", request.continuationToken);
    }
    if (request.startAfter) {
      url.searchParams.set("start-after", request.startAfter);
    }
    if (request.fetchOwner) {
      url.searchParams.set("fetch-owner", "true");
    }

    const headers: Record<string, string> = {};

    const signed = await this.signer.sign("GET", url, headers);

    const response = await this.transport.send({
      method: "GET",
      url: signed.url.toString(),
      headers: signed.headers,
    });

    if (!isSuccess(response)) {
      throw this.parseError(response.body.toString());
    }

    const result = xml.parseListObjectsV2(response.body.toString());

    return {
      name: result.name,
      prefix: result.prefix,
      delimiter: result.delimiter,
      maxKeys: result.maxKeys,
      keyCount: result.keyCount,
      isTruncated: result.isTruncated,
      nextContinuationToken: result.nextContinuationToken,
      startAfter: result.startAfter,
      continuationToken: result.continuationToken,
      contents: result.contents,
      commonPrefixes: result.commonPrefixes,
      requestId: getRequestId(response),
    };
  }

  private parseError(body: string): S3Error {
    if (!body) {
      return new S3Error("Empty error response", "UnknownError");
    }
    const errorResponse = xml.parseErrorResponse(body);
    return mapS3ErrorCode(errorResponse.code, errorResponse);
  }
}

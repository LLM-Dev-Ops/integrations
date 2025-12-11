/**
 * Multipart Upload Service
 *
 * S3 multipart upload operations: create, uploadPart, complete, abort, listParts, listUploads.
 */

import { S3Config, resolveEndpoint, buildPath } from "../config";
import { S3Error, mapS3ErrorCode } from "../error";
import { AwsSignerV4 } from "../signing";
import { HttpTransport, isSuccess, getHeader, getETag, getRequestId } from "../transport";
import {
  CreateMultipartUploadRequest,
  UploadPartRequest,
  ListPartsRequest,
  ListMultipartUploadsRequest,
} from "../types/requests";
import {
  CreateMultipartUploadOutput,
  UploadPartOutput,
  CompleteMultipartUploadOutput,
  ListPartsOutput,
  ListMultipartUploadsOutput,
} from "../types/responses";
import { CompletedPart } from "../types/common";
import * as xml from "../xml";

/**
 * Multipart service for S3 multipart upload operations.
 */
export class MultipartService {
  private config: S3Config;
  private transport: HttpTransport;
  private signer: AwsSignerV4;

  constructor(config: S3Config, transport: HttpTransport, signer: AwsSignerV4) {
    this.config = config;
    this.transport = transport;
    this.signer = signer;
  }

  /**
   * Initiate a multipart upload.
   */
  async create(request: CreateMultipartUploadRequest): Promise<CreateMultipartUploadOutput> {
    const endpoint = resolveEndpoint(this.config, request.bucket);
    const path = buildPath(this.config, request.bucket, request.key);
    const url = new URL(path, endpoint);
    url.searchParams.set("uploads", "");

    const headers: Record<string, string> = {};

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

    const signed = await this.signer.sign("POST", url, headers);

    const response = await this.transport.send({
      method: "POST",
      url: signed.url.toString(),
      headers: signed.headers,
    });

    if (!isSuccess(response)) {
      throw this.parseError(response.body.toString());
    }

    const result = xml.parseCreateMultipartUpload(response.body.toString());

    return {
      bucket: result.bucket,
      key: result.key,
      uploadId: result.uploadId,
      serverSideEncryption: getHeader(response, "x-amz-server-side-encryption"),
      sseKmsKeyId: getHeader(response, "x-amz-server-side-encryption-aws-kms-key-id"),
      requestId: getRequestId(response),
    };
  }

  /**
   * Upload a part.
   */
  async uploadPart(request: UploadPartRequest): Promise<UploadPartOutput> {
    const endpoint = resolveEndpoint(this.config, request.bucket);
    const path = buildPath(this.config, request.bucket, request.key);
    const url = new URL(path, endpoint);
    url.searchParams.set("partNumber", String(request.partNumber));
    url.searchParams.set("uploadId", request.uploadId);

    const headers: Record<string, string> = {
      "content-length": String(request.body.length),
    };

    if (request.contentMd5) {
      headers["content-md5"] = request.contentMd5;
    }

    const signed = await this.signer.sign("PUT", url, headers, request.body);

    const response = await this.transport.send({
      method: "PUT",
      url: signed.url.toString(),
      headers: signed.headers,
      body: request.body,
    });

    if (!isSuccess(response)) {
      throw this.parseError(response.body.toString());
    }

    return {
      eTag: getETag(response) ?? "",
      serverSideEncryption: getHeader(response, "x-amz-server-side-encryption"),
      requestId: getRequestId(response),
    };
  }

  /**
   * Complete a multipart upload.
   */
  async complete(
    bucket: string,
    key: string,
    uploadId: string,
    parts: CompletedPart[]
  ): Promise<CompleteMultipartUploadOutput> {
    const endpoint = resolveEndpoint(this.config, bucket);
    const path = buildPath(this.config, bucket, key);
    const url = new URL(path, endpoint);
    url.searchParams.set("uploadId", uploadId);

    const body = xml.buildCompleteMultipartXml(parts);
    const bodyBuffer = Buffer.from(body);

    const headers: Record<string, string> = {
      "content-type": "application/xml",
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

    const result = xml.parseCompleteMultipartUpload(response.body.toString());

    return {
      bucket: result.bucket,
      key: result.key,
      eTag: result.eTag,
      location: result.location,
      versionId: getHeader(response, "x-amz-version-id"),
      serverSideEncryption: getHeader(response, "x-amz-server-side-encryption"),
      sseKmsKeyId: getHeader(response, "x-amz-server-side-encryption-aws-kms-key-id"),
      requestId: getRequestId(response),
    };
  }

  /**
   * Abort a multipart upload.
   */
  async abort(bucket: string, key: string, uploadId: string): Promise<void> {
    const endpoint = resolveEndpoint(this.config, bucket);
    const path = buildPath(this.config, bucket, key);
    const url = new URL(path, endpoint);
    url.searchParams.set("uploadId", uploadId);

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
  }

  /**
   * List parts of an upload.
   */
  async listParts(request: ListPartsRequest): Promise<ListPartsOutput> {
    const endpoint = resolveEndpoint(this.config, request.bucket);
    const path = buildPath(this.config, request.bucket, request.key);
    const url = new URL(path, endpoint);
    url.searchParams.set("uploadId", request.uploadId);

    if (request.maxParts) {
      url.searchParams.set("max-parts", String(request.maxParts));
    }
    if (request.partNumberMarker) {
      url.searchParams.set("part-number-marker", String(request.partNumberMarker));
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

    const result = xml.parseListParts(response.body.toString());

    return {
      bucket: result.bucket,
      key: result.key,
      uploadId: result.uploadId,
      partNumberMarker: result.partNumberMarker,
      nextPartNumberMarker: result.nextPartNumberMarker,
      maxParts: result.maxParts,
      isTruncated: result.isTruncated,
      parts: result.parts,
      initiator: result.initiator,
      owner: result.owner,
      storageClass: result.storageClass,
      requestId: getRequestId(response),
    };
  }

  /**
   * List in-progress multipart uploads.
   */
  async listUploads(request: ListMultipartUploadsRequest): Promise<ListMultipartUploadsOutput> {
    const endpoint = resolveEndpoint(this.config, request.bucket);
    const path = buildPath(this.config, request.bucket);
    const url = new URL(path, endpoint);
    url.searchParams.set("uploads", "");

    if (request.prefix) {
      url.searchParams.set("prefix", request.prefix);
    }
    if (request.delimiter) {
      url.searchParams.set("delimiter", request.delimiter);
    }
    if (request.keyMarker) {
      url.searchParams.set("key-marker", request.keyMarker);
    }
    if (request.uploadIdMarker) {
      url.searchParams.set("upload-id-marker", request.uploadIdMarker);
    }
    if (request.maxUploads) {
      url.searchParams.set("max-uploads", String(request.maxUploads));
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

    const result = xml.parseListMultipartUploads(response.body.toString());

    return {
      bucket: result.bucket,
      prefix: result.prefix,
      delimiter: result.delimiter,
      keyMarker: result.keyMarker,
      uploadIdMarker: result.uploadIdMarker,
      nextKeyMarker: result.nextKeyMarker,
      nextUploadIdMarker: result.nextUploadIdMarker,
      maxUploads: result.maxUploads,
      isTruncated: result.isTruncated,
      uploads: result.uploads,
      commonPrefixes: result.commonPrefixes,
      requestId: getRequestId(response),
    };
  }

  /**
   * High-level multipart upload helper.
   */
  async upload(
    bucket: string,
    key: string,
    data: Buffer,
    contentType?: string
  ): Promise<CompleteMultipartUploadOutput> {
    const partSize = this.config.multipartPartSize ?? 8 * 1024 * 1024;

    // Create upload
    const createOutput = await this.create({
      bucket,
      key,
      contentType,
    });

    const uploadId = createOutput.uploadId;
    const parts: CompletedPart[] = [];

    try {
      // Upload parts
      let offset = 0;
      let partNumber = 1;

      while (offset < data.length) {
        const end = Math.min(offset + partSize, data.length);
        const partData = data.subarray(offset, end);

        const partOutput = await this.uploadPart({
          bucket,
          key,
          uploadId,
          partNumber,
          body: Buffer.from(partData),
        });

        parts.push({
          partNumber,
          eTag: partOutput.eTag,
        });

        offset = end;
        partNumber++;
      }

      // Complete upload
      return await this.complete(bucket, key, uploadId, parts);
    } catch (error) {
      // Abort on failure
      await this.abort(bucket, key, uploadId).catch(() => {});
      throw error;
    }
  }

  private parseError(body: string): S3Error {
    if (!body) {
      return new S3Error("Empty error response", "UnknownError");
    }
    const errorResponse = xml.parseErrorResponse(body);
    return mapS3ErrorCode(errorResponse.code, errorResponse);
  }
}

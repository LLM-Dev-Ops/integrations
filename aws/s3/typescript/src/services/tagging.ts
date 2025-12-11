/**
 * Tagging Service
 *
 * S3 object and bucket tagging operations.
 */

import { S3Config, resolveEndpoint, buildPath } from "../config";
import { S3Error, mapS3ErrorCode } from "../error";
import { AwsSignerV4 } from "../signing";
import { HttpTransport, isSuccess, getHeader, getRequestId } from "../transport";
import {
  GetObjectTaggingRequest,
  PutObjectTaggingRequest,
  GetBucketTaggingRequest,
  PutBucketTaggingRequest,
  DeleteBucketTaggingRequest,
} from "../types/requests";
import {
  GetObjectTaggingOutput,
  PutObjectTaggingOutput,
  GetBucketTaggingOutput,
  PutBucketTaggingOutput,
  DeleteBucketTaggingOutput,
} from "../types/responses";
import * as xml from "../xml";
import * as crypto from "crypto";

/**
 * Tagging service for S3 object and bucket tagging operations.
 */
export class TaggingService {
  private config: S3Config;
  private transport: HttpTransport;
  private signer: AwsSignerV4;

  constructor(config: S3Config, transport: HttpTransport, signer: AwsSignerV4) {
    this.config = config;
    this.transport = transport;
    this.signer = signer;
  }

  // =============================================
  // Object Tagging Operations
  // =============================================

  /**
   * Get object tagging.
   */
  async getObjectTagging(request: GetObjectTaggingRequest): Promise<GetObjectTaggingOutput> {
    const endpoint = resolveEndpoint(this.config, request.bucket);
    const path = buildPath(this.config, request.bucket, request.key);
    const url = new URL(path, endpoint);
    url.searchParams.set("tagging", "");

    if (request.versionId) {
      url.searchParams.set("versionId", request.versionId);
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

    const result = xml.parseGetObjectTagging(response.body.toString());

    return {
      versionId: getHeader(response, "x-amz-version-id"),
      tags: result.tags,
      requestId: getRequestId(response),
    };
  }

  /**
   * Put object tagging.
   */
  async putObjectTagging(request: PutObjectTaggingRequest): Promise<PutObjectTaggingOutput> {
    const endpoint = resolveEndpoint(this.config, request.bucket);
    const path = buildPath(this.config, request.bucket, request.key);
    const url = new URL(path, endpoint);
    url.searchParams.set("tagging", "");

    if (request.versionId) {
      url.searchParams.set("versionId", request.versionId);
    }

    const body = xml.buildPutTaggingXml(request.tags);
    const bodyBuffer = Buffer.from(body);
    const contentMd5 = crypto.createHash("md5").update(bodyBuffer).digest("base64");

    const headers: Record<string, string> = {
      "content-type": "application/xml",
      "content-md5": contentMd5,
      "content-length": String(bodyBuffer.length),
    };

    const signed = await this.signer.sign("PUT", url, headers, bodyBuffer);

    const response = await this.transport.send({
      method: "PUT",
      url: signed.url.toString(),
      headers: signed.headers,
      body: bodyBuffer,
    });

    if (!isSuccess(response)) {
      throw this.parseError(response.body.toString());
    }

    return {
      versionId: getHeader(response, "x-amz-version-id"),
      requestId: getRequestId(response),
    };
  }

  /**
   * Delete object tagging.
   */
  async deleteObjectTagging(bucket: string, key: string, versionId?: string): Promise<void> {
    const endpoint = resolveEndpoint(this.config, bucket);
    const path = buildPath(this.config, bucket, key);
    const url = new URL(path, endpoint);
    url.searchParams.set("tagging", "");

    if (versionId) {
      url.searchParams.set("versionId", versionId);
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
  }

  // =============================================
  // Bucket Tagging Operations
  // =============================================

  /**
   * Get bucket tagging.
   */
  async getBucketTagging(request: GetBucketTaggingRequest): Promise<GetBucketTaggingOutput> {
    const endpoint = resolveEndpoint(this.config, request.bucket);
    const path = buildPath(this.config, request.bucket);
    const url = new URL(path, endpoint);
    url.searchParams.set("tagging", "");

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

    const result = xml.parseGetObjectTagging(response.body.toString()); // Same format

    return {
      tags: result.tags,
      requestId: getRequestId(response),
    };
  }

  /**
   * Put bucket tagging.
   */
  async putBucketTagging(request: PutBucketTaggingRequest): Promise<PutBucketTaggingOutput> {
    const endpoint = resolveEndpoint(this.config, request.bucket);
    const path = buildPath(this.config, request.bucket);
    const url = new URL(path, endpoint);
    url.searchParams.set("tagging", "");

    const body = xml.buildPutTaggingXml(request.tags);
    const bodyBuffer = Buffer.from(body);
    const contentMd5 = crypto.createHash("md5").update(bodyBuffer).digest("base64");

    const headers: Record<string, string> = {
      "content-type": "application/xml",
      "content-md5": contentMd5,
      "content-length": String(bodyBuffer.length),
    };

    const signed = await this.signer.sign("PUT", url, headers, bodyBuffer);

    const response = await this.transport.send({
      method: "PUT",
      url: signed.url.toString(),
      headers: signed.headers,
      body: bodyBuffer,
    });

    if (!isSuccess(response)) {
      throw this.parseError(response.body.toString());
    }

    return {
      requestId: getRequestId(response),
    };
  }

  /**
   * Delete bucket tagging.
   */
  async deleteBucketTagging(
    request: DeleteBucketTaggingRequest
  ): Promise<DeleteBucketTaggingOutput> {
    const endpoint = resolveEndpoint(this.config, request.bucket);
    const path = buildPath(this.config, request.bucket);
    const url = new URL(path, endpoint);
    url.searchParams.set("tagging", "");

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

/**
 * Buckets Service
 *
 * S3 bucket operations: create, delete, head, list, getLocation.
 */

import { S3Config, resolveEndpoint, buildPath } from "../config";
import { S3Error, mapS3ErrorCode } from "../error";
import { AwsSignerV4 } from "../signing";
import { HttpTransport, isSuccess, getHeader, getRequestId } from "../transport";
import {
  CreateBucketRequest,
  DeleteBucketRequest,
  HeadBucketRequest,
} from "../types/requests";
import {
  CreateBucketOutput,
  HeadBucketOutput,
  ListBucketsOutput,
  GetBucketLocationOutput,
} from "../types/responses";
import * as xml from "../xml";

/**
 * Buckets service for S3 bucket operations.
 */
export class BucketsService {
  private config: S3Config;
  private transport: HttpTransport;
  private signer: AwsSignerV4;

  constructor(config: S3Config, transport: HttpTransport, signer: AwsSignerV4) {
    this.config = config;
    this.transport = transport;
    this.signer = signer;
  }

  /**
   * Create a new bucket.
   */
  async create(request: CreateBucketRequest): Promise<CreateBucketOutput> {
    const endpoint = resolveEndpoint(this.config, request.bucket);
    const path = buildPath(this.config, request.bucket);
    const url = new URL(path, endpoint);

    const headers: Record<string, string> = {};

    if (request.acl) {
      headers["x-amz-acl"] = request.acl;
    }
    if (request.grantRead) {
      headers["x-amz-grant-read"] = request.grantRead;
    }
    if (request.grantWrite) {
      headers["x-amz-grant-write"] = request.grantWrite;
    }
    if (request.grantFullControl) {
      headers["x-amz-grant-full-control"] = request.grantFullControl;
    }
    if (request.objectLockEnabled) {
      headers["x-amz-bucket-object-lock-enabled"] = "true";
    }

    let body: Buffer | undefined;

    // Only include location constraint if not us-east-1
    if (request.locationConstraint && request.locationConstraint !== "us-east-1") {
      const xmlBody = xml.buildCreateBucketXml(request.locationConstraint);
      body = Buffer.from(xmlBody);
      headers["content-type"] = "application/xml";
      headers["content-length"] = String(body.length);
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
      location: getHeader(response, "location"),
      requestId: getRequestId(response),
    };
  }

  /**
   * Delete a bucket.
   */
  async delete(request: DeleteBucketRequest): Promise<void> {
    const endpoint = resolveEndpoint(this.config, request.bucket);
    const path = buildPath(this.config, request.bucket);
    const url = new URL(path, endpoint);

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
   * Check if a bucket exists and is accessible.
   */
  async head(request: HeadBucketRequest): Promise<HeadBucketOutput> {
    const endpoint = resolveEndpoint(this.config, request.bucket);
    const path = buildPath(this.config, request.bucket);
    const url = new URL(path, endpoint);

    const headers: Record<string, string> = {};

    const signed = await this.signer.sign("HEAD", url, headers);

    const response = await this.transport.send({
      method: "HEAD",
      url: signed.url.toString(),
      headers: signed.headers,
    });

    if (!isSuccess(response)) {
      throw this.parseError(response.body.toString());
    }

    return {
      bucketRegion: getHeader(response, "x-amz-bucket-region"),
      accessPointAlias: getHeader(response, "x-amz-access-point-alias") === "true",
      requestId: getRequestId(response),
    };
  }

  /**
   * List all buckets owned by the authenticated sender.
   */
  async list(): Promise<ListBucketsOutput> {
    const endpoint = this.config.endpoint
      ? this.config.endpoint
      : `https://s3.${this.config.region}.amazonaws.com`;
    const url = new URL("/", endpoint);

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

    const result = xml.parseListBuckets(response.body.toString());

    return {
      owner: result.owner,
      buckets: result.buckets,
      requestId: getRequestId(response),
    };
  }

  /**
   * Get bucket location (region).
   */
  async getLocation(bucket: string): Promise<GetBucketLocationOutput> {
    const endpoint = resolveEndpoint(this.config, bucket);
    const path = buildPath(this.config, bucket);
    const url = new URL(path, endpoint);
    url.searchParams.set("location", "");

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

    const location = xml.parseGetBucketLocation(response.body.toString());

    return {
      location: location || "us-east-1", // Empty means us-east-1
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

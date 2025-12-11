/**
 * Presign Service
 *
 * Generate presigned URLs for S3 operations.
 */

import { S3Config, resolveEndpoint, buildPath } from "../config";
import { AwsSignerV4 } from "../signing";
import { PresignGetRequest, PresignPutRequest, PresignDeleteRequest } from "../types/requests";
import { PresignedUrl } from "../types/responses";

/**
 * Presign service for generating presigned URLs.
 */
export class PresignService {
  private config: S3Config;
  private signer: AwsSignerV4;

  constructor(config: S3Config, signer: AwsSignerV4) {
    this.config = config;
    this.signer = signer;
  }

  /**
   * Generate a presigned GET URL.
   */
  async presignGet(request: PresignGetRequest): Promise<PresignedUrl> {
    return this.presign("GET", request.bucket, request.key, request.expiresIn, {
      versionId: request.versionId,
      responseContentType: request.responseContentType,
      responseContentDisposition: request.responseContentDisposition,
    });
  }

  /**
   * Generate a presigned PUT URL.
   */
  async presignPut(request: PresignPutRequest): Promise<PresignedUrl> {
    const headers: Record<string, string> = {};

    if (request.contentType) {
      headers["content-type"] = request.contentType;
    }
    if (request.storageClass) {
      headers["x-amz-storage-class"] = request.storageClass;
    }

    return this.presign("PUT", request.bucket, request.key, request.expiresIn, {}, headers);
  }

  /**
   * Generate a presigned DELETE URL.
   */
  async presignDelete(request: PresignDeleteRequest): Promise<PresignedUrl> {
    return this.presign("DELETE", request.bucket, request.key, request.expiresIn, {
      versionId: request.versionId,
    });
  }

  /**
   * Generate a presigned HEAD URL.
   */
  async presignHead(bucket: string, key: string, expiresIn: number): Promise<PresignedUrl> {
    return this.presign("HEAD", bucket, key, expiresIn);
  }

  private async presign(
    method: string,
    bucket: string,
    key: string,
    expiresIn: number,
    queryParams?: Record<string, string | undefined>,
    headers?: Record<string, string>
  ): Promise<PresignedUrl> {
    // Validate expiration (max 7 days)
    const maxExpiration = 7 * 24 * 60 * 60;
    if (expiresIn > maxExpiration) {
      expiresIn = maxExpiration;
    }

    const endpoint = resolveEndpoint(this.config, bucket);
    const path = buildPath(this.config, bucket, key);
    const url = new URL(path, endpoint);

    // Add query parameters
    if (queryParams) {
      for (const [key, value] of Object.entries(queryParams)) {
        if (value !== undefined) {
          if (key === "responseContentType") {
            url.searchParams.set("response-content-type", value);
          } else if (key === "responseContentDisposition") {
            url.searchParams.set("response-content-disposition", value);
          } else if (key === "versionId") {
            url.searchParams.set("versionId", value);
          }
        }
      }
    }

    const presignedUrl = await this.signer.presign(method, url, headers ?? {}, expiresIn);

    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    return {
      url: presignedUrl.toString(),
      method,
      expiresAt,
      signedHeaders: headers ?? {},
    };
  }
}

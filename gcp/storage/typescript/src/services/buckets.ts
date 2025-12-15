/**
 * Buckets Service
 *
 * GCS bucket operations: list, get.
 * Following the SPARC specification.
 */

import { GcsConfig, resolveEndpoint, validateBucketName } from "../config/index.js";
import { parseGcsError } from "../error/index.js";
import { GcpAuthProvider } from "../credentials/index.js";
import { HttpTransport, isSuccess, getRequestId } from "../transport/index.js";
import { ListBucketsRequest, GetBucketRequest } from "../types/requests.js";
import { BucketMetadata, parseBucketMetadata } from "../types/common.js";
import { ListBucketsResponse } from "../types/responses.js";

/**
 * Buckets service for GCS bucket operations.
 */
export class BucketsService {
  private config: GcsConfig;
  private transport: HttpTransport;
  private authProvider: GcpAuthProvider;

  constructor(config: GcsConfig, transport: HttpTransport, authProvider: GcpAuthProvider) {
    this.config = config;
    this.transport = transport;
    this.authProvider = authProvider;
  }

  /**
   * List accessible buckets.
   */
  async list(request?: ListBucketsRequest): Promise<ListBucketsResponse> {
    const endpoint = resolveEndpoint(this.config);
    const token = await this.authProvider.getAccessToken();
    const projectId = request?.projectId ?? this.config.projectId;

    // Build URL with query parameters
    const params = new URLSearchParams({
      project: projectId,
    });
    if (request?.maxResults) {
      params.set("maxResults", String(request.maxResults));
    }
    if (request?.pageToken) {
      params.set("pageToken", request.pageToken);
    }
    if (request?.prefix) {
      params.set("prefix", request.prefix);
    }

    const url = `${endpoint}/storage/v1/b?${params.toString()}`;

    const response = await this.transport.send({
      method: "GET",
      url,
      headers: {
        Authorization: `Bearer ${token}`,
      },
      timeout: this.config.timeout,
    });

    if (!isSuccess(response)) {
      throw parseGcsError(response.status, response.body.toString(), getRequestId(response));
    }

    const json = JSON.parse(response.body.toString());

    return {
      items: (json.items ?? []).map(parseBucketMetadata),
      nextPageToken: json.nextPageToken,
    };
  }

  /**
   * List all buckets with automatic pagination.
   */
  async *listAll(request?: ListBucketsRequest): AsyncIterable<BucketMetadata> {
    let pageToken: string | undefined;

    do {
      const response = await this.list({
        projectId: request?.projectId ?? this.config.projectId,
        maxResults: request?.maxResults,
        prefix: request?.prefix,
        pageToken,
      });

      for (const item of response.items) {
        yield item;
      }

      pageToken = response.nextPageToken;
    } while (pageToken);
  }

  /**
   * Get bucket metadata.
   */
  async get(request: GetBucketRequest): Promise<BucketMetadata> {
    validateBucketName(request.bucket);

    const endpoint = resolveEndpoint(this.config);
    const token = await this.authProvider.getAccessToken();

    const url = `${endpoint}/storage/v1/b/${request.bucket}`;

    const response = await this.transport.send({
      method: "GET",
      url,
      headers: {
        Authorization: `Bearer ${token}`,
      },
      timeout: this.config.timeout,
    });

    if (!isSuccess(response)) {
      throw parseGcsError(response.status, response.body.toString(), getRequestId(response));
    }

    const json = JSON.parse(response.body.toString());
    return parseBucketMetadata(json);
  }

  /**
   * Check if a bucket exists and is accessible.
   */
  async exists(bucket: string): Promise<boolean> {
    try {
      await this.get({ bucket });
      return true;
    } catch (error) {
      if (error instanceof Error && error.message.includes("NotFound")) {
        return false;
      }
      throw error;
    }
  }
}

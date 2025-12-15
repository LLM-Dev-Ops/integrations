/**
 * Objects Service
 *
 * GCS object operations: insert, get, delete, copy, compose, list, patch.
 * Following the SPARC specification.
 */

import { GcsConfig, resolveEndpoint, encodeObjectName, validateBucketName, validateObjectName } from "../config/index.js";
import { GcsError, parseGcsError } from "../error/index.js";
import { GcpAuthProvider } from "../credentials/index.js";
import { HttpTransport, isSuccess, getHeader, getRequestId } from "../transport/index.js";
import {
  InsertObjectRequest,
  GetObjectRequest,
  GetMetadataRequest,
  DeleteObjectRequest,
  CopyObjectRequest,
  ComposeObjectsRequest,
  ListObjectsRequest,
  PatchObjectRequest,
} from "../types/requests.js";
import {
  ObjectMetadata,
  GcsObject,
  parseObjectMetadata,
} from "../types/common.js";
import { ListObjectsResponse } from "../types/responses.js";

/**
 * Objects service for GCS object operations.
 */
export class ObjectsService {
  private config: GcsConfig;
  private transport: HttpTransport;
  private authProvider: GcpAuthProvider;

  constructor(config: GcsConfig, transport: HttpTransport, authProvider: GcpAuthProvider) {
    this.config = config;
    this.transport = transport;
    this.authProvider = authProvider;
  }

  /**
   * Insert (upload) an object.
   */
  async insert(request: InsertObjectRequest): Promise<ObjectMetadata> {
    validateBucketName(request.bucket);
    validateObjectName(request.name);

    const endpoint = resolveEndpoint(this.config);
    const token = await this.authProvider.getAccessToken();

    // Build URL with query parameters
    const params = new URLSearchParams({
      uploadType: "media",
      name: request.name,
    });
    if (request.ifGenerationMatch) {
      params.set("ifGenerationMatch", request.ifGenerationMatch);
    }
    if (request.ifGenerationNotMatch) {
      params.set("ifGenerationNotMatch", request.ifGenerationNotMatch);
    }
    if (request.ifMetagenerationMatch) {
      params.set("ifMetagenerationMatch", request.ifMetagenerationMatch);
    }
    if (request.predefinedAcl) {
      params.set("predefinedAcl", request.predefinedAcl);
    }

    const url = `${endpoint}/upload/storage/v1/b/${request.bucket}/o?${params.toString()}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "Content-Type": request.contentType ?? "application/octet-stream",
      "Content-Length": String(request.data.length),
    };

    if (request.contentEncoding) {
      headers["Content-Encoding"] = request.contentEncoding;
    }
    if (request.contentDisposition) {
      headers["Content-Disposition"] = request.contentDisposition;
    }
    if (request.cacheControl) {
      headers["Cache-Control"] = request.cacheControl;
    }

    // Add custom metadata
    if (request.metadata) {
      for (const [key, value] of Object.entries(request.metadata)) {
        headers[`x-goog-meta-${key}`] = value;
      }
    }

    const response = await this.transport.send({
      method: "POST",
      url,
      headers,
      body: request.data,
      timeout: this.config.timeout,
    });

    if (!isSuccess(response)) {
      throw parseGcsError(response.status, response.body.toString(), getRequestId(response));
    }

    const json = JSON.parse(response.body.toString());
    return parseObjectMetadata(json);
  }

  /**
   * Get (download) an object.
   */
  async get(request: GetObjectRequest): Promise<GcsObject> {
    validateBucketName(request.bucket);
    validateObjectName(request.object);

    const endpoint = resolveEndpoint(this.config);
    const token = await this.authProvider.getAccessToken();
    const encodedName = encodeObjectName(request.object);

    // Build URL with query parameters
    const params = new URLSearchParams({
      alt: "media",
    });
    if (request.generation) {
      params.set("generation", request.generation);
    }
    if (request.ifGenerationMatch) {
      params.set("ifGenerationMatch", request.ifGenerationMatch);
    }
    if (request.ifGenerationNotMatch) {
      params.set("ifGenerationNotMatch", request.ifGenerationNotMatch);
    }
    if (request.ifMetagenerationMatch) {
      params.set("ifMetagenerationMatch", request.ifMetagenerationMatch);
    }

    const url = `${endpoint}/storage/v1/b/${request.bucket}/o/${encodedName}?${params.toString()}`;

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

    // Get metadata from headers
    const metadata: ObjectMetadata = {
      name: request.object,
      bucket: request.bucket,
      generation: getHeader(response, "x-goog-generation") ?? "",
      metageneration: getHeader(response, "x-goog-metageneration") ?? "",
      contentType: getHeader(response, "content-type") ?? "application/octet-stream",
      size: response.body.length,
      md5Hash: getHeader(response, "x-goog-hash")?.match(/md5=([^,]+)/)?.[1],
      crc32c: getHeader(response, "x-goog-hash")?.match(/crc32c=([^,]+)/)?.[1],
      etag: getHeader(response, "etag") ?? "",
      timeCreated: new Date(),
      updated: new Date(),
      storageClass: "STANDARD" as any,
      metadata: this.extractCustomMetadata(response.headers),
      selfLink: "",
      mediaLink: url,
    };

    return {
      metadata,
      data: response.body,
    };
  }

  /**
   * Get object metadata only (HEAD-like operation).
   */
  async getMetadata(request: GetMetadataRequest): Promise<ObjectMetadata> {
    validateBucketName(request.bucket);
    validateObjectName(request.object);

    const endpoint = resolveEndpoint(this.config);
    const token = await this.authProvider.getAccessToken();
    const encodedName = encodeObjectName(request.object);

    // Build URL with query parameters
    const params = new URLSearchParams();
    if (request.generation) {
      params.set("generation", request.generation);
    }
    if (request.ifGenerationMatch) {
      params.set("ifGenerationMatch", request.ifGenerationMatch);
    }

    let url = `${endpoint}/storage/v1/b/${request.bucket}/o/${encodedName}`;
    if (params.toString()) {
      url += `?${params.toString()}`;
    }

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
    return parseObjectMetadata(json);
  }

  /**
   * Delete an object.
   */
  async delete(request: DeleteObjectRequest): Promise<void> {
    validateBucketName(request.bucket);
    validateObjectName(request.object);

    const endpoint = resolveEndpoint(this.config);
    const token = await this.authProvider.getAccessToken();
    const encodedName = encodeObjectName(request.object);

    // Build URL with query parameters
    const params = new URLSearchParams();
    if (request.generation) {
      params.set("generation", request.generation);
    }
    if (request.ifGenerationMatch) {
      params.set("ifGenerationMatch", request.ifGenerationMatch);
    }
    if (request.ifMetagenerationMatch) {
      params.set("ifMetagenerationMatch", request.ifMetagenerationMatch);
    }

    let url = `${endpoint}/storage/v1/b/${request.bucket}/o/${encodedName}`;
    if (params.toString()) {
      url += `?${params.toString()}`;
    }

    const response = await this.transport.send({
      method: "DELETE",
      url,
      headers: {
        Authorization: `Bearer ${token}`,
      },
      timeout: this.config.timeout,
    });

    // 204 No Content is success for delete
    if (response.status !== 204 && !isSuccess(response)) {
      throw parseGcsError(response.status, response.body.toString(), getRequestId(response));
    }
  }

  /**
   * Copy an object.
   */
  async copy(request: CopyObjectRequest): Promise<ObjectMetadata> {
    validateBucketName(request.sourceBucket);
    validateObjectName(request.sourceObject);
    validateBucketName(request.destinationBucket);
    validateObjectName(request.destinationObject);

    const endpoint = resolveEndpoint(this.config);
    const token = await this.authProvider.getAccessToken();
    const encodedSrcName = encodeObjectName(request.sourceObject);
    const encodedDstName = encodeObjectName(request.destinationObject);

    // Build URL with query parameters
    const params = new URLSearchParams();
    if (request.sourceGeneration) {
      params.set("sourceGeneration", request.sourceGeneration);
    }
    if (request.ifGenerationMatch) {
      params.set("ifGenerationMatch", request.ifGenerationMatch);
    }
    if (request.ifSourceGenerationMatch) {
      params.set("ifSourceGenerationMatch", request.ifSourceGenerationMatch);
    }

    let url = `${endpoint}/storage/v1/b/${request.sourceBucket}/o/${encodedSrcName}/copyTo/b/${request.destinationBucket}/o/${encodedDstName}`;
    if (params.toString()) {
      url += `?${params.toString()}`;
    }

    const body: Record<string, unknown> = {};
    if (request.metadata) {
      body.metadata = request.metadata;
    }
    if (request.contentType) {
      body.contentType = request.contentType;
    }

    const response = await this.transport.send({
      method: "POST",
      url,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      timeout: this.config.timeout,
    });

    if (!isSuccess(response)) {
      throw parseGcsError(response.status, response.body.toString(), getRequestId(response));
    }

    const json = JSON.parse(response.body.toString());
    return parseObjectMetadata(json);
  }

  /**
   * Compose multiple objects into one.
   */
  async compose(request: ComposeObjectsRequest): Promise<ObjectMetadata> {
    validateBucketName(request.bucket);
    validateObjectName(request.destinationObject);

    if (request.sourceObjects.length === 0) {
      throw new GcsError("At least one source object is required", "InvalidRequest");
    }
    if (request.sourceObjects.length > 32) {
      throw new GcsError("Maximum 32 source objects allowed", "InvalidRequest");
    }

    for (const src of request.sourceObjects) {
      validateObjectName(src.name);
    }

    const endpoint = resolveEndpoint(this.config);
    const token = await this.authProvider.getAccessToken();
    const encodedDstName = encodeObjectName(request.destinationObject);

    // Build URL with query parameters
    const params = new URLSearchParams();
    if (request.ifGenerationMatch) {
      params.set("ifGenerationMatch", request.ifGenerationMatch);
    }

    let url = `${endpoint}/storage/v1/b/${request.bucket}/o/${encodedDstName}/compose`;
    if (params.toString()) {
      url += `?${params.toString()}`;
    }

    // Build request body
    const sourceObjects = request.sourceObjects.map((src) => {
      const obj: Record<string, unknown> = { name: src.name };
      if (src.generation) {
        obj.generation = src.generation;
      }
      return obj;
    });

    const body: Record<string, unknown> = {
      sourceObjects,
      destination: {
        contentType: request.contentType ?? "application/octet-stream",
      },
    };
    if (request.metadata) {
      (body.destination as Record<string, unknown>).metadata = request.metadata;
    }

    const response = await this.transport.send({
      method: "POST",
      url,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      timeout: this.config.timeout,
    });

    if (!isSuccess(response)) {
      throw parseGcsError(response.status, response.body.toString(), getRequestId(response));
    }

    const json = JSON.parse(response.body.toString());
    return parseObjectMetadata(json);
  }

  /**
   * List objects in a bucket.
   */
  async list(request: ListObjectsRequest): Promise<ListObjectsResponse> {
    validateBucketName(request.bucket);

    const endpoint = resolveEndpoint(this.config);
    const token = await this.authProvider.getAccessToken();

    // Build URL with query parameters
    const params = new URLSearchParams();
    if (request.prefix) {
      params.set("prefix", request.prefix);
    }
    if (request.delimiter) {
      params.set("delimiter", request.delimiter);
    }
    if (request.maxResults) {
      params.set("maxResults", String(request.maxResults));
    }
    if (request.pageToken) {
      params.set("pageToken", request.pageToken);
    }
    if (request.versions) {
      params.set("versions", "true");
    }
    if (request.startOffset) {
      params.set("startOffset", request.startOffset);
    }
    if (request.endOffset) {
      params.set("endOffset", request.endOffset);
    }
    if (request.includeTrailingDelimiter) {
      params.set("includeTrailingDelimiter", "true");
    }

    const url = `${endpoint}/storage/v1/b/${request.bucket}/o?${params.toString()}`;

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
      items: (json.items ?? []).map(parseObjectMetadata),
      prefixes: json.prefixes ?? [],
      nextPageToken: json.nextPageToken,
    };
  }

  /**
   * List all objects with automatic pagination.
   */
  async *listAll(request: ListObjectsRequest): AsyncIterable<ObjectMetadata> {
    let pageToken: string | undefined;

    do {
      const response = await this.list({
        ...request,
        pageToken,
      });

      for (const item of response.items) {
        yield item;
      }

      pageToken = response.nextPageToken;
    } while (pageToken);
  }

  /**
   * Update object metadata.
   */
  async patch(request: PatchObjectRequest): Promise<ObjectMetadata> {
    validateBucketName(request.bucket);
    validateObjectName(request.object);

    const endpoint = resolveEndpoint(this.config);
    const token = await this.authProvider.getAccessToken();
    const encodedName = encodeObjectName(request.object);

    // Build URL with query parameters
    const params = new URLSearchParams();
    if (request.generation) {
      params.set("generation", request.generation);
    }
    if (request.ifMetagenerationMatch) {
      params.set("ifMetagenerationMatch", request.ifMetagenerationMatch);
    }

    let url = `${endpoint}/storage/v1/b/${request.bucket}/o/${encodedName}`;
    if (params.toString()) {
      url += `?${params.toString()}`;
    }

    // Build request body
    const body: Record<string, unknown> = {};
    if (request.metadata) {
      body.metadata = request.metadata;
    }
    if (request.contentType) {
      body.contentType = request.contentType;
    }
    if (request.cacheControl) {
      body.cacheControl = request.cacheControl;
    }
    if (request.contentDisposition) {
      body.contentDisposition = request.contentDisposition;
    }
    if (request.contentEncoding) {
      body.contentEncoding = request.contentEncoding;
    }

    const response = await this.transport.send({
      method: "PATCH",
      url,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      timeout: this.config.timeout,
    });

    if (!isSuccess(response)) {
      throw parseGcsError(response.status, response.body.toString(), getRequestId(response));
    }

    const json = JSON.parse(response.body.toString());
    return parseObjectMetadata(json);
  }

  /**
   * Extract custom metadata from response headers.
   */
  private extractCustomMetadata(headers: Record<string, string>): Record<string, string> {
    const metadata: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase().startsWith("x-goog-meta-")) {
        metadata[key.slice(12)] = value;
      }
    }
    return metadata;
  }
}

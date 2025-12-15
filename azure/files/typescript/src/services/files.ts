/**
 * Azure Files - File Service
 *
 * File operations: create, read, write, delete, get properties, set metadata.
 * Following the SPARC specification.
 */

import {
  AzureFilesConfig,
  resolveEndpoint,
  encodePath,
  validateShareName,
  validatePath,
  getTimeout,
} from "../config/index.js";
import { parseAzureFilesError } from "../errors.js";
import { AzureAuthProvider } from "../auth/index.js";
import { HttpTransport, isSuccess, getRequestId, getHeader } from "../transport/index.js";
import {
  CreateFileRequest,
  ReadFileRequest,
  WriteFileRequest,
  DeleteFileRequest,
  GetPropertiesRequest,
  SetMetadataRequest,
  CopyFileRequest,
} from "../types/requests.js";
import {
  FileInfo,
  FileContent,
  FileProperties,
  CopyStatus,
  parseFileInfo,
  parseFileProperties,
} from "../types/common.js";

/**
 * File service for Azure Files operations.
 */
export class FileService {
  private config: AzureFilesConfig;
  private transport: HttpTransport;
  private authProvider: AzureAuthProvider;

  constructor(
    config: AzureFilesConfig,
    transport: HttpTransport,
    authProvider: AzureAuthProvider
  ) {
    this.config = config;
    this.transport = transport;
    this.authProvider = authProvider;
  }

  /**
   * Create a zero-length file with specified size.
   */
  async create(request: CreateFileRequest): Promise<FileInfo> {
    validateShareName(request.share);
    validatePath(request.path);

    const endpoint = resolveEndpoint(this.config);
    const url = `${endpoint}/${request.share}/${encodePath(request.path)}`;

    const headers: Record<string, string> = {
      "x-ms-type": "file",
      "x-ms-content-length": request.size.toString(),
      "x-ms-file-attributes": "None",
      "x-ms-file-creation-time": "now",
      "x-ms-file-last-write-time": "now",
    };

    if (request.contentType) {
      headers["x-ms-content-type"] = request.contentType;
    }

    if (request.metadata) {
      for (const [key, value] of Object.entries(request.metadata)) {
        headers[`x-ms-meta-${key}`] = value;
      }
    }

    if (request.leaseId) {
      headers["x-ms-lease-id"] = request.leaseId;
    }

    const signed = this.authProvider.signRequest("PUT", url, headers, 0);

    const response = await this.transport.send({
      method: "PUT",
      url: signed.url,
      headers: signed.headers,
      timeout: getTimeout(this.config, "write"),
    });

    if (!isSuccess(response)) {
      throw parseAzureFilesError(
        response.status,
        response.body.toString(),
        response.headers,
        getRequestId(response)
      );
    }

    return parseFileInfo(request.share, request.path, response.headers);
  }

  /**
   * Read a file (full or partial).
   */
  async read(request: ReadFileRequest): Promise<FileContent> {
    validateShareName(request.share);
    validatePath(request.path);

    const endpoint = resolveEndpoint(this.config);
    const url = `${endpoint}/${request.share}/${encodePath(request.path)}`;

    const headers: Record<string, string> = {};

    if (request.range) {
      headers["Range"] = `bytes=${request.range.start}-${request.range.end}`;
    }

    if (request.leaseId) {
      headers["x-ms-lease-id"] = request.leaseId;
    }

    const signed = this.authProvider.signRequest("GET", url, headers);

    const response = await this.transport.send({
      method: "GET",
      url: signed.url,
      headers: signed.headers,
      timeout: getTimeout(this.config, "read", request.range?.end),
    });

    if (!isSuccess(response)) {
      throw parseAzureFilesError(
        response.status,
        response.body.toString(),
        response.headers,
        getRequestId(response)
      );
    }

    return {
      data: response.body,
      properties: parseFileProperties(response.headers),
      etag: getHeader(response, "etag") ?? "",
    };
  }

  /**
   * Write data to a file (creates ranges).
   */
  async write(request: WriteFileRequest): Promise<void> {
    validateShareName(request.share);
    validatePath(request.path);

    const data = request.data;
    const offset = request.offset ?? 0;

    // For small files, use single put range
    if (data.length <= this.config.rangeSize) {
      await this.putRange(
        request.share,
        request.path,
        offset,
        data,
        request.leaseId
      );
    } else {
      // For large files, chunk into ranges
      await this.writeChunked(request);
    }
  }

  /**
   * Write data in chunks.
   */
  private async writeChunked(request: WriteFileRequest): Promise<void> {
    const data = request.data;
    const rangeSize = this.config.rangeSize;
    let offset = request.offset ?? 0;
    let position = 0;

    while (position < data.length) {
      const end = Math.min(position + rangeSize, data.length);
      const chunk = data.subarray(position, end);

      await this.putRange(
        request.share,
        request.path,
        offset,
        chunk,
        request.leaseId
      );

      position = end;
      offset += chunk.length;
    }
  }

  /**
   * Put a range of data to a file.
   */
  private async putRange(
    share: string,
    path: string,
    offset: number,
    data: Buffer,
    leaseId?: string
  ): Promise<void> {
    const endpoint = resolveEndpoint(this.config);
    const url = `${endpoint}/${share}/${encodePath(path)}?comp=range`;

    const endOffset = offset + data.length - 1;

    const headers: Record<string, string> = {
      "x-ms-range": `bytes=${offset}-${endOffset}`,
      "x-ms-write": "update",
      "Content-Length": data.length.toString(),
    };

    if (leaseId) {
      headers["x-ms-lease-id"] = leaseId;
    }

    const signed = this.authProvider.signRequest("PUT", url, headers, data.length);

    const response = await this.transport.send({
      method: "PUT",
      url: signed.url,
      headers: signed.headers,
      body: data,
      timeout: getTimeout(this.config, "write"),
    });

    if (!isSuccess(response)) {
      throw parseAzureFilesError(
        response.status,
        response.body.toString(),
        response.headers,
        getRequestId(response)
      );
    }
  }

  /**
   * Delete a file.
   */
  async delete(request: DeleteFileRequest): Promise<void> {
    validateShareName(request.share);
    validatePath(request.path);

    const endpoint = resolveEndpoint(this.config);
    const url = `${endpoint}/${request.share}/${encodePath(request.path)}`;

    const headers: Record<string, string> = {};

    if (request.leaseId) {
      headers["x-ms-lease-id"] = request.leaseId;
    }

    const signed = this.authProvider.signRequest("DELETE", url, headers);

    const response = await this.transport.send({
      method: "DELETE",
      url: signed.url,
      headers: signed.headers,
      timeout: getTimeout(this.config, "write"),
    });

    if (!isSuccess(response)) {
      throw parseAzureFilesError(
        response.status,
        response.body.toString(),
        response.headers,
        getRequestId(response)
      );
    }
  }

  /**
   * Get file properties (HEAD).
   */
  async getProperties(request: GetPropertiesRequest): Promise<FileProperties> {
    validateShareName(request.share);
    validatePath(request.path);

    const endpoint = resolveEndpoint(this.config);
    const url = `${endpoint}/${request.share}/${encodePath(request.path)}`;

    const headers: Record<string, string> = {};

    if (request.leaseId) {
      headers["x-ms-lease-id"] = request.leaseId;
    }

    const signed = this.authProvider.signRequest("HEAD", url, headers);

    const response = await this.transport.send({
      method: "HEAD",
      url: signed.url,
      headers: signed.headers,
      timeout: getTimeout(this.config, "read"),
    });

    if (!isSuccess(response)) {
      throw parseAzureFilesError(
        response.status,
        response.body.toString(),
        response.headers,
        getRequestId(response)
      );
    }

    return parseFileProperties(response.headers);
  }

  /**
   * Set file metadata.
   */
  async setMetadata(request: SetMetadataRequest): Promise<void> {
    validateShareName(request.share);
    validatePath(request.path);

    const endpoint = resolveEndpoint(this.config);
    const url = `${endpoint}/${request.share}/${encodePath(request.path)}?comp=metadata`;

    const headers: Record<string, string> = {};

    for (const [key, value] of Object.entries(request.metadata)) {
      headers[`x-ms-meta-${key}`] = value;
    }

    if (request.leaseId) {
      headers["x-ms-lease-id"] = request.leaseId;
    }

    const signed = this.authProvider.signRequest("PUT", url, headers, 0);

    const response = await this.transport.send({
      method: "PUT",
      url: signed.url,
      headers: signed.headers,
      timeout: getTimeout(this.config, "write"),
    });

    if (!isSuccess(response)) {
      throw parseAzureFilesError(
        response.status,
        response.body.toString(),
        response.headers,
        getRequestId(response)
      );
    }
  }

  /**
   * Conditional update with ETag matching.
   */
  async writeIfMatch(
    request: WriteFileRequest,
    etag: string
  ): Promise<void> {
    validateShareName(request.share);
    validatePath(request.path);

    const data = request.data;
    const offset = request.offset ?? 0;

    const endpoint = resolveEndpoint(this.config);
    const url = `${endpoint}/${request.share}/${encodePath(request.path)}?comp=range`;

    const endOffset = offset + data.length - 1;

    const headers: Record<string, string> = {
      "x-ms-range": `bytes=${offset}-${endOffset}`,
      "x-ms-write": "update",
      "Content-Length": data.length.toString(),
      "If-Match": etag,
    };

    if (request.leaseId) {
      headers["x-ms-lease-id"] = request.leaseId;
    }

    const signed = this.authProvider.signRequest("PUT", url, headers, data.length);

    const response = await this.transport.send({
      method: "PUT",
      url: signed.url,
      headers: signed.headers,
      body: data,
      timeout: getTimeout(this.config, "write"),
    });

    if (!isSuccess(response)) {
      throw parseAzureFilesError(
        response.status,
        response.body.toString(),
        response.headers,
        getRequestId(response)
      );
    }
  }

  /**
   * Copy a file from source to destination.
   */
  async copy(request: CopyFileRequest): Promise<CopyStatus> {
    validateShareName(request.sourceShare);
    validatePath(request.sourcePath);
    validateShareName(request.destShare);
    validatePath(request.destPath);

    const endpoint = resolveEndpoint(this.config);
    const destUrl = `${endpoint}/${request.destShare}/${encodePath(request.destPath)}`;
    const sourceUrl = `${endpoint}/${request.sourceShare}/${encodePath(request.sourcePath)}`;

    const headers: Record<string, string> = {
      "x-ms-copy-source": sourceUrl,
    };

    if (request.metadata) {
      for (const [key, value] of Object.entries(request.metadata)) {
        headers[`x-ms-meta-${key}`] = value;
      }
    }

    const signed = this.authProvider.signRequest("PUT", destUrl, headers, 0);

    const response = await this.transport.send({
      method: "PUT",
      url: signed.url,
      headers: signed.headers,
      timeout: getTimeout(this.config, "write"),
    });

    if (!isSuccess(response)) {
      throw parseAzureFilesError(
        response.status,
        response.body.toString(),
        response.headers,
        getRequestId(response)
      );
    }

    // Parse copy status from response
    const copyStatus = getHeader(response, "x-ms-copy-status");
    const copyId = getHeader(response, "x-ms-copy-id");

    if (copyStatus === "success") {
      return { status: "success" };
    } else if (copyStatus === "pending" && copyId) {
      return { status: "pending", copyId };
    } else if (copyStatus === "aborted") {
      return { status: "aborted" };
    } else if (copyStatus === "failed") {
      const reason = getHeader(response, "x-ms-copy-status-description") ?? "Unknown error";
      return { status: "failed", reason };
    }

    // Default to success if no status header
    return { status: "success" };
  }

  /**
   * Get a share-bound file service for convenience.
   */
  inShare(share: string): ShareBoundFileService {
    return new ShareBoundFileService(this, share);
  }
}

/**
 * File service bound to a specific share.
 */
export class ShareBoundFileService {
  private service: FileService;
  private share: string;

  constructor(service: FileService, share: string) {
    this.service = service;
    this.share = share;
  }

  async create(path: string, size: number): Promise<FileInfo> {
    return this.service.create({ share: this.share, path, size });
  }

  async read(path: string): Promise<FileContent> {
    return this.service.read({ share: this.share, path });
  }

  async write(path: string, data: Buffer): Promise<void> {
    return this.service.write({ share: this.share, path, data });
  }

  async delete(path: string): Promise<void> {
    return this.service.delete({ share: this.share, path });
  }

  async getProperties(path: string): Promise<FileProperties> {
    return this.service.getProperties({ share: this.share, path });
  }

  async setMetadata(path: string, metadata: Record<string, string>): Promise<void> {
    return this.service.setMetadata({ share: this.share, path, metadata });
  }
}

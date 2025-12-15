/**
 * Azure Files - Directory Service
 *
 * Directory operations: create, list, delete.
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
import { HttpTransport, isSuccess, getRequestId } from "../transport/index.js";
import {
  CreateDirectoryRequest,
  DeleteDirectoryRequest,
  ListDirectoryRequest,
} from "../types/requests.js";
import {
  DirectoryInfo,
  DirectoryListing,
  DirectoryEntry,
  FileInfo,
  parseDirectoryInfo,
} from "../types/common.js";
import { FileService } from "./files.js";

/**
 * Directory service for Azure Files operations.
 */
export class DirectoryService {
  private config: AzureFilesConfig;
  private transport: HttpTransport;
  private authProvider: AzureAuthProvider;
  private fileService?: FileService;

  constructor(
    config: AzureFilesConfig,
    transport: HttpTransport,
    authProvider: AzureAuthProvider,
    fileService?: FileService
  ) {
    this.config = config;
    this.transport = transport;
    this.authProvider = authProvider;
    this.fileService = fileService;
  }

  /**
   * Create a directory.
   */
  async create(request: CreateDirectoryRequest): Promise<DirectoryInfo> {
    validateShareName(request.share);
    validatePath(request.path);

    const endpoint = resolveEndpoint(this.config);
    const url = `${endpoint}/${request.share}/${encodePath(request.path)}?restype=directory`;

    const headers: Record<string, string> = {
      "x-ms-file-attributes": "Directory",
      "x-ms-file-creation-time": "now",
      "x-ms-file-last-write-time": "now",
    };

    if (request.metadata) {
      for (const [key, value] of Object.entries(request.metadata)) {
        headers[`x-ms-meta-${key}`] = value;
      }
    }

    const signed = this.authProvider.signRequest("PUT", url, headers, 0);

    const response = await this.transport.send({
      method: "PUT",
      url: signed.url,
      headers: signed.headers,
      timeout: getTimeout(this.config, "directory"),
    });

    if (!isSuccess(response)) {
      throw parseAzureFilesError(
        response.status,
        response.body.toString(),
        response.headers,
        getRequestId(response)
      );
    }

    return parseDirectoryInfo(request.share, request.path, response.headers);
  }

  /**
   * List directory contents (single page).
   */
  async list(request: ListDirectoryRequest): Promise<DirectoryListing> {
    validateShareName(request.share);
    if (request.path) {
      validatePath(request.path);
    }

    const endpoint = resolveEndpoint(this.config);
    const basePath = request.path ? `/${encodePath(request.path)}` : "";
    const url = new URL(
      `${endpoint}/${request.share}${basePath}?restype=directory&comp=list`
    );

    if (request.prefix) {
      url.searchParams.set("prefix", request.prefix);
    }
    if (request.maxResults) {
      url.searchParams.set("maxresults", request.maxResults.toString());
    }
    if (request.marker) {
      url.searchParams.set("marker", request.marker);
    }

    const headers: Record<string, string> = {};
    const signed = this.authProvider.signRequest("GET", url.toString(), headers);

    const response = await this.transport.send({
      method: "GET",
      url: signed.url,
      headers: signed.headers,
      timeout: getTimeout(this.config, "directory"),
    });

    if (!isSuccess(response)) {
      throw parseAzureFilesError(
        response.status,
        response.body.toString(),
        response.headers,
        getRequestId(response)
      );
    }

    return this.parseListResponse(request.share, response.body.toString());
  }

  /**
   * List all directory contents with automatic pagination.
   */
  async *listAll(
    request: ListDirectoryRequest
  ): AsyncIterable<DirectoryEntry> {
    let marker: string | undefined;

    do {
      const response = await this.list({
        ...request,
        marker,
      });

      for (const entry of response.entries) {
        yield entry;
      }

      marker = response.nextMarker;
    } while (marker);
  }

  /**
   * Delete a directory.
   */
  async delete(request: DeleteDirectoryRequest): Promise<void> {
    validateShareName(request.share);
    validatePath(request.path);

    const endpoint = resolveEndpoint(this.config);
    const url = `${endpoint}/${request.share}/${encodePath(request.path)}?restype=directory`;

    const headers: Record<string, string> = {};
    const signed = this.authProvider.signRequest("DELETE", url, headers);

    const response = await this.transport.send({
      method: "DELETE",
      url: signed.url,
      headers: signed.headers,
      timeout: getTimeout(this.config, "directory"),
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
   * Delete a directory and all its contents recursively.
   * If fileService is not provided, uses the one from constructor.
   */
  async deleteRecursive(
    share: string,
    path: string,
    fileService?: FileService
  ): Promise<void> {
    validateShareName(share);
    validatePath(path);

    const fs = fileService ?? this.fileService;
    if (!fs) {
      throw new Error("FileService is required for deleteRecursive operation");
    }

    // List all contents
    const entries: DirectoryEntry[] = [];
    for await (const entry of this.listAll({ share, path })) {
      entries.push(entry);
    }

    // Delete files first
    for (const entry of entries) {
      if (entry.type === "file") {
        await fs.delete({ share, path: entry.info.path });
      }
    }

    // Delete subdirectories recursively
    for (const entry of entries) {
      if (entry.type === "directory") {
        await this.deleteRecursive(share, entry.info.path, fs);
      }
    }

    // Delete this directory
    await this.delete({ share, path });
  }

  /**
   * Parse list directory XML response.
   */
  private parseListResponse(share: string, xml: string): DirectoryListing {
    const entries: DirectoryEntry[] = [];

    // Parse files
    const fileMatches = xml.matchAll(
      /<File><Name>([^<]+)<\/Name>[\s\S]*?<Properties>([\s\S]*?)<\/Properties>[\s\S]*?<\/File>/g
    );
    for (const match of fileMatches) {
      const name = match[1] ? this.decodeXmlEntities(match[1]) : "";
      const propsXml = match[2] ?? "";

      const contentLength = this.extractXmlValue(propsXml, "Content-Length") ?? "0";
      const lastModified = this.extractXmlValue(propsXml, "Last-Modified");
      const etag = this.extractXmlValue(propsXml, "Etag") ?? "";

      const fileInfo: FileInfo = {
        share,
        path: name,
        size: parseInt(contentLength, 10),
        etag,
        lastModified: lastModified ? new Date(lastModified) : new Date(),
        metadata: {},
      };

      entries.push({ type: "file", info: fileInfo });
    }

    // Parse directories
    const dirMatches = xml.matchAll(
      /<Directory><Name>([^<]+)<\/Name>[\s\S]*?<Properties>([\s\S]*?)<\/Properties>[\s\S]*?<\/Directory>/g
    );
    for (const match of dirMatches) {
      const name = match[1] ? this.decodeXmlEntities(match[1]) : "";
      const propsXml = match[2] ?? "";

      const lastModified = this.extractXmlValue(propsXml, "Last-Modified");
      const etag = this.extractXmlValue(propsXml, "Etag") ?? "";

      const dirInfo: DirectoryInfo = {
        share,
        path: name,
        etag,
        lastModified: lastModified ? new Date(lastModified) : new Date(),
        metadata: {},
      };

      entries.push({ type: "directory", info: dirInfo });
    }

    // Parse next marker
    const nextMarkerMatch = xml.match(/<NextMarker>([^<]*)<\/NextMarker>/);
    const nextMarker = nextMarkerMatch?.[1] || undefined;

    return { entries, nextMarker };
  }

  /**
   * Extract value from XML tag.
   */
  private extractXmlValue(xml: string, tag: string): string | undefined {
    const regex = new RegExp(`<${tag}>([^<]*)</${tag}>`);
    const match = xml.match(regex);
    return match?.[1];
  }

  /**
   * Decode XML entities.
   */
  private decodeXmlEntities(str: string): string {
    return str
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&apos;/g, "'")
      .replace(/&quot;/g, '"');
  }
}

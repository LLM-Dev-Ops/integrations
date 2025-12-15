/**
 * Azure Files - Share Service
 *
 * Share operations: list shares, get share properties.
 * Following the SPARC specification.
 */

import {
  AzureFilesConfig,
  resolveEndpoint,
  validateShareName,
  getTimeout,
} from "../config/index.js";
import { parseAzureFilesError } from "../errors.js";
import { AzureAuthProvider } from "../auth/index.js";
import { HttpTransport, isSuccess, getRequestId, getHeader } from "../transport/index.js";
import { ShareInfo } from "../types/common.js";

/**
 * List shares response.
 */
export interface ListSharesResponse {
  /** Shares in this page. */
  shares: ShareInfo[];
  /** Continuation marker for pagination. */
  nextMarker?: string;
}

/**
 * List shares request.
 */
export interface ListSharesRequest {
  /** Prefix to filter results. */
  prefix?: string;
  /** Maximum results per page. */
  maxResults?: number;
  /** Continuation marker from previous request. */
  marker?: string;
}

/**
 * Share service for Azure Files operations.
 */
export class ShareService {
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
   * List shares in the storage account.
   */
  async list(request: ListSharesRequest = {}): Promise<ListSharesResponse> {
    const endpoint = resolveEndpoint(this.config);
    const url = new URL(`${endpoint}/?comp=list`);

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

    return this.parseListResponse(response.body.toString());
  }

  /**
   * List all shares with automatic pagination.
   */
  async *listAll(request: ListSharesRequest = {}): AsyncIterable<ShareInfo> {
    let marker: string | undefined;

    do {
      const response = await this.list({
        ...request,
        marker,
      });

      for (const share of response.shares) {
        yield share;
      }

      marker = response.nextMarker;
    } while (marker);
  }

  /**
   * Get share properties.
   */
  async getProperties(shareName: string): Promise<ShareInfo> {
    validateShareName(shareName);

    const endpoint = resolveEndpoint(this.config);
    const url = `${endpoint}/${shareName}?restype=share`;

    const headers: Record<string, string> = {};
    const signed = this.authProvider.signRequest("GET", url, headers);

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

    return this.parseShareProperties(shareName, response.headers);
  }

  /**
   * Parse list shares XML response.
   */
  private parseListResponse(xml: string): ListSharesResponse {
    const shares: ShareInfo[] = [];

    const shareMatches = xml.matchAll(
      /<Share><Name>([^<]+)<\/Name>[\s\S]*?<Properties>([\s\S]*?)<\/Properties>[\s\S]*?<\/Share>/g
    );

    for (const match of shareMatches) {
      const name = this.decodeXmlEntities(match[1]);
      const propsXml = match[2];

      const lastModified = this.extractXmlValue(propsXml, "Last-Modified");
      const etag = this.extractXmlValue(propsXml, "Etag") ?? "";
      const quota = this.extractXmlValue(propsXml, "Quota");

      shares.push({
        name,
        etag,
        lastModified: lastModified ? new Date(lastModified) : new Date(),
        quota: quota ? parseInt(quota, 10) : undefined,
        metadata: {},
      });
    }

    // Parse next marker
    const nextMarkerMatch = xml.match(/<NextMarker>([^<]*)<\/NextMarker>/);
    const nextMarker = nextMarkerMatch?.[1] || undefined;

    return { shares, nextMarker };
  }

  /**
   * Parse share properties from response headers.
   */
  private parseShareProperties(
    name: string,
    headers: Record<string, string>
  ): ShareInfo {
    const etag = getHeader({ headers } as any, "etag") ?? "";
    const lastModifiedStr = getHeader({ headers } as any, "last-modified");
    const quotaStr = getHeader({ headers } as any, "x-ms-share-quota");

    // Extract custom metadata
    const metadata: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase().startsWith("x-ms-meta-")) {
        metadata[key.slice(10)] = value;
      }
    }

    return {
      name,
      etag,
      lastModified: lastModifiedStr ? new Date(lastModifiedStr) : new Date(),
      quota: quotaStr ? parseInt(quotaStr, 10) : undefined,
      metadata,
    };
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

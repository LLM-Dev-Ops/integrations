/**
 * Azure Shared Key Authentication
 *
 * Implements shared key signing for Azure Files REST API requests.
 */

import { createHmac } from "crypto";
import { API_VERSION } from "../config/index.js";

/**
 * Shared key signing result.
 */
export interface SignedRequest {
  headers: Record<string, string>;
}

/**
 * Shared key auth provider.
 */
export class SharedKeyAuthProvider {
  private readonly accountName: string;
  private readonly accountKey: Buffer;

  constructor(accountName: string, accountKey: string) {
    this.accountName = accountName;
    this.accountKey = Buffer.from(accountKey, "base64");
  }

  /**
   * Sign a request with shared key authentication.
   */
  signRequest(
    method: string,
    url: string,
    headers: Record<string, string>,
    contentLength: number = 0
  ): SignedRequest {
    const parsedUrl = new URL(url);
    const date = new Date().toUTCString();

    // Create a copy of headers with required fields
    const signedHeaders: Record<string, string> = {
      ...headers,
      "x-ms-date": date,
      "x-ms-version": API_VERSION,
    };

    // Build canonicalized headers
    const canonicalizedHeaders = this.buildCanonicalizedHeaders(signedHeaders);

    // Build canonicalized resource
    const canonicalizedResource = this.buildCanonicalizedResource(parsedUrl);

    // Build string to sign
    const stringToSign = this.buildStringToSign(
      method,
      signedHeaders,
      contentLength,
      canonicalizedHeaders,
      canonicalizedResource
    );

    // Create signature
    const signature = this.sign(stringToSign);

    // Add authorization header
    signedHeaders["Authorization"] = `SharedKey ${this.accountName}:${signature}`;

    return { headers: signedHeaders };
  }

  /**
   * Build canonicalized headers string.
   */
  private buildCanonicalizedHeaders(headers: Record<string, string>): string {
    // Get all x-ms-* headers, lowercase, sorted
    const msHeaders = Object.entries(headers)
      .filter(([key]) => key.toLowerCase().startsWith("x-ms-"))
      .map(([key, value]) => [key.toLowerCase(), value.replace(/\s+/g, " ").trim()] as const)
      .sort(([a], [b]) => a.localeCompare(b));

    return msHeaders.map(([key, value]) => `${key}:${value}`).join("\n");
  }

  /**
   * Build canonicalized resource string.
   */
  private buildCanonicalizedResource(url: URL): string {
    // Start with /{account}{path}
    let resource = `/${this.accountName}${decodeURIComponent(url.pathname)}`;

    // Add query parameters (sorted)
    const params = Array.from(url.searchParams.entries())
      .sort(([a], [b]) => a.localeCompare(b));

    for (const [key, value] of params) {
      resource += `\n${key.toLowerCase()}:${value}`;
    }

    return resource;
  }

  /**
   * Build the string to sign.
   */
  private buildStringToSign(
    method: string,
    headers: Record<string, string>,
    contentLength: number,
    canonicalizedHeaders: string,
    canonicalizedResource: string
  ): string {
    // Azure Files uses this format:
    // VERB\n
    // Content-Encoding\n
    // Content-Language\n
    // Content-Length\n
    // Content-MD5\n
    // Content-Type\n
    // Date\n
    // If-Modified-Since\n
    // If-Match\n
    // If-None-Match\n
    // If-Unmodified-Since\n
    // Range\n
    // CanonicalizedHeaders
    // CanonicalizedResource

    const getHeader = (name: string) => headers[name] ?? headers[name.toLowerCase()] ?? "";

    const parts = [
      method.toUpperCase(),
      getHeader("Content-Encoding"),
      getHeader("Content-Language"),
      contentLength > 0 ? contentLength.toString() : "",
      getHeader("Content-MD5"),
      getHeader("Content-Type"),
      "", // Date - we use x-ms-date instead
      getHeader("If-Modified-Since"),
      getHeader("If-Match"),
      getHeader("If-None-Match"),
      getHeader("If-Unmodified-Since"),
      getHeader("Range"),
      canonicalizedHeaders,
      canonicalizedResource,
    ];

    return parts.join("\n");
  }

  /**
   * Sign the string with HMAC-SHA256.
   */
  private sign(stringToSign: string): string {
    const hmac = createHmac("sha256", this.accountKey);
    hmac.update(stringToSign, "utf8");
    return hmac.digest("base64");
  }
}

/**
 * Create a shared key auth provider.
 */
export function createSharedKeyAuth(accountName: string, accountKey: string): SharedKeyAuthProvider {
  return new SharedKeyAuthProvider(accountName, accountKey);
}

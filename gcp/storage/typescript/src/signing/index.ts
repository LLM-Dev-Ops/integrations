/**
 * Signing Service
 *
 * V4 signed URL generation for GCS.
 * Following the SPARC specification.
 */

import * as crypto from "crypto";
import { GcsConfig, validateBucketName, validateObjectName, encodeObjectName } from "../config/index.js";
import { SigningError, AuthenticationError } from "../error/index.js";
import { GcpAuthProvider } from "../credentials/index.js";
import { SignUrlRequest, SignDownloadUrlRequest, SignUploadUrlRequest } from "../types/requests.js";
import { SignedUrl, HttpMethod } from "../types/common.js";

/**
 * Maximum expiration for signed URLs (7 days).
 */
const MAX_EXPIRATION_SECONDS = 7 * 24 * 60 * 60;

/**
 * Signing service for V4 signed URL generation.
 */
export class SigningService {
  private config: GcsConfig;
  private authProvider: GcpAuthProvider;

  constructor(config: GcsConfig, authProvider: GcpAuthProvider) {
    this.config = config;
    this.authProvider = authProvider;
  }

  /**
   * Sign a download URL.
   */
  async signDownloadUrl(request: SignDownloadUrlRequest): Promise<SignedUrl> {
    const queryParams: Record<string, string> = {};

    if (request.responseContentType) {
      queryParams["response-content-type"] = request.responseContentType;
    }
    if (request.responseContentDisposition) {
      queryParams["response-content-disposition"] = request.responseContentDisposition;
    }

    return this.signUrl({
      bucket: request.bucket,
      object: request.object,
      method: HttpMethod.GET,
      expiresIn: request.expiresIn,
      queryParams,
    });
  }

  /**
   * Sign an upload URL.
   */
  async signUploadUrl(request: SignUploadUrlRequest): Promise<SignedUrl> {
    const headers: Record<string, string> = {};

    if (request.contentType) {
      headers["content-type"] = request.contentType;
    }
    if (request.contentLength !== undefined) {
      headers["content-length"] = String(request.contentLength);
    }

    return this.signUrl({
      bucket: request.bucket,
      object: request.object,
      method: HttpMethod.PUT,
      expiresIn: request.expiresIn,
      headers,
    });
  }

  /**
   * Sign any URL with V4 signature.
   */
  async signUrl(request: SignUrlRequest): Promise<SignedUrl> {
    validateBucketName(request.bucket);
    validateObjectName(request.object);

    // Validate expiration
    if (request.expiresIn <= 0) {
      throw new SigningError("Expiration must be positive");
    }
    if (request.expiresIn > MAX_EXPIRATION_SECONDS) {
      throw new SigningError(`Expiration cannot exceed ${MAX_EXPIRATION_SECONDS} seconds (7 days)`);
    }

    // Get service account credentials for signing
    const credentials = await this.authProvider.getServiceAccountCredentials?.();
    if (!credentials) {
      throw new AuthenticationError(
        "Service account credentials required for signing URLs",
        "InvalidServiceAccount"
      );
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + request.expiresIn * 1000);

    // Format dates for signing
    const dateStamp = this.formatDateStamp(now);
    const dateTime = this.formatDateTime(now);

    // Build signed headers
    const signedHeaders = this.buildSignedHeaders(request.headers ?? {});
    const signedHeaderNames = Object.keys(signedHeaders).sort().join(";");

    // Credential scope
    const credentialScope = `${dateStamp}/auto/storage/goog4_request`;
    const credential = `${credentials.client_email}/${credentialScope}`;

    // Build canonical query string
    const queryParams = {
      ...request.queryParams,
      "X-Goog-Algorithm": "GOOG4-RSA-SHA256",
      "X-Goog-Credential": credential,
      "X-Goog-Date": dateTime,
      "X-Goog-Expires": String(request.expiresIn),
      "X-Goog-SignedHeaders": signedHeaderNames,
    };

    const canonicalQueryString = this.buildCanonicalQueryString(queryParams);

    // Build canonical URI
    const encodedObject = encodeObjectName(request.object);
    const canonicalUri = `/${request.bucket}/${encodedObject}`;

    // Build canonical headers
    const canonicalHeaders = this.buildCanonicalHeaders(signedHeaders);

    // Build canonical request
    const canonicalRequest = [
      request.method,
      canonicalUri,
      canonicalQueryString,
      canonicalHeaders,
      signedHeaderNames,
      "UNSIGNED-PAYLOAD",
    ].join("\n");

    // Hash canonical request
    const canonicalRequestHash = crypto
      .createHash("sha256")
      .update(canonicalRequest)
      .digest("hex");

    // Build string to sign
    const stringToSign = [
      "GOOG4-RSA-SHA256",
      dateTime,
      credentialScope,
      canonicalRequestHash,
    ].join("\n");

    // Sign with private key
    const signature = this.signWithPrivateKey(stringToSign, credentials.private_key);

    // Build final URL
    const host = this.config.apiEndpoint
      ? new URL(this.config.apiEndpoint).host
      : "storage.googleapis.com";

    const signedUrl = `https://${host}${canonicalUri}?${canonicalQueryString}&X-Goog-Signature=${signature}`;

    return {
      url: signedUrl,
      expiresAt,
      method: request.method,
      requiredHeaders: signedHeaders.host ? {} : signedHeaders,
    };
  }

  /**
   * Format date stamp (YYYYMMDD).
   */
  private formatDateStamp(date: Date): string {
    return date.toISOString().slice(0, 10).replace(/-/g, "");
  }

  /**
   * Format date time (YYYYMMDDTHHMMSSZ).
   */
  private formatDateTime(date: Date): string {
    return date.toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  }

  /**
   * Build signed headers map.
   */
  private buildSignedHeaders(headers: Record<string, string>): Record<string, string> {
    const result: Record<string, string> = {
      host: this.config.apiEndpoint
        ? new URL(this.config.apiEndpoint).host
        : "storage.googleapis.com",
    };

    for (const [key, value] of Object.entries(headers)) {
      result[key.toLowerCase()] = value;
    }

    return result;
  }

  /**
   * Build canonical query string.
   */
  private buildCanonicalQueryString(params: Record<string, string>): string {
    const sorted = Object.entries(params).sort(([a], [b]) => a.localeCompare(b));
    return sorted
      .map(([key, value]) => `${this.uriEncode(key)}=${this.uriEncode(value)}`)
      .join("&");
  }

  /**
   * Build canonical headers string.
   */
  private buildCanonicalHeaders(headers: Record<string, string>): string {
    const sorted = Object.entries(headers).sort(([a], [b]) => a.localeCompare(b));
    return sorted.map(([key, value]) => `${key}:${value}\n`).join("");
  }

  /**
   * URI encode a string.
   */
  private uriEncode(value: string): string {
    return encodeURIComponent(value).replace(/%2F/g, "%2F");
  }

  /**
   * Sign a string with RSA-SHA256.
   */
  private signWithPrivateKey(data: string, privateKey: string): string {
    const sign = crypto.createSign("RSA-SHA256");
    sign.update(data);
    return sign.sign(privateKey, "hex");
  }
}

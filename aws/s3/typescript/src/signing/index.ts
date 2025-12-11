/**
 * AWS Signature V4 Implementation
 *
 * Complete implementation of AWS Signature Version 4 signing process.
 */

import * as crypto from "crypto";
import { AwsCredentials } from "../credentials";

/**
 * Signed request result.
 */
export interface SignedRequest {
  url: URL;
  headers: Record<string, string>;
  timestamp: Date;
}

/**
 * Signing options.
 */
export interface SigningOptions {
  service?: string;
  region?: string;
  signedHeaders?: string[];
  signPayload?: boolean;
}

/**
 * AWS Signature V4 Signer.
 */
export class AwsSignerV4 {
  private static readonly ALGORITHM = "AWS4-HMAC-SHA256";
  private static readonly UNSIGNED_PAYLOAD = "UNSIGNED-PAYLOAD";

  private credentials: AwsCredentials;
  private region: string;
  private service: string;

  constructor(credentials: AwsCredentials, region: string, service: string = "s3") {
    this.credentials = credentials;
    this.region = region;
    this.service = service;
  }

  /**
   * Sign a request.
   */
  async sign(
    method: string,
    url: URL,
    headers: Record<string, string>,
    body?: Buffer | string,
    options?: SigningOptions
  ): Promise<SignedRequest> {
    const timestamp = new Date();
    const dateStr = this.formatDate(timestamp);
    const dateTimeStr = this.formatDateTime(timestamp);

    const region = options?.region ?? this.region;
    const service = options?.service ?? this.service;

    // Prepare headers
    const signedHeaders = { ...headers };
    signedHeaders["host"] = url.host;
    signedHeaders["x-amz-date"] = dateTimeStr;

    // Add security token if present
    if (this.credentials.sessionToken) {
      signedHeaders["x-amz-security-token"] = this.credentials.sessionToken;
    }

    // Calculate payload hash
    const payloadHash = options?.signPayload !== false
      ? this.hashPayload(body)
      : AwsSignerV4.UNSIGNED_PAYLOAD;
    signedHeaders["x-amz-content-sha256"] = payloadHash;

    // Create canonical request
    const canonicalRequest = this.createCanonicalRequest(
      method,
      url,
      signedHeaders,
      payloadHash
    );

    // Create string to sign
    const credentialScope = `${dateStr}/${region}/${service}/aws4_request`;
    const stringToSign = this.createStringToSign(
      dateTimeStr,
      credentialScope,
      canonicalRequest
    );

    // Calculate signature
    const signingKey = this.deriveSigningKey(dateStr, region, service);
    const signature = this.calculateSignature(signingKey, stringToSign);

    // Build authorization header
    const signedHeadersList = Object.keys(signedHeaders)
      .map((h) => h.toLowerCase())
      .sort()
      .join(";");

    const authorizationHeader = [
      `${AwsSignerV4.ALGORITHM} Credential=${this.credentials.accessKeyId}/${credentialScope}`,
      `SignedHeaders=${signedHeadersList}`,
      `Signature=${signature}`,
    ].join(", ");

    signedHeaders["authorization"] = authorizationHeader;

    return {
      url,
      headers: signedHeaders,
      timestamp,
    };
  }

  /**
   * Generate a presigned URL.
   */
  async presign(
    method: string,
    url: URL,
    headers: Record<string, string>,
    expiresIn: number,
    options?: SigningOptions
  ): Promise<URL> {
    const timestamp = new Date();
    const dateStr = this.formatDate(timestamp);
    const dateTimeStr = this.formatDateTime(timestamp);

    const region = options?.region ?? this.region;
    const service = options?.service ?? this.service;

    const credentialScope = `${dateStr}/${region}/${service}/aws4_request`;
    const credential = `${this.credentials.accessKeyId}/${credentialScope}`;

    // Build signed headers list
    const signedHeadersList = Object.keys(headers)
      .map((h) => h.toLowerCase())
      .sort()
      .concat("host")
      .join(";");

    // Build query parameters
    const queryParams = new URLSearchParams(url.search);
    queryParams.set("X-Amz-Algorithm", AwsSignerV4.ALGORITHM);
    queryParams.set("X-Amz-Credential", credential);
    queryParams.set("X-Amz-Date", dateTimeStr);
    queryParams.set("X-Amz-Expires", String(expiresIn));
    queryParams.set("X-Amz-SignedHeaders", signedHeadersList);

    if (this.credentials.sessionToken) {
      queryParams.set("X-Amz-Security-Token", this.credentials.sessionToken);
    }

    // Create URL with query parameters
    const presignUrl = new URL(url.toString());
    presignUrl.search = queryParams.toString();

    // Create canonical request
    const allHeaders = { ...headers, host: url.host };
    const canonicalRequest = this.createCanonicalRequest(
      method,
      presignUrl,
      allHeaders,
      AwsSignerV4.UNSIGNED_PAYLOAD
    );

    // Create string to sign
    const stringToSign = this.createStringToSign(
      dateTimeStr,
      credentialScope,
      canonicalRequest
    );

    // Calculate signature
    const signingKey = this.deriveSigningKey(dateStr, region, service);
    const signature = this.calculateSignature(signingKey, stringToSign);

    // Add signature to URL
    presignUrl.searchParams.set("X-Amz-Signature", signature);

    return presignUrl;
  }

  /**
   * Create canonical request string.
   */
  private createCanonicalRequest(
    method: string,
    url: URL,
    headers: Record<string, string>,
    payloadHash: string
  ): string {
    const canonicalUri = this.encodeUri(url.pathname || "/");
    const canonicalQueryString = this.createCanonicalQueryString(url.searchParams);

    const sortedHeaders = Object.entries(headers)
      .map(([k, v]) => [k.toLowerCase(), v.trim()])
      .sort((a, b) => a[0].localeCompare(b[0]));

    const canonicalHeaders = sortedHeaders
      .map(([k, v]) => `${k}:${v}`)
      .join("\n") + "\n";

    const signedHeaders = sortedHeaders.map(([k]) => k).join(";");

    return [
      method.toUpperCase(),
      canonicalUri,
      canonicalQueryString,
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join("\n");
  }

  /**
   * Create canonical query string.
   */
  private createCanonicalQueryString(params: URLSearchParams): string {
    const sortedParams = Array.from(params.entries())
      .sort((a, b) => {
        const keyCompare = a[0].localeCompare(b[0]);
        return keyCompare !== 0 ? keyCompare : a[1].localeCompare(b[1]);
      });

    return sortedParams
      .map(([k, v]) => `${this.encodeUriComponent(k)}=${this.encodeUriComponent(v)}`)
      .join("&");
  }

  /**
   * Create string to sign.
   */
  private createStringToSign(
    dateTime: string,
    credentialScope: string,
    canonicalRequest: string
  ): string {
    const hashedCanonicalRequest = this.sha256Hash(canonicalRequest);

    return [
      AwsSignerV4.ALGORITHM,
      dateTime,
      credentialScope,
      hashedCanonicalRequest,
    ].join("\n");
  }

  /**
   * Derive the signing key.
   */
  private deriveSigningKey(
    date: string,
    region: string,
    service: string
  ): Buffer {
    const kDate = this.hmac(`AWS4${this.credentials.secretAccessKey}`, date);
    const kRegion = this.hmac(kDate, region);
    const kService = this.hmac(kRegion, service);
    const kSigning = this.hmac(kService, "aws4_request");
    return kSigning;
  }

  /**
   * Calculate the final signature.
   */
  private calculateSignature(signingKey: Buffer, stringToSign: string): string {
    return this.hmac(signingKey, stringToSign).toString("hex");
  }

  /**
   * Hash payload with SHA256.
   */
  private hashPayload(payload?: Buffer | string): string {
    if (!payload) {
      return this.sha256Hash("");
    }
    return this.sha256Hash(payload);
  }

  /**
   * SHA256 hash.
   */
  private sha256Hash(data: string | Buffer): string {
    return crypto.createHash("sha256").update(data).digest("hex");
  }

  /**
   * HMAC-SHA256.
   */
  private hmac(key: string | Buffer, data: string): Buffer {
    return crypto.createHmac("sha256", key).update(data).digest();
  }

  /**
   * Format date as YYYYMMDD.
   */
  private formatDate(date: Date): string {
    return date.toISOString().slice(0, 10).replace(/-/g, "");
  }

  /**
   * Format date as YYYYMMDDTHHMMSSZ.
   */
  private formatDateTime(date: Date): string {
    return date.toISOString().replace(/[:-]/g, "").split(".")[0] + "Z";
  }

  /**
   * Encode URI path.
   */
  private encodeUri(path: string): string {
    return path
      .split("/")
      .map((segment) => this.encodeUriComponent(segment))
      .join("/");
  }

  /**
   * Encode URI component (AWS-style).
   */
  private encodeUriComponent(str: string): string {
    return encodeURIComponent(str)
      .replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  }

  /**
   * Update credentials.
   */
  updateCredentials(credentials: AwsCredentials): void {
    this.credentials = credentials;
  }
}

/**
 * Create a new AWS Signature V4 signer.
 */
export function createSigner(
  credentials: AwsCredentials,
  region: string,
  service: string = "s3"
): AwsSignerV4 {
  return new AwsSignerV4(credentials, region, service);
}

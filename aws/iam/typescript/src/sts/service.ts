/**
 * AWS STS Service
 *
 * This module provides the StsService class for interacting with AWS Security Token Service.
 * STS uses POST requests with application/x-www-form-urlencoded content type.
 *
 * @module sts/service
 */

import type {
  AssumeRoleRequest,
  AssumeRoleWithWebIdentityRequest,
  GetSessionTokenRequest,
  SessionTag,
} from '../types/requests.js';
import type {
  AssumedCredentials,
  CallerIdentity,
  SessionCredentials,
} from '../types/responses.js';
import {
  parseAssumeRoleResponse,
  parseAssumeRoleWithWebIdentityResponse,
  parseCallerIdentityResponse,
  parseSessionTokenResponse,
  parseFederationTokenResponse,
  parseStsError,
} from './xml.js';

/**
 * STS configuration
 */
export interface StsConfig {
  /** AWS region for STS endpoint */
  region: string;
  /** Use regional STS endpoint (recommended) */
  useRegionalEndpoint?: boolean;
}

/**
 * AWS credentials for signing requests
 */
export interface AwsCredentials {
  /** AWS access key ID */
  accessKeyId: string;
  /** AWS secret access key */
  secretAccessKey: string;
  /** Session token (for temporary credentials) */
  sessionToken?: string;
}

/**
 * HTTP client interface for making requests
 */
export interface HttpClient {
  /**
   * Send an HTTP request
   * @param request - HTTP request
   * @returns HTTP response
   */
  send(request: HttpRequest): Promise<HttpResponse>;
}

/**
 * HTTP request
 */
export interface HttpRequest {
  /** HTTP method */
  method: string;
  /** Request URL */
  url: string;
  /** Request headers */
  headers: Record<string, string>;
  /** Request body */
  body?: string;
}

/**
 * HTTP response
 */
export interface HttpResponse {
  /** HTTP status code */
  status: number;
  /** Response headers */
  headers: Record<string, string>;
  /** Response body */
  body: string;
}

/**
 * Request signer interface
 */
export interface RequestSigner {
  /**
   * Sign an HTTP request
   * @param request - Request to sign
   * @param params - Signing parameters
   * @returns Signed request
   */
  signRequest(request: Request, params: SigningParams): Promise<SignedRequest>;
}

/**
 * Signing parameters
 */
export interface SigningParams {
  /** AWS region */
  region: string;
  /** AWS service name */
  service: string;
  /** AWS credentials */
  credentials: AwsCredentials;
  /** Request date (optional) */
  date?: Date;
}

/**
 * Signed request result
 */
export interface SignedRequest {
  /** Signed headers */
  headers: Record<string, string>;
  /** Request URL */
  url: string;
  /** HTTP method */
  method: string;
  /** Request body */
  body?: string;
}

/**
 * Request to get federation token
 */
export interface GetFederationTokenRequest {
  /** Name for the federated user (2-32 characters) */
  name: string;
  /** Session duration in seconds (900-129600) */
  durationSeconds?: number;
  /** Session policy (JSON) */
  policy?: string;
  /** Managed policy ARNs */
  policyArns?: string[];
  /** Session tags */
  tags?: SessionTag[];
}

/**
 * STS Service Error
 */
export class StsServiceError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly requestId?: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'StsServiceError';
  }
}

/**
 * AWS Security Token Service (STS) client.
 *
 * Provides methods for:
 * - Assuming IAM roles
 * - Getting caller identity
 * - Obtaining session tokens
 * - Federation token generation
 *
 * @example
 * ```typescript
 * const service = new StsService(config, httpClient, signer, credentials);
 *
 * // Assume a role
 * const assumedCreds = await service.assumeRole({
 *   roleArn: 'arn:aws:iam::123456789012:role/MyRole',
 *   sessionName: 'my-session',
 * });
 *
 * // Get caller identity
 * const identity = await service.getCallerIdentity();
 * console.log(`Account: ${identity.account}`);
 * ```
 */
export class StsService {
  private readonly config: StsConfig;
  private readonly httpClient: HttpClient;
  private readonly signer: RequestSigner;
  private credentials: AwsCredentials;
  private readonly baseUrl: string;

  /**
   * STS API version
   */
  private static readonly VERSION = '2011-06-15';

  /**
   * Create a new STS service instance.
   *
   * @param config - STS configuration
   * @param httpClient - HTTP client for making requests
   * @param signer - Request signer for AWS Signature V4
   * @param credentials - AWS credentials for signing
   */
  constructor(
    config: StsConfig,
    httpClient: HttpClient,
    signer: RequestSigner,
    credentials: AwsCredentials
  ) {
    this.config = config;
    this.httpClient = httpClient;
    this.signer = signer;
    this.credentials = credentials;
    this.baseUrl = this.buildBaseUrl();
  }

  /**
   * Update credentials (e.g., after refresh).
   *
   * @param credentials - New AWS credentials
   */
  updateCredentials(credentials: AwsCredentials): void {
    this.credentials = credentials;
  }

  /**
   * Build the STS endpoint URL.
   *
   * @returns STS endpoint URL
   */
  private buildBaseUrl(): string {
    if (this.config.useRegionalEndpoint !== false) {
      // Use regional endpoint (recommended)
      return `https://sts.${this.config.region}.amazonaws.com`;
    } else {
      // Use global endpoint
      return 'https://sts.amazonaws.com';
    }
  }

  /**
   * Build form-encoded body from parameters.
   *
   * @param params - Request parameters
   * @returns Form-encoded body string
   */
  private buildFormBody(params: Record<string, string | number | boolean>): string {
    const urlParams = new URLSearchParams();

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        urlParams.append(key, String(value));
      }
    }

    return urlParams.toString();
  }

  /**
   * Make a POST request to STS.
   *
   * @param params - Request parameters
   * @returns Response body
   * @throws {StsServiceError} On API errors
   */
  private async request(params: Record<string, string | number | boolean>): Promise<string> {
    // Build form body
    const body = this.buildFormBody(params);

    // Create request
    const request = new Request(this.baseUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'content-length': String(Buffer.byteLength(body, 'utf8')),
      },
      body,
    });

    // Sign the request
    const signedResult = await this.signer.signRequest(request, {
      region: this.config.region,
      service: 'sts',
      credentials: this.credentials,
    });

    // Send the request
    const httpRequest: HttpRequest = {
      method: signedResult.method,
      url: signedResult.url,
      headers: signedResult.headers,
      body: signedResult.body,
    };

    const response = await this.httpClient.send(httpRequest);

    // Handle error responses
    if (response.status >= 400) {
      const error = parseStsError(response.body);
      throw new StsServiceError(
        error.message,
        error.code,
        error.requestId,
        response.status
      );
    }

    return response.body;
  }

  /**
   * Assume an IAM role.
   *
   * Returns temporary security credentials that you can use to access AWS resources.
   *
   * @param request - AssumeRole request
   * @returns Assumed role credentials
   * @throws {StsServiceError} On API errors
   *
   * @example
   * ```typescript
   * const credentials = await service.assumeRole({
   *   roleArn: 'arn:aws:iam::123456789012:role/MyRole',
   *   sessionName: 'my-session',
   *   durationSeconds: 3600,
   *   externalId: 'unique-external-id',
   * });
   * ```
   */
  async assumeRole(request: AssumeRoleRequest): Promise<AssumedCredentials> {
    const params: Record<string, string | number | boolean> = {
      Action: 'AssumeRole',
      Version: StsService.VERSION,
      RoleArn: request.roleArn,
      RoleSessionName: request.sessionName,
    };

    // Optional parameters
    if (request.durationSeconds !== undefined) {
      params.DurationSeconds = request.durationSeconds;
    }
    if (request.externalId) {
      params.ExternalId = request.externalId;
    }
    if (request.sessionPolicy) {
      params.Policy = request.sessionPolicy;
    }
    if (request.sourceIdentity) {
      params.SourceIdentity = request.sourceIdentity;
    }
    if (request.mfaSerial) {
      params.SerialNumber = request.mfaSerial;
    }
    if (request.mfaToken) {
      params.TokenCode = request.mfaToken;
    }

    // Add policy ARNs
    if (request.policyArns) {
      request.policyArns.forEach((arn, index) => {
        params[`PolicyArns.member.${index + 1}.arn`] = arn;
      });
    }

    // Add session tags
    if (request.sessionTags) {
      request.sessionTags.forEach((tag, index) => {
        params[`Tags.member.${index + 1}.Key`] = tag.key;
        params[`Tags.member.${index + 1}.Value`] = tag.value;
      });
    }

    // Add transitive tag keys
    if (request.transitiveTagKeys) {
      request.transitiveTagKeys.forEach((key, index) => {
        params[`TransitiveTagKeys.member.${index + 1}`] = key;
      });
    }

    const responseXml = await this.request(params);
    return parseAssumeRoleResponse(responseXml);
  }

  /**
   * Assume a role with web identity (OIDC).
   *
   * Returns temporary security credentials for users authenticated through
   * an identity provider (e.g., Amazon Cognito, Google, Facebook).
   *
   * @param request - AssumeRoleWithWebIdentity request
   * @returns Assumed role credentials
   * @throws {StsServiceError} On API errors
   *
   * @example
   * ```typescript
   * const credentials = await service.assumeRoleWithWebIdentity({
   *   roleArn: 'arn:aws:iam::123456789012:role/WebIdentityRole',
   *   sessionName: 'web-session',
   *   webIdentityToken: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...',
   * });
   * ```
   */
  async assumeRoleWithWebIdentity(
    request: AssumeRoleWithWebIdentityRequest
  ): Promise<AssumedCredentials> {
    const params: Record<string, string | number | boolean> = {
      Action: 'AssumeRoleWithWebIdentity',
      Version: StsService.VERSION,
      RoleArn: request.roleArn,
      RoleSessionName: request.sessionName,
      WebIdentityToken: request.webIdentityToken,
    };

    // Optional parameters
    if (request.providerId) {
      params.ProviderId = request.providerId;
    }
    if (request.durationSeconds !== undefined) {
      params.DurationSeconds = request.durationSeconds;
    }
    if (request.sessionPolicy) {
      params.Policy = request.sessionPolicy;
    }

    // Add policy ARNs
    if (request.policyArns) {
      request.policyArns.forEach((arn, index) => {
        params[`PolicyArns.member.${index + 1}.arn`] = arn;
      });
    }

    const responseXml = await this.request(params);
    return parseAssumeRoleWithWebIdentityResponse(responseXml);
  }

  /**
   * Get caller identity.
   *
   * Returns details about the IAM user or role whose credentials are used to call the operation.
   *
   * @returns Caller identity information
   * @throws {StsServiceError} On API errors
   *
   * @example
   * ```typescript
   * const identity = await service.getCallerIdentity();
   * console.log(`Account: ${identity.account}`);
   * console.log(`User ID: ${identity.userId}`);
   * console.log(`ARN: ${identity.arn}`);
   * ```
   */
  async getCallerIdentity(): Promise<CallerIdentity> {
    const params = {
      Action: 'GetCallerIdentity',
      Version: StsService.VERSION,
    };

    const responseXml = await this.request(params);
    return parseCallerIdentityResponse(responseXml);
  }

  /**
   * Get session token.
   *
   * Returns a set of temporary credentials for an AWS account or IAM user.
   * Useful for MFA-authenticated sessions.
   *
   * @param request - GetSessionToken request (optional)
   * @returns Session credentials
   * @throws {StsServiceError} On API errors
   *
   * @example
   * ```typescript
   * // Get session token with MFA
   * const credentials = await service.getSessionToken({
   *   durationSeconds: 3600,
   *   mfaSerial: 'arn:aws:iam::123456789012:mfa/user',
   *   mfaToken: '123456',
   * });
   * ```
   */
  async getSessionToken(request?: GetSessionTokenRequest): Promise<SessionCredentials> {
    const params: Record<string, string | number | boolean> = {
      Action: 'GetSessionToken',
      Version: StsService.VERSION,
    };

    if (request) {
      if (request.durationSeconds !== undefined) {
        params.DurationSeconds = request.durationSeconds;
      }
      if (request.mfaSerial) {
        params.SerialNumber = request.mfaSerial;
      }
      if (request.mfaToken) {
        params.TokenCode = request.mfaToken;
      }
    }

    const responseXml = await this.request(params);
    return parseSessionTokenResponse(responseXml);
  }

  /**
   * Get federation token.
   *
   * Returns a set of temporary credentials for a federated user.
   *
   * @param request - GetFederationToken request
   * @returns Federated credentials
   * @throws {StsServiceError} On API errors
   *
   * @example
   * ```typescript
   * const credentials = await service.getFederationToken({
   *   name: 'federated-user',
   *   durationSeconds: 3600,
   *   policy: JSON.stringify({
   *     Version: '2012-10-17',
   *     Statement: [{
   *       Effect: 'Allow',
   *       Action: 's3:*',
   *       Resource: '*',
   *     }],
   *   }),
   * });
   * ```
   */
  async getFederationToken(request: GetFederationTokenRequest): Promise<SessionCredentials> {
    const params: Record<string, string | number | boolean> = {
      Action: 'GetFederationToken',
      Version: StsService.VERSION,
      Name: request.name,
    };

    // Optional parameters
    if (request.durationSeconds !== undefined) {
      params.DurationSeconds = request.durationSeconds;
    }
    if (request.policy) {
      params.Policy = request.policy;
    }

    // Add policy ARNs
    if (request.policyArns) {
      request.policyArns.forEach((arn, index) => {
        params[`PolicyArns.member.${index + 1}.arn`] = arn;
      });
    }

    // Add tags
    if (request.tags) {
      request.tags.forEach((tag, index) => {
        params[`Tags.member.${index + 1}.Key`] = tag.key;
        params[`Tags.member.${index + 1}.Value`] = tag.value;
      });
    }

    const responseXml = await this.request(params);
    return parseFederationTokenResponse(responseXml);
  }
}

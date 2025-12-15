/**
 * AWS IAM Client
 *
 * Main client class that provides a unified interface for AWS IAM and STS operations.
 * This client coordinates all IAM/STS functionality including role assumption,
 * caller identity, policy simulation, and role information retrieval.
 *
 * @module client
 */

import type {
  IamConfig,
  CacheConfig,
} from '../config/index.js';
import {
  resolveStsEndpoint,
  resolveIamEndpoint,
  DEFAULT_CONFIG,
  validateRoleArn,
  validateSessionName,
  validateSessionDuration,
  validateExternalId,
} from '../config/index.js';
import type {
  AssumeRoleRequest,
  AssumeRoleWithWebIdentityRequest,
  GetSessionTokenRequest,
  SimulatePolicyRequest,
} from '../types/requests.js';
import type {
  AssumedCredentials,
  CallerIdentity,
  SessionCredentials,
  SimulationResult,
} from '../types/responses.js';
import type { RoleInfo, PermissionCheck } from '../types/common.js';
import type { AwsCredentials, CredentialProvider } from '../credentials/types.js';
import {
  AssumedRoleCredentialProvider,
  AssumedCredentialCache,
  RoleChainBuilder,
  type AssumedRoleProviderOptions,
} from '../credentials/index.js';
import { StsService, type StsConfig, type HttpClient, type RequestSigner } from '../sts/index.js';
import { PolicySimulator, RoleService } from '../iam/index.js';
import { IamError, wrapError, type IamErrorCode } from '../error/index.js';

/**
 * HTTP transport interface for making requests.
 */
export interface HttpTransport {
  /**
   * Send an HTTP request.
   *
   * @param request - HTTP request details
   * @returns Promise resolving to HTTP response
   */
  send(request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: string;
  }): Promise<{
    status: number;
    headers: Record<string, string>;
    body: string;
  }>;
}

/**
 * Default fetch-based HTTP transport.
 */
class FetchTransport implements HttpTransport {
  private readonly timeout: number;

  constructor(timeout: number = 30000) {
    this.timeout = timeout;
  }

  async send(request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: string;
  }): Promise<{
    status: number;
    headers: Record<string, string>;
    body: string;
  }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        signal: controller.signal,
      });

      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });

      const body = await response.text();

      return {
        status: response.status,
        headers,
        body,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * AWS Signature V4 signer implementation.
 *
 * Uses the Web Crypto API for HMAC-SHA256 signing.
 */
class Signer implements RequestSigner {
  constructor(private readonly credentialProvider: CredentialProvider) {}

  /**
   * Sign an HTTP request using AWS Signature V4.
   */
  async signRequest(
    request: Request,
    params: {
      region: string;
      service: string;
      credentials: AwsCredentials;
      date?: Date;
    }
  ): Promise<{
    headers: Record<string, string>;
    url: string;
    method: string;
    body?: string;
  }> {
    const date = params.date || new Date();
    const dateStr = this.formatDate(date);
    const datetime = this.formatDateTime(date);

    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    // Clone headers
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    // Add required headers
    headers['host'] = url.host;
    headers['x-amz-date'] = datetime;

    if (params.credentials.sessionToken) {
      headers['x-amz-security-token'] = params.credentials.sessionToken;
    }

    // Get body
    let body: string | undefined;
    if (request.body) {
      body = await request.text();
    }

    // Calculate payload hash
    const payloadHash = await this.sha256(body || '');
    headers['x-amz-content-sha256'] = payloadHash;

    // Build canonical request
    const sortedHeaders = Object.keys(headers).sort();
    const signedHeaders = sortedHeaders.join(';');
    const canonicalHeaders = sortedHeaders
      .map((k) => `${k}:${(headers[k] ?? '').trim()}`)
      .join('\n');

    const canonicalRequest = [
      method,
      this.encodeUri(url.pathname || '/'),
      this.canonicalQueryString(url.searchParams),
      canonicalHeaders + '\n',
      signedHeaders,
      payloadHash,
    ].join('\n');

    // Build string to sign
    const credentialScope = `${dateStr}/${params.region}/${params.service}/aws4_request`;
    const canonicalRequestHash = await this.sha256(canonicalRequest);
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      datetime,
      credentialScope,
      canonicalRequestHash,
    ].join('\n');

    // Derive signing key
    const signingKey = await this.deriveSigningKey(
      params.credentials.secretAccessKey,
      dateStr,
      params.region,
      params.service
    );

    // Calculate signature
    const signature = await this.hmacHex(signingKey, stringToSign);

    // Build authorization header
    headers['authorization'] = [
      `AWS4-HMAC-SHA256 Credential=${params.credentials.accessKeyId}/${credentialScope}`,
      `SignedHeaders=${signedHeaders}`,
      `Signature=${signature}`,
    ].join(', ');

    return {
      headers,
      url: request.url,
      method,
      body,
    };
  }

  private formatDate(date: Date): string {
    return date.toISOString().slice(0, 10).replace(/-/g, '');
  }

  private formatDateTime(date: Date): string {
    return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  }

  private encodeUri(uri: string): string {
    return encodeURIComponent(uri)
      .replace(/%2F/g, '/')
      .replace(/'/g, '%27');
  }

  private canonicalQueryString(params: URLSearchParams): string {
    const sorted = Array.from(params.entries()).sort((a, b) =>
      a[0].localeCompare(b[0])
    );
    return sorted
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
  }

  private async sha256(data: string): Promise<string> {
    const encoder = new TextEncoder();
    const buffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
    return this.arrayBufferToHex(buffer);
  }

  private async hmac(key: ArrayBuffer, data: string): Promise<ArrayBuffer> {
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      key,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
  }

  private async hmacHex(key: ArrayBuffer, data: string): Promise<string> {
    const signature = await this.hmac(key, data);
    return this.arrayBufferToHex(signature);
  }

  private async deriveSigningKey(
    secret: string,
    date: string,
    region: string,
    service: string
  ): Promise<ArrayBuffer> {
    const encoder = new TextEncoder();
    const kSecret = encoder.encode(`AWS4${secret}`).buffer as ArrayBuffer;
    const kDate = await this.hmac(kSecret, date);
    const kRegion = await this.hmac(kDate, region);
    const kService = await this.hmac(kRegion, service);
    return this.hmac(kService, 'aws4_request');
  }

  private arrayBufferToHex(buffer: ArrayBuffer): string {
    return Array.from(new Uint8Array(buffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
}

/**
 * Adapter to convert HttpTransport to STS HttpClient interface.
 */
class HttpClientAdapter implements HttpClient {
  constructor(private readonly transport: HttpTransport) {}

  async send(request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: string;
  }): Promise<{
    status: number;
    headers: Record<string, string>;
    body: string;
  }> {
    return this.transport.send(request);
  }
}

/**
 * Adapter for PolicySimulator and RoleService HTTP client interface.
 */
class IamHttpClientAdapter {
  constructor(private readonly transport: HttpTransport) {}

  async post(
    url: string,
    headers: Record<string, string>,
    body: string
  ): Promise<{
    status: number;
    body: string;
    headers: Record<string, string>;
  }> {
    return this.transport.send({
      method: 'POST',
      url,
      headers,
      body,
    });
  }
}

/**
 * Adapter for PolicySimulator and RoleService signer interface.
 */
class IamSignerAdapter {
  constructor(
    private readonly signer: Signer,
    private readonly credentialProvider: CredentialProvider,
    private readonly region: string
  ) {}

  async sign(request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: string;
  }): Promise<{
    url: string;
    headers: Record<string, string>;
    body?: string;
  }> {
    const credentials = await this.credentialProvider.getCredentials();
    const req = new Request(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
    });

    return this.signer.signRequest(req, {
      region: this.region,
      service: 'iam',
      credentials,
    });
  }
}

/**
 * AWS IAM Client
 *
 * Provides a unified interface for AWS IAM and STS operations including:
 * - Role assumption (AssumeRole, AssumeRoleWithWebIdentity)
 * - Caller identity retrieval
 * - Session token generation
 * - Policy simulation
 * - Role information retrieval
 * - Credential caching and management
 *
 * @example Basic usage
 * ```typescript
 * import { IamClient, IamConfigBuilder } from '@aws/iam';
 *
 * const config = new IamConfigBuilder()
 *   .region('us-east-1')
 *   .credentials('AKIAIOSFODNN7EXAMPLE', 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY')
 *   .build();
 *
 * const client = new IamClient(config);
 *
 * // Get caller identity
 * const identity = await client.getCallerIdentity();
 * console.log(`Account: ${identity.account}`);
 *
 * // Assume a role
 * const credentials = await client.assumeRole({
 *   roleArn: 'arn:aws:iam::123456789012:role/MyRole',
 *   sessionName: 'my-session'
 * });
 * ```
 *
 * @example Policy simulation
 * ```typescript
 * // Check if a principal can perform an action
 * const allowed = await client.canPerform(
 *   'arn:aws:iam::123456789012:role/MyRole',
 *   's3:GetObject',
 *   'arn:aws:s3:::my-bucket/*'
 * );
 *
 * // Batch check multiple permissions
 * const results = await client.batchCheckPermissions([
 *   { principal: '...', action: 's3:GetObject', resource: '...' },
 *   { principal: '...', action: 's3:PutObject', resource: '...' },
 * ]);
 * ```
 *
 * @example Cross-account role chaining
 * ```typescript
 * const credentials = await client.assumeRoleChain([
 *   { roleArn: 'arn:aws:iam::111111111111:role/JumpRole', sessionName: 'jump' },
 *   { roleArn: 'arn:aws:iam::222222222222:role/TargetRole', sessionName: 'target' },
 * ]);
 * ```
 */
export class IamClient {
  private readonly config: IamConfig;
  private readonly transport: HttpTransport;
  private readonly signer: Signer;
  private readonly stsService: StsService;
  private readonly policySimulator: PolicySimulator;
  private readonly roleService: RoleService;
  private readonly credentialCache: AssumedCredentialCache;

  /**
   * Create a new IAM client.
   *
   * @param config - IAM client configuration
   * @param transport - Optional custom HTTP transport (defaults to fetch-based)
   */
  constructor(config: IamConfig, transport?: HttpTransport) {
    this.config = config;
    this.transport = transport || new FetchTransport(config.timeout || DEFAULT_CONFIG.timeout);
    this.signer = new Signer(config.baseCredentialsProvider);

    // Initialize credential cache
    const cacheConfig = config.cacheConfig || DEFAULT_CONFIG.cacheConfig;
    this.credentialCache = new AssumedCredentialCache({
      refreshBuffer: cacheConfig.refreshBuffer,
      maxEntries: cacheConfig.maxEntries,
    });

    // Initialize STS service
    const stsConfig: StsConfig = {
      region: config.region,
      useRegionalEndpoint: config.useRegionalSts ?? DEFAULT_CONFIG.useRegionalSts,
    };
    const httpClient = new HttpClientAdapter(this.transport);

    // Create a signer adapter that works with STS
    const stsSigner = this.createStsSigner();

    this.stsService = new StsService(
      stsConfig,
      httpClient,
      stsSigner,
      { accessKeyId: '', secretAccessKey: '' } // Will be updated per request
    );

    // Initialize IAM services
    const iamHttpClient = new IamHttpClientAdapter(this.transport);
    const iamSigner = new IamSignerAdapter(this.signer, config.baseCredentialsProvider, config.region);

    this.policySimulator = new PolicySimulator(
      { region: config.region },
      iamHttpClient,
      iamSigner,
      cacheConfig.refreshBuffer
    );

    this.roleService = new RoleService(
      { region: config.region },
      iamHttpClient,
      iamSigner
    );
  }

  /**
   * Create a signer adapter for STS that fetches credentials on each sign.
   */
  private createStsSigner(): RequestSigner {
    const credentialProvider = this.config.baseCredentialsProvider;
    const signer = this.signer;
    const region = this.config.region;

    return {
      async signRequest(
        request: Request,
        params: {
          region: string;
          service: string;
          credentials: AwsCredentials;
          date?: Date;
        }
      ) {
        // Get fresh credentials from the provider
        const credentials = await credentialProvider.getCredentials();
        return signer.signRequest(request, {
          ...params,
          credentials,
        });
      },
    };
  }

  // ==========================================================================
  // STS Operations
  // ==========================================================================

  /**
   * Assume an IAM role.
   *
   * Returns temporary security credentials for the assumed role.
   *
   * @param request - AssumeRole request parameters
   * @returns Assumed role credentials
   * @throws {IamError} If role assumption fails
   *
   * @example
   * ```typescript
   * const credentials = await client.assumeRole({
   *   roleArn: 'arn:aws:iam::123456789012:role/MyRole',
   *   sessionName: 'my-application-session',
   *   durationSeconds: 3600,
   *   externalId: 'unique-external-id' // For cross-account
   * });
   *
   * console.log(`Access Key: ${credentials.accessKeyId}`);
   * console.log(`Expires: ${credentials.expiration}`);
   * ```
   */
  async assumeRole(request: AssumeRoleRequest): Promise<AssumedCredentials> {
    // Validate request
    validateRoleArn(request.roleArn);
    validateSessionName(request.sessionName);
    if (request.durationSeconds !== undefined) {
      validateSessionDuration(request.durationSeconds);
    }
    if (request.externalId) {
      validateExternalId(request.externalId);
    }

    try {
      return await this.stsService.assumeRole(request);
    } catch (error) {
      throw wrapError(error);
    }
  }

  /**
   * Assume a role using web identity (OIDC).
   *
   * Returns temporary credentials for users authenticated through
   * an identity provider (e.g., Amazon Cognito, Google, Facebook).
   *
   * @param request - AssumeRoleWithWebIdentity request parameters
   * @returns Assumed role credentials
   * @throws {IamError} If role assumption fails
   *
   * @example
   * ```typescript
   * const credentials = await client.assumeRoleWithWebIdentity({
   *   roleArn: 'arn:aws:iam::123456789012:role/WebIdentityRole',
   *   sessionName: 'web-user-session',
   *   webIdentityToken: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...',
   *   providerId: 'cognito-identity.amazonaws.com'
   * });
   * ```
   */
  async assumeRoleWithWebIdentity(
    request: AssumeRoleWithWebIdentityRequest
  ): Promise<AssumedCredentials> {
    validateRoleArn(request.roleArn);
    validateSessionName(request.sessionName);
    if (request.durationSeconds !== undefined) {
      validateSessionDuration(request.durationSeconds);
    }

    try {
      return await this.stsService.assumeRoleWithWebIdentity(request);
    } catch (error) {
      throw wrapError(error);
    }
  }

  /**
   * Get caller identity.
   *
   * Returns details about the IAM user or role whose credentials are used.
   *
   * @returns Caller identity information
   * @throws {IamError} If the call fails
   *
   * @example
   * ```typescript
   * const identity = await client.getCallerIdentity();
   * console.log(`Account: ${identity.account}`);
   * console.log(`User ID: ${identity.userId}`);
   * console.log(`ARN: ${identity.arn}`);
   * ```
   */
  async getCallerIdentity(): Promise<CallerIdentity> {
    try {
      return await this.stsService.getCallerIdentity();
    } catch (error) {
      throw wrapError(error);
    }
  }

  /**
   * Get session token.
   *
   * Returns temporary credentials for the current IAM user.
   * Useful for MFA-authenticated sessions.
   *
   * @param request - Optional GetSessionToken request parameters
   * @returns Session credentials
   * @throws {IamError} If the call fails
   *
   * @example
   * ```typescript
   * const credentials = await client.getSessionToken({
   *   durationSeconds: 3600,
   *   mfaSerial: 'arn:aws:iam::123456789012:mfa/user',
   *   mfaToken: '123456'
   * });
   * ```
   */
  async getSessionToken(request?: GetSessionTokenRequest): Promise<SessionCredentials> {
    if (request?.durationSeconds !== undefined) {
      if (request.durationSeconds < 900 || request.durationSeconds > 129600) {
        throw new IamError(
          'Session duration must be between 900 and 129600 seconds',
          'CONFIGURATION',
          false
        );
      }
    }

    try {
      return await this.stsService.getSessionToken(request);
    } catch (error) {
      throw wrapError(error);
    }
  }

  /**
   * Assume a chain of roles for cross-account access.
   *
   * Sequentially assumes each role in the chain, using the credentials
   * from the previous role to assume the next. AWS limits role chains
   * to a maximum depth of 2.
   *
   * @param roles - Array of role assumption steps
   * @returns Final assumed role credentials
   * @throws {IamError} If any role assumption fails
   *
   * @example
   * ```typescript
   * const credentials = await client.assumeRoleChain([
   *   {
   *     roleArn: 'arn:aws:iam::111111111111:role/JumpRole',
   *     sessionName: 'jump-session'
   *   },
   *   {
   *     roleArn: 'arn:aws:iam::222222222222:role/TargetRole',
   *     sessionName: 'target-session',
   *     externalId: 'external-id-for-target'
   *   }
   * ]);
   * ```
   */
  async assumeRoleChain(
    roles: Array<{
      roleArn: string;
      sessionName: string;
      externalId?: string;
      durationSeconds?: number;
    }>
  ): Promise<AssumedCredentials> {
    if (roles.length === 0) {
      throw new IamError('Role chain cannot be empty', 'CONFIGURATION', false);
    }

    if (roles.length > 2) {
      throw new IamError(
        'Role chain cannot exceed 2 roles (AWS limit)',
        'ROLE_CHAIN_LIMIT',
        false
      );
    }

    // Validate all roles first
    for (const role of roles) {
      validateRoleArn(role.roleArn);
      validateSessionName(role.sessionName);
      if (role.durationSeconds !== undefined) {
        validateSessionDuration(role.durationSeconds);
      }
      if (role.externalId) {
        validateExternalId(role.externalId);
      }
    }

    // Build and execute the chain
    const builder = RoleChainBuilder.create(this.stsService);
    for (const role of roles) {
      builder.addRole(role.roleArn, role.sessionName);
      if (role.externalId) {
        builder.withExternalId(role.externalId);
      }
      if (role.durationSeconds) {
        builder.withDuration(role.durationSeconds);
      }
    }

    try {
      return await builder.assumeChain();
    } catch (error) {
      throw wrapError(error);
    }
  }

  // ==========================================================================
  // Policy Simulation
  // ==========================================================================

  /**
   * Check if a principal can perform an action on a resource.
   *
   * Uses the IAM policy simulator to evaluate permissions.
   *
   * @param principal - Principal ARN (user or role)
   * @param action - Action to check (e.g., 's3:GetObject')
   * @param resource - Resource ARN
   * @returns true if the action is allowed
   * @throws {IamError} If simulation fails
   *
   * @example
   * ```typescript
   * const allowed = await client.canPerform(
   *   'arn:aws:iam::123456789012:role/MyRole',
   *   's3:GetObject',
   *   'arn:aws:s3:::my-bucket/file.txt'
   * );
   *
   * if (allowed) {
   *   console.log('Access granted');
   * }
   * ```
   */
  async canPerform(
    principal: string,
    action: string,
    resource: string
  ): Promise<boolean> {
    try {
      return await this.policySimulator.canPerform(principal, action, resource);
    } catch (error) {
      throw wrapError(error, 'SIMULATION_ERROR');
    }
  }

  /**
   * Simulate policy evaluation for multiple actions.
   *
   * @param request - Simulation request parameters
   * @returns Detailed simulation results
   * @throws {IamError} If simulation fails
   *
   * @example
   * ```typescript
   * const result = await client.simulatePolicy({
   *   principalArn: 'arn:aws:iam::123456789012:role/MyRole',
   *   actionNames: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'],
   *   resourceArns: ['arn:aws:s3:::my-bucket/*']
   * });
   *
   * for (const evaluation of result.evaluationResults) {
   *   console.log(`${evaluation.actionName}: ${evaluation.decision}`);
   * }
   * ```
   */
  async simulatePolicy(request: SimulatePolicyRequest): Promise<SimulationResult> {
    try {
      return await this.policySimulator.simulate(request);
    } catch (error) {
      throw wrapError(error, 'SIMULATION_ERROR');
    }
  }

  /**
   * Batch check multiple permissions efficiently.
   *
   * Groups checks by principal to minimize API calls.
   *
   * @param checks - Array of permission checks
   * @returns Map of check key to result (true = allowed)
   * @throws {IamError} If simulation fails
   *
   * @example
   * ```typescript
   * const checks = [
   *   { principal: '...', action: 's3:GetObject', resource: 'arn:aws:s3:::bucket1/*' },
   *   { principal: '...', action: 's3:PutObject', resource: 'arn:aws:s3:::bucket1/*' },
   *   { principal: '...', action: 's3:GetObject', resource: 'arn:aws:s3:::bucket2/*' },
   * ];
   *
   * const results = await client.batchCheckPermissions(checks);
   * ```
   */
  async batchCheckPermissions(checks: PermissionCheck[]): Promise<Map<string, boolean>> {
    try {
      return await this.policySimulator.batchCheck(checks);
    } catch (error) {
      throw wrapError(error, 'SIMULATION_ERROR');
    }
  }

  // ==========================================================================
  // Role Information
  // ==========================================================================

  /**
   * Get IAM role information.
   *
   * @param roleName - Name of the IAM role
   * @returns Role information
   * @throws {IamError} If the role doesn't exist or API call fails
   *
   * @example
   * ```typescript
   * const role = await client.getRole('MyApplicationRole');
   * console.log(`ARN: ${role.arn}`);
   * console.log(`Max Session Duration: ${role.maxSessionDuration}s`);
   * ```
   */
  async getRole(roleName: string): Promise<RoleInfo> {
    try {
      return await this.roleService.getRole(roleName);
    } catch (error) {
      throw wrapError(error);
    }
  }

  /**
   * List inline policies attached to a role.
   *
   * @param roleName - Name of the IAM role
   * @returns Array of inline policy names
   * @throws {IamError} If the role doesn't exist or API call fails
   *
   * @example
   * ```typescript
   * const policies = await client.listRolePolicies('MyRole');
   * console.log(`Inline policies: ${policies.join(', ')}`);
   * ```
   */
  async listRolePolicies(roleName: string): Promise<string[]> {
    try {
      return await this.roleService.listRolePolicies(roleName);
    } catch (error) {
      throw wrapError(error);
    }
  }

  /**
   * List managed policies attached to a role.
   *
   * @param roleName - Name of the IAM role
   * @returns Array of managed policy ARNs
   * @throws {IamError} If the role doesn't exist or API call fails
   *
   * @example
   * ```typescript
   * const policyArns = await client.listAttachedRolePolicies('MyRole');
   * for (const arn of policyArns) {
   *   console.log(arn);
   * }
   * ```
   */
  async listAttachedRolePolicies(roleName: string): Promise<string[]> {
    try {
      return await this.roleService.listAttachedRolePolicies(roleName);
    } catch (error) {
      throw wrapError(error);
    }
  }

  /**
   * Get complete role information including all policies.
   *
   * @param roleName - Name of the IAM role
   * @returns Role information with inline and attached policies
   * @throws {IamError} If the role doesn't exist or API call fails
   *
   * @example
   * ```typescript
   * const info = await client.getRoleWithPolicies('MyRole');
   * console.log(`Role: ${info.role.roleName}`);
   * console.log(`Inline policies: ${info.inlinePolicies.length}`);
   * console.log(`Attached policies: ${info.attachedPolicies.length}`);
   * ```
   */
  async getRoleWithPolicies(roleName: string): Promise<{
    role: RoleInfo;
    inlinePolicies: string[];
    attachedPolicies: string[];
  }> {
    try {
      return await this.roleService.getRoleWithPolicies(roleName);
    } catch (error) {
      throw wrapError(error);
    }
  }

  // ==========================================================================
  // Credential Providers
  // ==========================================================================

  /**
   * Create a credential provider for an assumed role.
   *
   * Returns a CredentialProvider that automatically manages the lifecycle
   * of assumed role credentials, including caching and proactive refresh.
   *
   * @param roleArn - ARN of the role to assume
   * @param sessionName - Name for the role session
   * @param options - Optional provider configuration
   * @returns Credential provider for the assumed role
   *
   * @example
   * ```typescript
   * // Create a provider for an assumed role
   * const provider = client.credentialProviderForRole(
   *   'arn:aws:iam::123456789012:role/MyRole',
   *   'my-session',
   *   { externalId: 'external-id' }
   * );
   *
   * // Use the provider to get credentials
   * const credentials = await provider.getCredentials();
   *
   * // Pass to other AWS clients
   * const s3Client = new S3Client({ credentialProvider: provider });
   * ```
   */
  credentialProviderForRole(
    roleArn: string,
    sessionName: string,
    options?: AssumedRoleProviderOptions
  ): CredentialProvider {
    validateRoleArn(roleArn);
    validateSessionName(sessionName);

    return new AssumedRoleCredentialProvider(
      this.stsService,
      roleArn,
      sessionName,
      options
    );
  }

  // ==========================================================================
  // Cache Management
  // ==========================================================================

  /**
   * Clear the policy simulation cache.
   *
   * Useful when you need fresh simulation results.
   */
  clearSimulationCache(): void {
    this.policySimulator.clearCache();
  }

  /**
   * Clean up expired cache entries.
   *
   * @returns Number of entries removed
   */
  cleanupCaches(): number {
    return this.policySimulator.cleanupCache();
  }

  /**
   * Get cache statistics.
   *
   * @returns Cache statistics
   */
  getCacheStats(): { credentials: { size: number; hits: number; misses: number; evictions: number } } {
    return {
      credentials: this.credentialCache.getCacheStats(),
    };
  }
}

/**
 * Create an IAM client with the provided configuration.
 *
 * @param config - IAM client configuration
 * @param transport - Optional custom HTTP transport
 * @returns New IAM client instance
 *
 * @example
 * ```typescript
 * import { createIamClient, IamConfigBuilder } from '@aws/iam';
 *
 * const config = new IamConfigBuilder()
 *   .region('us-east-1')
 *   .credentials('AKIAIOSFODNN7EXAMPLE', 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY')
 *   .build();
 *
 * const client = createIamClient(config);
 * ```
 */
export function createIamClient(config: IamConfig, transport?: HttpTransport): IamClient {
  return new IamClient(config, transport);
}

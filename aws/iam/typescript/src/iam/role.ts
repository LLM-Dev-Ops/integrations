/**
 * AWS IAM Role Service
 *
 * This module provides operations for retrieving IAM role information,
 * including role details, inline policies, and attached managed policies.
 *
 * @module iam/role
 */

import type { RoleInfo } from '../types/common.js';
import {
  parseGetRoleResponse,
  parseListRolePoliciesResponse,
  parseListAttachedRolePoliciesResponse,
  parseIamError,
} from './xml.js';

/**
 * IAM configuration interface
 */
export interface IamConfig {
  /** AWS region (not used for IAM, but kept for consistency) */
  region?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
}

/**
 * HTTP client interface for making IAM requests
 */
export interface HttpClient {
  /**
   * Send an HTTP POST request
   * @param url - Target URL
   * @param headers - Request headers
   * @param body - Request body
   * @returns Response with status and body
   */
  post(url: string, headers: Record<string, string>, body: string): Promise<{
    status: number;
    body: string;
    headers: Record<string, string>;
  }>;
}

/**
 * AWS Signature V4 signer interface
 */
export interface AwsSigner {
  /**
   * Sign a request using AWS Signature V4
   * @param request - Request to sign
   * @returns Signed request with authorization header
   */
  sign(request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: string;
  }): Promise<{
    url: string;
    headers: Record<string, string>;
    body?: string;
  }>;
}

/**
 * AWS IAM Role Service
 *
 * Provides operations for retrieving IAM role information.
 * All operations use the IAM global endpoint.
 *
 * @example Basic usage
 * ```typescript
 * const roleService = new RoleService(config, httpClient, signer);
 *
 * // Get role details
 * const role = await roleService.getRole('MyApplicationRole');
 * console.log(`Role ARN: ${role.arn}`);
 * console.log(`Max Session Duration: ${role.maxSessionDuration}s`);
 *
 * // List inline policies
 * const inlinePolicies = await roleService.listRolePolicies('MyApplicationRole');
 * console.log(`Found ${inlinePolicies.length} inline policies`);
 *
 * // List attached managed policies
 * const attachedPolicies = await roleService.listAttachedRolePolicies('MyApplicationRole');
 * console.log(`Found ${attachedPolicies.length} attached policies`);
 * ```
 */
export class RoleService {
  private readonly config: IamConfig;
  private readonly httpClient: HttpClient;
  private readonly signer: AwsSigner;

  /** IAM endpoint - always global */
  private static readonly IAM_ENDPOINT = 'https://iam.amazonaws.com';

  /** IAM API version */
  private static readonly IAM_VERSION = '2010-05-08';

  /**
   * Create a new RoleService
   *
   * @param config - IAM configuration
   * @param httpClient - HTTP client for making requests
   * @param signer - AWS request signer
   */
  constructor(config: IamConfig, httpClient: HttpClient, signer: AwsSigner) {
    this.config = config;
    this.httpClient = httpClient;
    this.signer = signer;
  }

  /**
   * Get IAM role information
   *
   * Retrieves detailed information about an IAM role including its ARN,
   * trust policy, description, and tags.
   *
   * @param roleName - Name of the IAM role
   * @returns Role information
   * @throws Error if the role doesn't exist or API call fails
   *
   * @example
   * ```typescript
   * const role = await roleService.getRole('MyApplicationRole');
   * console.log(`Role ARN: ${role.arn}`);
   * console.log(`Created: ${role.createDate}`);
   * console.log(`Max Session Duration: ${role.maxSessionDuration} seconds`);
   *
   * // Access trust policy document
   * if (role.assumeRolePolicyDocument) {
   *   const trustPolicy = JSON.parse(role.assumeRolePolicyDocument);
   *   console.log('Trust Policy:', trustPolicy);
   * }
   * ```
   */
  async getRole(roleName: string): Promise<RoleInfo> {
    const params: Record<string, string> = {
      Action: 'GetRole',
      Version: RoleService.IAM_VERSION,
      RoleName: roleName,
    };

    const response = await this.makeRequest(params);
    return parseGetRoleResponse(response);
  }

  /**
   * List inline policies attached to a role
   *
   * Returns the names of inline policies that are embedded in the specified IAM role.
   *
   * @param roleName - Name of the IAM role
   * @returns Array of inline policy names
   * @throws Error if the role doesn't exist or API call fails
   *
   * @example
   * ```typescript
   * const policies = await roleService.listRolePolicies('MyApplicationRole');
   * console.log(`Found ${policies.length} inline policies:`);
   * for (const policyName of policies) {
   *   console.log(`  - ${policyName}`);
   * }
   * ```
   */
  async listRolePolicies(roleName: string): Promise<string[]> {
    const params: Record<string, string> = {
      Action: 'ListRolePolicies',
      Version: RoleService.IAM_VERSION,
      RoleName: roleName,
    };

    const response = await this.makeRequest(params);
    return parseListRolePoliciesResponse(response);
  }

  /**
   * List managed policies attached to a role
   *
   * Returns the ARNs of managed policies that are attached to the specified IAM role.
   * These are AWS managed policies or customer managed policies.
   *
   * @param roleName - Name of the IAM role
   * @returns Array of managed policy ARNs
   * @throws Error if the role doesn't exist or API call fails
   *
   * @example
   * ```typescript
   * const policyArns = await roleService.listAttachedRolePolicies('MyApplicationRole');
   * console.log(`Found ${policyArns.length} attached managed policies:`);
   * for (const arn of policyArns) {
   *   console.log(`  - ${arn}`);
   *   if (arn.includes(':aws:policy/')) {
   *     console.log('    (AWS Managed Policy)');
   *   } else {
   *     console.log('    (Customer Managed Policy)');
   *   }
   * }
   * ```
   */
  async listAttachedRolePolicies(roleName: string): Promise<string[]> {
    const params: Record<string, string> = {
      Action: 'ListAttachedRolePolicies',
      Version: RoleService.IAM_VERSION,
      RoleName: roleName,
    };

    const response = await this.makeRequest(params);
    return parseListAttachedRolePoliciesResponse(response);
  }

  /**
   * Get all policies for a role (both inline and attached)
   *
   * Convenience method that combines listRolePolicies and listAttachedRolePolicies.
   *
   * @param roleName - Name of the IAM role
   * @returns Object with inline policy names and attached policy ARNs
   *
   * @example
   * ```typescript
   * const { inlinePolicies, attachedPolicies } = await roleService.getAllPolicies('MyRole');
   * console.log(`Inline policies: ${inlinePolicies.join(', ')}`);
   * console.log(`Attached policies: ${attachedPolicies.join(', ')}`);
   * ```
   */
  async getAllPolicies(roleName: string): Promise<{
    inlinePolicies: string[];
    attachedPolicies: string[];
  }> {
    // Execute both requests in parallel
    const [inlinePolicies, attachedPolicies] = await Promise.all([
      this.listRolePolicies(roleName),
      this.listAttachedRolePolicies(roleName),
    ]);

    return {
      inlinePolicies,
      attachedPolicies,
    };
  }

  /**
   * Get complete role information including all policies
   *
   * Retrieves role details along with all inline and attached policies.
   *
   * @param roleName - Name of the IAM role
   * @returns Complete role information with policies
   *
   * @example
   * ```typescript
   * const roleInfo = await roleService.getRoleWithPolicies('MyApplicationRole');
   * console.log(`Role: ${roleInfo.role.roleName}`);
   * console.log(`ARN: ${roleInfo.role.arn}`);
   * console.log(`Inline policies: ${roleInfo.inlinePolicies.length}`);
   * console.log(`Attached policies: ${roleInfo.attachedPolicies.length}`);
   * ```
   */
  async getRoleWithPolicies(roleName: string): Promise<{
    role: RoleInfo;
    inlinePolicies: string[];
    attachedPolicies: string[];
  }> {
    // Execute all requests in parallel
    const [role, inlinePolicies, attachedPolicies] = await Promise.all([
      this.getRole(roleName),
      this.listRolePolicies(roleName),
      this.listAttachedRolePolicies(roleName),
    ]);

    return {
      role,
      inlinePolicies,
      attachedPolicies,
    };
  }

  /**
   * Make an IAM API request
   *
   * @param params - Request parameters
   * @returns Response body
   * @throws Error if the request fails
   * @internal
   */
  private async makeRequest(params: Record<string, string>): Promise<string> {
    // Build the request body
    const body = new URLSearchParams(params).toString();
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Host': 'iam.amazonaws.com',
    };

    // Sign the request
    const signedRequest = await this.signer.sign({
      method: 'POST',
      url: RoleService.IAM_ENDPOINT,
      headers,
      body,
    });

    // Send the request
    const response = await this.httpClient.post(
      RoleService.IAM_ENDPOINT,
      signedRequest.headers,
      body
    );

    // Handle errors
    if (response.status >= 400) {
      const error = parseIamError(response.body);
      throw new Error(`IAM API Error (${response.status}): ${error.code} - ${error.message}`);
    }

    return response.body;
  }
}

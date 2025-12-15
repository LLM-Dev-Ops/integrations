/**
 * AWS IAM Policy Simulator
 *
 * This module provides policy simulation capabilities using the IAM SimulatePrincipalPolicy API.
 * It includes result caching with a short TTL (5 minutes) to improve performance.
 *
 * @module iam/simulator
 */

import type { SimulatePolicyRequest } from '../types/requests.js';
import type { SimulationResult, EvaluationDecision } from '../types/responses.js';
import type { PermissionCheck } from '../types/common.js';
import { parseSimulatePolicyResponse, parseIamError } from './xml.js';

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
 * Cache entry for simulation results
 */
interface CacheEntry {
  /** The simulation result */
  result: SimulationResult;
  /** When this entry expires */
  expiresAt: number;
}

/**
 * Cache key for simulation results
 */
interface SimulationCacheKey {
  /** Principal ARN */
  principal: string;
  /** Sorted action names */
  actions: string[];
  /** Sorted resource ARNs */
  resources: string[];
}

/**
 * AWS IAM Policy Simulator
 *
 * Provides policy simulation with caching for improved performance.
 * Simulations are cached for 5 minutes to reduce API calls.
 *
 * @example Basic usage
 * ```typescript
 * const simulator = new PolicySimulator(config, httpClient, signer);
 *
 * // Check a single permission
 * const canRead = await simulator.canPerform(
 *   'arn:aws:iam::123456789012:role/MyRole',
 *   's3:GetObject',
 *   'arn:aws:s3:::my-bucket/*'
 * );
 *
 * // Simulate multiple permissions
 * const result = await simulator.simulate({
 *   principalArn: 'arn:aws:iam::123456789012:role/MyRole',
 *   actionNames: ['s3:GetObject', 's3:PutObject'],
 *   resourceArns: ['arn:aws:s3:::my-bucket/*']
 * });
 *
 * // Batch check multiple permissions
 * const checks = [
 *   { principal: '...', action: 's3:GetObject', resource: '...' },
 *   { principal: '...', action: 's3:PutObject', resource: '...' },
 * ];
 * const results = await simulator.batchCheck(checks);
 * ```
 */
export class PolicySimulator {
  private readonly config: IamConfig;
  private readonly httpClient: HttpClient;
  private readonly signer: AwsSigner;
  private readonly cache: Map<string, CacheEntry>;
  private readonly cacheTtlMs: number;

  /** IAM endpoint - always global */
  private static readonly IAM_ENDPOINT = 'https://iam.amazonaws.com';

  /** IAM API version */
  private static readonly IAM_VERSION = '2010-05-08';

  /** Default cache TTL: 5 minutes */
  private static readonly DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;

  /**
   * Create a new PolicySimulator
   *
   * @param config - IAM configuration
   * @param httpClient - HTTP client for making requests
   * @param signer - AWS request signer
   * @param cacheTtlMs - Cache TTL in milliseconds (default: 5 minutes)
   */
  constructor(
    config: IamConfig,
    httpClient: HttpClient,
    signer: AwsSigner,
    cacheTtlMs: number = PolicySimulator.DEFAULT_CACHE_TTL_MS
  ) {
    this.config = config;
    this.httpClient = httpClient;
    this.signer = signer;
    this.cache = new Map();
    this.cacheTtlMs = cacheTtlMs;
  }

  /**
   * Check if a principal can perform an action on a resource
   *
   * @param principal - Principal ARN
   * @param action - Action to check (e.g., 's3:GetObject')
   * @param resource - Resource ARN
   * @returns true if the action is allowed, false otherwise
   *
   * @example
   * ```typescript
   * const allowed = await simulator.canPerform(
   *   'arn:aws:iam::123456789012:role/MyRole',
   *   's3:GetObject',
   *   'arn:aws:s3:::my-bucket/file.txt'
   * );
   * if (allowed) {
   *   console.log('Access granted');
   * }
   * ```
   */
  async canPerform(principal: string, action: string, resource: string): Promise<boolean> {
    const request: SimulatePolicyRequest = {
      principalArn: principal,
      actionNames: [action],
      resourceArns: [resource],
    };

    const result = await this.simulate(request);

    // Check if all evaluations are allowed
    return result.evaluationResults.every(
      (r) => r.decision === 'allowed' as EvaluationDecision
    );
  }

  /**
   * Simulate a policy evaluation
   *
   * @param request - Simulation request
   * @returns Simulation result with evaluation details
   *
   * @example
   * ```typescript
   * const result = await simulator.simulate({
   *   principalArn: 'arn:aws:iam::123456789012:role/MyRole',
   *   actionNames: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'],
   *   resourceArns: ['arn:aws:s3:::my-bucket/*']
   * });
   *
   * for (const eval of result.evaluationResults) {
   *   console.log(`${eval.actionName}: ${eval.decision}`);
   * }
   * ```
   */
  async simulate(request: SimulatePolicyRequest): Promise<SimulationResult> {
    // Check cache first
    const cacheKey = this.buildCacheKey(request);
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    // Build the request parameters
    const params = this.buildRequestParams(request);

    // Make the API call
    const body = new URLSearchParams(params).toString();
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Host': 'iam.amazonaws.com',
    };

    // Sign the request
    const signedRequest = await this.signer.sign({
      method: 'POST',
      url: PolicySimulator.IAM_ENDPOINT,
      headers,
      body,
    });

    // Send the request
    const response = await this.httpClient.post(
      PolicySimulator.IAM_ENDPOINT,
      signedRequest.headers,
      body
    );

    // Handle errors
    if (response.status >= 400) {
      const error = parseIamError(response.body);
      throw new Error(`IAM API Error (${response.status}): ${error.code} - ${error.message}`);
    }

    // Parse the response
    const result = parseSimulatePolicyResponse(response.body);

    // Cache the result
    this.putInCache(cacheKey, result);

    return result;
  }

  /**
   * Batch check multiple permissions efficiently
   *
   * Groups checks by principal to minimize API calls.
   *
   * @param checks - Array of permission checks
   * @returns Map of permission check to result
   *
   * @example
   * ```typescript
   * const checks = [
   *   {
   *     principal: 'arn:aws:iam::123456789012:role/MyRole',
   *     action: 's3:GetObject',
   *     resource: 'arn:aws:s3:::bucket1/*'
   *   },
   *   {
   *     principal: 'arn:aws:iam::123456789012:role/MyRole',
   *     action: 's3:PutObject',
   *     resource: 'arn:aws:s3:::bucket1/*'
   *   },
   *   {
   *     principal: 'arn:aws:iam::123456789012:role/OtherRole',
   *     action: 's3:GetObject',
   *     resource: 'arn:aws:s3:::bucket2/*'
   *   },
   * ];
   *
   * const results = await simulator.batchCheck(checks);
   * for (const [check, allowed] of results) {
   *   console.log(`${check.principal} can ${check.action} on ${check.resource}: ${allowed}`);
   * }
   * ```
   */
  async batchCheck(checks: PermissionCheck[]): Promise<Map<string, boolean>> {
    // Group checks by principal for efficiency
    const byPrincipal = new Map<string, PermissionCheck[]>();
    for (const check of checks) {
      const existing = byPrincipal.get(check.principal) || [];
      existing.push(check);
      byPrincipal.set(check.principal, existing);
    }

    const results = new Map<string, boolean>();

    // Process each principal group
    for (const [principal, principalChecks] of byPrincipal) {
      // Extract unique actions and resources
      const actions = Array.from(new Set(principalChecks.map((c) => c.action)));
      const resources = Array.from(new Set(principalChecks.map((c) => c.resource)));

      // Simulate for this principal
      const simResult = await this.simulate({
        principalArn: principal,
        actionNames: actions,
        resourceArns: resources,
      });

      // Map results back to individual checks
      for (const check of principalChecks) {
        const checkKey = this.buildCheckKey(check);
        const allowed = this.isCheckAllowed(check, simResult);
        results.set(checkKey, allowed);
      }
    }

    return results;
  }

  /**
   * Clear the simulation cache
   *
   * Useful for testing or when you need fresh results.
   *
   * @example
   * ```typescript
   * simulator.clearCache();
   * ```
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Remove expired entries from the cache
   *
   * @returns Number of entries removed
   *
   * @example
   * ```typescript
   * // Clean up periodically
   * setInterval(() => {
   *   const removed = simulator.cleanupCache();
   *   console.log(`Removed ${removed} expired cache entries`);
   * }, 60000); // Every minute
   * ```
   */
  cleanupCache(): number {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt <= now) {
        this.cache.delete(key);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Build request parameters for SimulatePrincipalPolicy
   *
   * @param request - Simulation request
   * @returns URL-encoded parameters
   * @internal
   */
  private buildRequestParams(request: SimulatePolicyRequest): Record<string, string> {
    const params: Record<string, string> = {
      Action: 'SimulatePrincipalPolicy',
      Version: PolicySimulator.IAM_VERSION,
      PolicySourceArn: request.principalArn,
    };

    // Add action names
    request.actionNames.forEach((action, index) => {
      params[`ActionNames.member.${index + 1}`] = action;
    });

    // Add resource ARNs if provided
    if (request.resourceArns && request.resourceArns.length > 0) {
      request.resourceArns.forEach((resource, index) => {
        params[`ResourceArns.member.${index + 1}`] = resource;
      });
    }

    // Add context entries if provided
    if (request.contextEntries && request.contextEntries.length > 0) {
      request.contextEntries.forEach((entry, index) => {
        const prefix = `ContextEntries.member.${index + 1}`;
        params[`${prefix}.ContextKeyName`] = entry.key;
        params[`${prefix}.ContextKeyType`] = entry.type;

        if (Array.isArray(entry.value)) {
          entry.value.forEach((val, valIndex) => {
            params[`${prefix}.ContextKeyValues.member.${valIndex + 1}`] = val;
          });
        } else {
          params[`${prefix}.ContextKeyValues.member.1`] = entry.value;
        }
      });
    }

    // Add resource policy if provided
    if (request.resourcePolicy) {
      params.ResourcePolicy = request.resourcePolicy;
    }

    // Add caller ARN if provided
    if (request.callerArn) {
      params.CallerArn = request.callerArn;
    }

    return params;
  }

  /**
   * Build a cache key from a simulation request
   *
   * @param request - Simulation request
   * @returns Cache key string
   * @internal
   */
  private buildCacheKey(request: SimulatePolicyRequest): string {
    const key: SimulationCacheKey = {
      principal: request.principalArn,
      actions: [...request.actionNames].sort(),
      resources: [...(request.resourceArns || [])].sort(),
    };

    return JSON.stringify(key);
  }

  /**
   * Build a unique key for a permission check
   *
   * @param check - Permission check
   * @returns Check key string
   * @internal
   */
  private buildCheckKey(check: PermissionCheck): string {
    return `${check.principal}:${check.action}:${check.resource}`;
  }

  /**
   * Check if a specific permission check is allowed in a simulation result
   *
   * @param check - Permission check
   * @param result - Simulation result
   * @returns true if allowed, false otherwise
   * @internal
   */
  private isCheckAllowed(check: PermissionCheck, result: SimulationResult): boolean {
    // Find matching evaluation result
    const evaluation = result.evaluationResults.find(
      (r) =>
        r.actionName === check.action &&
        (!r.resourceName || r.resourceName === check.resource)
    );

    if (!evaluation) {
      return false;
    }

    return evaluation.decision === ('allowed' as EvaluationDecision);
  }

  /**
   * Get a result from the cache if not expired
   *
   * @param key - Cache key
   * @returns Cached result or undefined
   * @internal
   */
  private getFromCache(key: string): SimulationResult | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      return undefined;
    }

    // Check if expired
    if (entry.expiresAt <= Date.now()) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.result;
  }

  /**
   * Store a result in the cache
   *
   * @param key - Cache key
   * @param result - Simulation result
   * @internal
   */
  private putInCache(key: string, result: SimulationResult): void {
    const entry: CacheEntry = {
      result,
      expiresAt: Date.now() + this.cacheTtlMs,
    };

    this.cache.set(key, entry);
  }
}

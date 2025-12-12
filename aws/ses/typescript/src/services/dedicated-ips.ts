/**
 * Dedicated IP Service
 *
 * Service for managing dedicated IP addresses and IP pools in AWS SES v2.
 * Dedicated IPs provide better deliverability control and reputation isolation.
 *
 * @module services/dedicated-ips
 */

import { BaseService } from './base.js';

/**
 * Response for getting dedicated IP details.
 */
export interface GetDedicatedIpResponse {
  /** The dedicated IP address */
  dedicatedIp?: {
    /** The IP address */
    ip?: string;
    /** Warmup status */
    warmupStatus?: 'IN_PROGRESS' | 'DONE';
    /** Warmup percentage (0-100) */
    warmupPercentage?: number;
    /** IP pool name */
    poolName?: string;
  };
}

/**
 * Response for listing dedicated IPs.
 */
export interface ListDedicatedIpsResponse {
  /** List of dedicated IPs */
  dedicatedIps?: Array<{
    /** The IP address */
    ip?: string;
    /** Warmup status */
    warmupStatus?: 'IN_PROGRESS' | 'DONE';
    /** Warmup percentage (0-100) */
    warmupPercentage?: number;
    /** IP pool name */
    poolName?: string;
  }>;
  /** Token for pagination */
  nextToken?: string;
}

/**
 * Response for getting IP pool details.
 */
export interface GetDedicatedIpPoolResponse {
  /** The IP pool */
  dedicatedIpPool?: {
    /** Pool name */
    poolName?: string;
    /** Scaling mode */
    scalingMode?: 'STANDARD' | 'MANAGED';
  };
}

/**
 * Response for listing IP pools.
 */
export interface ListDedicatedIpPoolsResponse {
  /** List of IP pool names */
  dedicatedIpPools?: string[];
  /** Token for pagination */
  nextToken?: string;
}

/**
 * Dedicated IP service for managing dedicated IP addresses and pools.
 *
 * Dedicated IPs provide:
 * - Dedicated sending reputation
 * - Better deliverability control
 * - IP warmup management
 * - IP pool organization
 *
 * Note: Dedicated IPs are a paid feature and must be requested separately.
 *
 * @example
 * ```typescript
 * const dedicatedIpService = new DedicatedIpService(client);
 *
 * // List all dedicated IPs
 * const ips = await dedicatedIpService.listDedicatedIps();
 * ips.dedicatedIps?.forEach(ip => {
 *   console.log(`IP: ${ip.ip}`);
 *   console.log(`Pool: ${ip.poolName}`);
 *   console.log(`Warmup: ${ip.warmupPercentage}%`);
 * });
 *
 * // Get details for a specific IP
 * const details = await dedicatedIpService.getDedicatedIp('192.0.2.1');
 * console.log('Warmup status:', details.dedicatedIp?.warmupStatus);
 * ```
 */
export class DedicatedIpService extends BaseService {
  /**
   * Get details about a dedicated IP address.
   *
   * Retrieves information about a specific dedicated IP including
   * warmup status and pool assignment.
   *
   * @param ip - The IP address to look up
   * @returns Promise resolving to IP details
   *
   * @example
   * ```typescript
   * const response = await dedicatedIpService.getDedicatedIp('192.0.2.1');
   *
   * const ip = response.dedicatedIp;
   * console.log('IP:', ip?.ip);
   * console.log('Pool:', ip?.poolName);
   * console.log('Warmup status:', ip?.warmupStatus);
   * console.log('Warmup percentage:', ip?.warmupPercentage);
   *
   * if (ip?.warmupStatus === 'IN_PROGRESS') {
   *   console.log(`Still warming up: ${ip.warmupPercentage}% complete`);
   * }
   * ```
   */
  async getDedicatedIp(ip: string): Promise<GetDedicatedIpResponse> {
    return this.get<GetDedicatedIpResponse>(
      `/v2/email/dedicated-ips/${encodeURIComponent(ip)}`
    );
  }

  /**
   * List all dedicated IP addresses.
   *
   * Returns a list of all dedicated IPs in your account with their
   * current status and pool assignments.
   *
   * @param options - List options including pool filter and pagination
   * @returns Promise resolving to list of IPs
   *
   * @example List all IPs
   * ```typescript
   * const response = await dedicatedIpService.listDedicatedIps();
   *
   * response.dedicatedIps?.forEach(ip => {
   *   console.log(`${ip.ip} - Pool: ${ip.poolName}, Warmup: ${ip.warmupPercentage}%`);
   * });
   * ```
   *
   * @example Filter by pool
   * ```typescript
   * const response = await dedicatedIpService.listDedicatedIps({
   *   poolName: 'production-pool'
   * });
   *
   * console.log(`IPs in production-pool: ${response.dedicatedIps?.length}`);
   * ```
   *
   * @example Paginate through results
   * ```typescript
   * let nextToken: string | undefined;
   * const allIps = [];
   *
   * do {
   *   const response = await dedicatedIpService.listDedicatedIps({
   *     nextToken,
   *     pageSize: 50
   *   });
   *
   *   if (response.dedicatedIps) {
   *     allIps.push(...response.dedicatedIps);
   *   }
   *
   *   nextToken = response.nextToken;
   * } while (nextToken);
   * ```
   */
  async listDedicatedIps(options?: {
    poolName?: string;
    nextToken?: string;
    pageSize?: number;
  }): Promise<ListDedicatedIpsResponse> {
    const query = this.buildQuery({
      PoolName: options?.poolName,
      NextToken: options?.nextToken,
      PageSize: options?.pageSize,
    });

    return this.get<ListDedicatedIpsResponse>('/v2/email/dedicated-ips', query);
  }

  /**
   * Create a dedicated IP pool.
   *
   * Creates a new pool for organizing dedicated IP addresses.
   * Pools can be used to separate sending for different purposes or brands.
   *
   * @param poolName - Name for the new pool
   * @param scalingMode - Scaling mode (STANDARD or MANAGED)
   * @returns Promise resolving when pool is created
   *
   * @example
   * ```typescript
   * // Create a standard pool
   * await dedicatedIpService.createDedicatedIpPool('transactional', 'STANDARD');
   *
   * // Create a managed pool (AWS handles scaling)
   * await dedicatedIpService.createDedicatedIpPool('marketing', 'MANAGED');
   * ```
   */
  async createDedicatedIpPool(
    poolName: string,
    scalingMode?: 'STANDARD' | 'MANAGED'
  ): Promise<void> {
    await this.post('/v2/email/dedicated-ip-pools', {
      poolName,
      scalingMode,
    });
  }

  /**
   * Delete a dedicated IP pool.
   *
   * Deletes an IP pool. The pool must be empty (no IPs assigned to it).
   *
   * @param poolName - Name of the pool to delete
   * @returns Promise resolving when pool is deleted
   *
   * @example
   * ```typescript
   * await dedicatedIpService.deleteDedicatedIpPool('old-pool');
   * ```
   */
  async deleteDedicatedIpPool(poolName: string): Promise<void> {
    await this.delete(`/v2/email/dedicated-ip-pools/${encodeURIComponent(poolName)}`);
  }

  /**
   * Get dedicated IP pool details.
   *
   * Retrieves information about a specific IP pool.
   *
   * @param poolName - Name of the pool
   * @returns Promise resolving to pool details
   *
   * @example
   * ```typescript
   * const response = await dedicatedIpService.getDedicatedIpPool('production-pool');
   *
   * const pool = response.dedicatedIpPool;
   * console.log('Pool name:', pool?.poolName);
   * console.log('Scaling mode:', pool?.scalingMode);
   * ```
   */
  async getDedicatedIpPool(poolName: string): Promise<GetDedicatedIpPoolResponse> {
    return this.get<GetDedicatedIpPoolResponse>(
      `/v2/email/dedicated-ip-pools/${encodeURIComponent(poolName)}`
    );
  }

  /**
   * List all dedicated IP pools.
   *
   * Returns a list of all IP pools in your account.
   *
   * @param options - List options including pagination
   * @returns Promise resolving to list of pool names
   *
   * @example
   * ```typescript
   * const response = await dedicatedIpService.listDedicatedIpPools();
   *
   * response.dedicatedIpPools?.forEach(poolName => {
   *   console.log('Pool:', poolName);
   * });
   * ```
   */
  async listDedicatedIpPools(options?: {
    nextToken?: string;
    pageSize?: number;
  }): Promise<ListDedicatedIpPoolsResponse> {
    const query = this.buildQuery({
      NextToken: options?.nextToken,
      PageSize: options?.pageSize,
    });

    return this.get<ListDedicatedIpPoolsResponse>('/v2/email/dedicated-ip-pools', query);
  }

  /**
   * Move a dedicated IP to a different pool.
   *
   * Assigns a dedicated IP address to a different IP pool.
   *
   * @param ip - The IP address to move
   * @param destinationPoolName - Name of the destination pool
   * @returns Promise resolving when IP is moved
   *
   * @example
   * ```typescript
   * // Move IP from one pool to another
   * await dedicatedIpService.putDedicatedIpInPool(
   *   '192.0.2.1',
   *   'new-pool'
   * );
   * ```
   */
  async putDedicatedIpInPool(ip: string, destinationPoolName: string): Promise<void> {
    await this.put(`/v2/email/dedicated-ips/${encodeURIComponent(ip)}/pool`, {
      destinationPoolName,
    });
  }

  /**
   * Set warmup attributes for a dedicated IP.
   *
   * Enables or disables automatic warmup for a dedicated IP address.
   * Warmup gradually increases sending volume to build sender reputation.
   *
   * @param ip - The IP address
   * @param warmupPercentage - Target warmup percentage (0-100)
   * @returns Promise resolving when warmup is configured
   *
   * @example
   * ```typescript
   * // Start warmup process
   * await dedicatedIpService.putDedicatedIpWarmupAttributes('192.0.2.1', 0);
   *
   * // Set to 50% warmup
   * await dedicatedIpService.putDedicatedIpWarmupAttributes('192.0.2.1', 50);
   *
   * // Complete warmup
   * await dedicatedIpService.putDedicatedIpWarmupAttributes('192.0.2.1', 100);
   * ```
   */
  async putDedicatedIpWarmupAttributes(ip: string, warmupPercentage: number): Promise<void> {
    await this.put(`/v2/email/dedicated-ips/${encodeURIComponent(ip)}/warmup`, {
      warmupPercentage,
    });
  }
}

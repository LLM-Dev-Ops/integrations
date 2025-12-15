/**
 * Azure Files - Lease Service
 *
 * Lease operations: acquire, renew, release, break.
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
import { parseAzureFilesError, LeaseError } from "../errors.js";
import { AzureAuthProvider } from "../auth/index.js";
import { HttpTransport, isSuccess, getRequestId, getHeader } from "../transport/index.js";
import { AcquireLeaseRequest, BreakLeaseRequest } from "../types/requests.js";
import { Lease, LeaseGuard } from "../types/common.js";

/**
 * Lease service for Azure Files operations.
 */
export class LeaseService {
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
   * Acquire a lease on a file.
   */
  async acquire(request: AcquireLeaseRequest): Promise<Lease> {
    validateShareName(request.share);
    validatePath(request.path);

    const endpoint = resolveEndpoint(this.config);
    const url = `${endpoint}/${request.share}/${encodePath(request.path)}?comp=lease`;

    const duration = request.durationSeconds ?? -1; // -1 for infinite

    const headers: Record<string, string> = {
      "x-ms-lease-action": "acquire",
      "x-ms-lease-duration": duration.toString(),
    };

    if (request.proposedLeaseId) {
      headers["x-ms-proposed-lease-id"] = request.proposedLeaseId;
    }

    const signed = this.authProvider.signRequest("PUT", url, headers, 0);

    const response = await this.transport.send({
      method: "PUT",
      url: signed.url,
      headers: signed.headers,
      timeout: getTimeout(this.config, "lease"),
    });

    if (!isSuccess(response)) {
      throw parseAzureFilesError(
        response.status,
        response.body.toString(),
        response.headers,
        getRequestId(response)
      );
    }

    const leaseId = getHeader(response, "x-ms-lease-id");
    if (!leaseId) {
      throw new LeaseError(
        "Lease ID not returned in response",
        "LeaseNotPresent",
        { share: request.share, path: request.path }
      );
    }

    return {
      id: leaseId,
      share: request.share,
      path: request.path,
      durationSeconds: duration === -1 ? undefined : duration,
      acquiredAt: new Date(),
    };
  }

  /**
   * Renew a lease.
   */
  async renew(lease: Lease): Promise<void> {
    validateShareName(lease.share);
    validatePath(lease.path);

    const endpoint = resolveEndpoint(this.config);
    const url = `${endpoint}/${lease.share}/${encodePath(lease.path)}?comp=lease`;

    const headers: Record<string, string> = {
      "x-ms-lease-action": "renew",
      "x-ms-lease-id": lease.id,
    };

    const signed = this.authProvider.signRequest("PUT", url, headers, 0);

    const response = await this.transport.send({
      method: "PUT",
      url: signed.url,
      headers: signed.headers,
      timeout: getTimeout(this.config, "lease"),
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
   * Release a lease.
   */
  async release(lease: Lease): Promise<void> {
    validateShareName(lease.share);
    validatePath(lease.path);

    const endpoint = resolveEndpoint(this.config);
    const url = `${endpoint}/${lease.share}/${encodePath(lease.path)}?comp=lease`;

    const headers: Record<string, string> = {
      "x-ms-lease-action": "release",
      "x-ms-lease-id": lease.id,
    };

    const signed = this.authProvider.signRequest("PUT", url, headers, 0);

    const response = await this.transport.send({
      method: "PUT",
      url: signed.url,
      headers: signed.headers,
      timeout: getTimeout(this.config, "lease"),
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
   * Break a lease.
   */
  async breakLease(request: BreakLeaseRequest): Promise<number> {
    validateShareName(request.share);
    validatePath(request.path);

    const endpoint = resolveEndpoint(this.config);
    const url = `${endpoint}/${request.share}/${encodePath(request.path)}?comp=lease`;

    const headers: Record<string, string> = {
      "x-ms-lease-action": "break",
    };

    if (request.breakPeriodSeconds !== undefined) {
      headers["x-ms-lease-break-period"] = request.breakPeriodSeconds.toString();
    }

    const signed = this.authProvider.signRequest("PUT", url, headers, 0);

    const response = await this.transport.send({
      method: "PUT",
      url: signed.url,
      headers: signed.headers,
      timeout: getTimeout(this.config, "lease"),
    });

    if (!isSuccess(response)) {
      throw parseAzureFilesError(
        response.status,
        response.body.toString(),
        response.headers,
        getRequestId(response)
      );
    }

    const leaseTime = getHeader(response, "x-ms-lease-time");
    return leaseTime ? parseInt(leaseTime, 10) : 0;
  }

  /**
   * Execute a function with a lease, auto-releasing when done.
   */
  async withLock<T>(
    request: AcquireLeaseRequest,
    fn: (guard: LeaseGuard) => Promise<T>
  ): Promise<T> {
    const lease = await this.acquire(request);
    const guard: LeaseGuard = { id: lease.id };

    try {
      const result = await fn(guard);
      await this.release(lease);
      return result;
    } catch (error) {
      // Best effort release on error
      try {
        await this.release(lease);
      } catch {
        // Ignore release errors on cleanup
      }
      throw error;
    }
  }
}

/**
 * Auto-renewing lease that runs a background renewal task.
 */
export class AutoRenewingLease {
  private lease: Lease;
  private service: LeaseService;
  private intervalMs: number;
  private timer?: ReturnType<typeof setInterval>;
  private cancelled: boolean = false;

  constructor(lease: Lease, service: LeaseService, renewalIntervalMs: number) {
    this.lease = lease;
    this.service = service;
    this.intervalMs = renewalIntervalMs;
    this.startRenewal();
  }

  /**
   * Get the lease ID.
   */
  get id(): string {
    return this.lease.id;
  }

  /**
   * Get the underlying lease.
   */
  getLease(): Lease {
    return this.lease;
  }

  /**
   * Release the lease and stop renewal.
   */
  async release(): Promise<void> {
    this.stopRenewal();
    await this.service.release(this.lease);
  }

  /**
   * Start the background renewal task.
   */
  private startRenewal(): void {
    this.timer = setInterval(async () => {
      if (this.cancelled) return;

      try {
        await this.service.renew(this.lease);
      } catch (error) {
        // Log error but don't stop - let it fail on next operation
        console.error("Lease renewal failed:", error);
      }
    }, this.intervalMs);
  }

  /**
   * Stop the background renewal task.
   */
  private stopRenewal(): void {
    this.cancelled = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}

/**
 * Create an auto-renewing lease.
 */
export function createAutoRenewingLease(
  lease: Lease,
  service: LeaseService,
  renewalIntervalMs?: number
): AutoRenewingLease {
  // Default to renewing at half the lease duration, or every 10 seconds for infinite leases
  const interval = renewalIntervalMs ??
    (lease.durationSeconds ? (lease.durationSeconds * 1000) / 2 : 10000);

  return new AutoRenewingLease(lease, service, interval);
}

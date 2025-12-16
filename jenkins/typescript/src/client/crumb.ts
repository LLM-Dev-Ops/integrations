/**
 * Crumb/CSRF handling for Jenkins API.
 *
 * Jenkins uses CSRF protection via a crumb issuer. This module handles:
 * - Fetching crumbs from /crumbIssuer/api/json
 * - Caching crumbs with TTL
 * - Automatic crumb refresh
 * - Handling cases where crumb issuer is disabled
 *
 * @module client/crumb
 */

import { JenkinsError, JenkinsErrorKind } from '../types/errors.js';
import { fetch } from 'undici';

/**
 * Crumb token with metadata.
 */
export interface Crumb {
  /** Crumb header field name (e.g., "Jenkins-Crumb") */
  field: string;
  /** Crumb token value */
  value: string;
  /** Timestamp when the crumb expires (milliseconds since epoch) */
  expiresAt: number;
}

/**
 * Raw crumb response from Jenkins API.
 */
interface CrumbResponse {
  crumb: string;
  crumbRequestField: string;
}

/**
 * Manages Jenkins crumb tokens with caching and automatic refresh.
 */
export class CrumbManager {
  private cachedCrumb: Crumb | null = null;
  private fetchPromise: Promise<Crumb | null> | null = null;
  private readonly ttlMs: number;
  private readonly enabled: boolean;

  /**
   * Create a new CrumbManager.
   *
   * @param baseUrl - Jenkins base URL
   * @param getAuthHeader - Function to get Authorization header value
   * @param enabled - Whether crumb handling is enabled
   * @param ttlMs - Time to live for cached crumb in milliseconds (default: 5 minutes)
   */
  constructor(
    private readonly baseUrl: string,
    private readonly getAuthHeader: () => Promise<string | null> | string | null,
    enabled: boolean = true,
    ttlMs: number = 5 * 60 * 1000
  ) {
    this.enabled = enabled;
    this.ttlMs = ttlMs;
  }

  /**
   * Get a valid crumb, fetching a new one if necessary.
   * Returns null if crumb issuer is disabled.
   *
   * @returns Promise resolving to Crumb or null
   * @throws JenkinsError if crumb fetch fails
   */
  async getOrFetch(): Promise<Crumb | null> {
    if (!this.enabled) {
      return null;
    }

    // Check if cached crumb is still valid
    if (this.cachedCrumb && Date.now() < this.cachedCrumb.expiresAt) {
      return this.cachedCrumb;
    }

    // If a fetch is already in progress, wait for it
    if (this.fetchPromise) {
      return this.fetchPromise;
    }

    // Fetch a new crumb
    this.fetchPromise = this.fetchCrumb()
      .finally(() => {
        this.fetchPromise = null;
      });

    return this.fetchPromise;
  }

  /**
   * Invalidate the cached crumb, forcing a refresh on next request.
   */
  invalidate(): void {
    this.cachedCrumb = null;
  }

  /**
   * Fetch a fresh crumb from Jenkins.
   */
  private async fetchCrumb(): Promise<Crumb | null> {
    const url = `${this.baseUrl}/crumbIssuer/api/json`;

    try {
      const headers: Record<string, string> = {
        'Accept': 'application/json',
      };

      // Add authentication header
      const authHeader = await this.getAuthHeader();
      if (authHeader) {
        headers['Authorization'] = authHeader;
      }

      const response = await fetch(url, {
        method: 'GET',
        headers,
      });

      // If 404, crumb issuer is disabled - this is not an error
      if (response.status === 404) {
        // Cache a null result to avoid repeated 404s
        return null;
      }

      if (!response.ok) {
        throw JenkinsError.fromResponse(
          response.status,
          `Failed to fetch crumb: ${response.statusText}`
        );
      }

      const data = await response.json() as CrumbResponse;

      // Create crumb with expiration time
      const crumb: Crumb = {
        field: data.crumbRequestField,
        value: data.crumb,
        expiresAt: Date.now() + this.ttlMs,
      };

      this.cachedCrumb = crumb;
      return crumb;
    } catch (error) {
      // If it's a 404, crumb issuer is disabled
      if (error instanceof JenkinsError && error.statusCode === 404) {
        return null;
      }

      // Network or other errors
      if (error instanceof Error && error.message.includes('fetch')) {
        throw new JenkinsError(
          JenkinsErrorKind.NetworkError,
          `Failed to fetch crumb: ${error.message}`,
          { cause: error }
        );
      }

      throw error;
    }
  }

  /**
   * Get the current cached crumb without fetching.
   *
   * @returns Cached crumb or null
   */
  getCached(): Crumb | null {
    if (this.cachedCrumb && Date.now() < this.cachedCrumb.expiresAt) {
      return this.cachedCrumb;
    }
    return null;
  }

  /**
   * Check if crumb handling is enabled.
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}

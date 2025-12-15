/**
 * Copy Blob Operations
 *
 * Server-side blob copy within and across containers.
 */

import type { CopyRequest, CopyResponse, CopyStatus } from '../types/index.js';
import type { AuthProvider } from '../auth/index.js';
import type { NormalizedBlobStorageConfig } from '../client/config.js';
import { ValidationError, createErrorFromResponse, CopyFailedError, CopyAbortedError } from '../errors/index.js';

/** Generate a UUID v4 for request IDs */
function generateUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Sleep for a given duration */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Copy blob executor
 */
export class BlobCopier {
  constructor(
    private readonly config: NormalizedBlobStorageConfig,
    private readonly authProvider: AuthProvider
  ) {}

  /**
   * Copy a blob
   */
  async copy(request: CopyRequest): Promise<CopyResponse> {
    // Resolve destination container
    const destContainer = request.destContainer ?? this.config.defaultContainer;
    if (!destContainer) {
      throw new ValidationError({
        message: 'Destination container name is required',
        field: 'destContainer',
      });
    }

    // Validate destination blob name
    if (!request.destBlobName) {
      throw new ValidationError({
        message: 'Destination blob name is required',
        field: 'destBlobName',
      });
    }

    // Validate source URL
    if (!request.sourceUrl) {
      throw new ValidationError({
        message: 'Source URL is required',
        field: 'sourceUrl',
      });
    }

    // Build URL
    const url = `${this.config.endpoint}/${encodeURIComponent(destContainer)}/${encodeURIComponent(request.destBlobName)}`;

    // Build headers
    const headers: Record<string, string> = {
      'x-ms-version': '2023-11-03',
      'x-ms-client-request-id': generateUuid(),
      'x-ms-copy-source': request.sourceUrl,
    };

    // Access tier
    if (request.accessTier) {
      headers['x-ms-access-tier'] = request.accessTier;
    }

    // Metadata
    if (request.metadata) {
      for (const [key, value] of Object.entries(request.metadata)) {
        headers[`x-ms-meta-${key}`] = value;
      }
    }

    // Add authentication
    const [authHeader, authValue] = await this.authProvider.getAuthHeader();
    if (authHeader) {
      headers[authHeader] = authValue;
    }

    // Handle SAS token
    let finalUrl = url;
    if (this.authProvider.getAuthUrl) {
      finalUrl = await this.authProvider.getAuthUrl(url);
    }

    const response = await fetch(finalUrl, {
      method: 'PUT',
      headers,
      signal: request.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw createErrorFromResponse(
        response.status,
        errorBody,
        Object.fromEntries(response.headers.entries()),
        destContainer,
        request.destBlobName
      );
    }

    const copyId = response.headers.get('x-ms-copy-id') ?? '';
    const copyStatus = (response.headers.get('x-ms-copy-status') ?? 'pending') as CopyStatus;

    // If async copy and waiting requested, poll for completion
    if (copyStatus === 'pending' && request.waitForCompletion) {
      return this.waitForCopyCompletion(
        destContainer,
        request.destBlobName,
        copyId,
        request.pollInterval ?? 1000,
        request.signal
      );
    }

    return {
      copyId,
      copyStatus,
      etag: response.headers.get('ETag') ?? undefined,
      lastModified: response.headers.get('Last-Modified')
        ? new Date(response.headers.get('Last-Modified')!)
        : undefined,
      versionId: response.headers.get('x-ms-version-id') ?? undefined,
      copyProgress: response.headers.get('x-ms-copy-progress') ?? undefined,
      clientRequestId: headers['x-ms-client-request-id'],
      requestId: response.headers.get('x-ms-request-id') ?? undefined,
    };
  }

  /**
   * Wait for async copy to complete
   */
  private async waitForCopyCompletion(
    container: string,
    blobName: string,
    copyId: string,
    pollInterval: number,
    signal?: AbortSignal
  ): Promise<CopyResponse> {
    while (true) {
      // Check for abort
      if (signal?.aborted) {
        throw new Error('Copy operation aborted');
      }

      // Get blob properties
      const properties = await this.getBlobProperties(container, blobName);

      switch (properties.copyStatus) {
        case 'success':
          return {
            copyId,
            copyStatus: 'success',
            etag: properties.etag,
            lastModified: properties.lastModified,
            copyProgress: properties.copyProgress,
          };

        case 'failed':
          throw new CopyFailedError({
            message: properties.copyStatusDescription ?? 'Copy operation failed',
            copyId,
            container,
            blobName,
          });

        case 'aborted':
          throw new CopyAbortedError({
            message: 'Copy operation was aborted',
            copyId,
            container,
            blobName,
          });

        case 'pending':
          await sleep(pollInterval);
          break;

        default:
          // Unknown status, wait and retry
          await sleep(pollInterval);
      }
    }
  }

  /**
   * Get blob properties for copy status
   */
  private async getBlobProperties(
    container: string,
    blobName: string
  ): Promise<{
    copyStatus?: CopyStatus;
    copyStatusDescription?: string;
    copyProgress?: string;
    etag?: string;
    lastModified?: Date;
  }> {
    const url = `${this.config.endpoint}/${encodeURIComponent(container)}/${encodeURIComponent(blobName)}`;

    const headers: Record<string, string> = {
      'x-ms-version': '2023-11-03',
    };

    // Add authentication
    const [authHeader, authValue] = await this.authProvider.getAuthHeader();
    if (authHeader) {
      headers[authHeader] = authValue;
    }

    // Handle SAS token
    let finalUrl = url;
    if (this.authProvider.getAuthUrl) {
      finalUrl = await this.authProvider.getAuthUrl(url);
    }

    const response = await fetch(finalUrl, {
      method: 'HEAD',
      headers,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw createErrorFromResponse(
        response.status,
        errorBody,
        Object.fromEntries(response.headers.entries()),
        container,
        blobName
      );
    }

    return {
      copyStatus: response.headers.get('x-ms-copy-status') as CopyStatus | undefined,
      copyStatusDescription: response.headers.get('x-ms-copy-status-description') ?? undefined,
      copyProgress: response.headers.get('x-ms-copy-progress') ?? undefined,
      etag: response.headers.get('ETag') ?? undefined,
      lastModified: response.headers.get('Last-Modified')
        ? new Date(response.headers.get('Last-Modified')!)
        : undefined,
    };
  }

  /**
   * Abort a pending copy operation
   */
  async abortCopy(container: string, blobName: string, copyId: string): Promise<void> {
    const url = `${this.config.endpoint}/${encodeURIComponent(container)}/${encodeURIComponent(blobName)}?comp=copy&copyid=${encodeURIComponent(copyId)}`;

    const headers: Record<string, string> = {
      'x-ms-version': '2023-11-03',
      'x-ms-copy-action': 'abort',
    };

    // Add authentication
    const [authHeader, authValue] = await this.authProvider.getAuthHeader();
    if (authHeader) {
      headers[authHeader] = authValue;
    }

    // Handle SAS token
    let finalUrl = url;
    if (this.authProvider.getAuthUrl) {
      finalUrl = await this.authProvider.getAuthUrl(url);
    }

    const response = await fetch(finalUrl, {
      method: 'PUT',
      headers,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw createErrorFromResponse(
        response.status,
        errorBody,
        Object.fromEntries(response.headers.entries()),
        container,
        blobName
      );
    }
  }
}

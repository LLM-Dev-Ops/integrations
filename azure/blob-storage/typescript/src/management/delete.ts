/**
 * Delete Blob Operations
 *
 * Delete blobs, versions, and snapshots.
 */

import type { DeleteRequest, DeleteResponse } from '../types/index.js';
import type { AuthProvider } from '../auth/index.js';
import type { NormalizedBlobStorageConfig } from '../client/config.js';
import { ValidationError, createErrorFromResponse } from '../errors/index.js';

/** Generate a UUID v4 for request IDs */
function generateUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Delete blob executor
 */
export class BlobDeleter {
  constructor(
    private readonly config: NormalizedBlobStorageConfig,
    private readonly authProvider: AuthProvider
  ) {}

  /**
   * Delete a blob
   */
  async delete(request: DeleteRequest): Promise<DeleteResponse> {
    // Resolve container
    const container = request.container ?? this.config.defaultContainer;
    if (!container) {
      throw new ValidationError({
        message: 'Container name is required',
        field: 'container',
      });
    }

    // Validate blob name
    if (!request.blobName) {
      throw new ValidationError({
        message: 'Blob name is required',
        field: 'blobName',
      });
    }

    // Build URL
    let url = `${this.config.endpoint}/${encodeURIComponent(container)}/${encodeURIComponent(request.blobName)}`;

    // Add version or snapshot query params
    const params = new URLSearchParams();
    if (request.versionId) {
      params.set('versionId', request.versionId);
    }
    if (request.snapshot) {
      params.set('snapshot', request.snapshot);
    }
    if (params.toString()) {
      url += `?${params.toString()}`;
    }

    // Build headers
    const headers: Record<string, string> = {
      'x-ms-version': '2023-11-03',
      'x-ms-client-request-id': generateUuid(),
    };

    // Delete snapshots option
    if (request.deleteSnapshots && request.deleteSnapshots !== 'none') {
      headers['x-ms-delete-snapshots'] = request.deleteSnapshots;
    }

    // Conditional delete
    if (request.ifMatch) {
      headers['If-Match'] = request.ifMatch;
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
      method: 'DELETE',
      headers,
      signal: request.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw createErrorFromResponse(
        response.status,
        errorBody,
        Object.fromEntries(response.headers.entries()),
        container,
        request.blobName
      );
    }

    return {
      deleted: true,
      clientRequestId: headers['x-ms-client-request-id'],
      requestId: response.headers.get('x-ms-request-id') ?? undefined,
    };
  }

  /**
   * Delete multiple blobs in batch
   * Note: This is a convenience method that makes multiple requests
   * For true batch operations, use the Azure batch API
   */
  async deleteMany(
    container: string,
    blobNames: string[],
    options?: Pick<DeleteRequest, 'deleteSnapshots' | 'signal'>
  ): Promise<Map<string, DeleteResponse | Error>> {
    const results = new Map<string, DeleteResponse | Error>();

    await Promise.all(
      blobNames.map(async (blobName) => {
        try {
          const response = await this.delete({
            container,
            blobName,
            deleteSnapshots: options?.deleteSnapshots,
            signal: options?.signal,
          });
          results.set(blobName, response);
        } catch (error) {
          results.set(blobName, error instanceof Error ? error : new Error(String(error)));
        }
      })
    );

    return results;
  }
}

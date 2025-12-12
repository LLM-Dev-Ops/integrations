/**
 * Revisions service for Google Drive API.
 *
 * Manages file revision history.
 */

import {
  Revision,
  RevisionList,
  UpdateRevisionRequest,
  ListRevisionsParams,
} from '../types';

/**
 * HTTP transport interface.
 */
export interface RevisionTransport {
  request<T>(url: string, options: RequestOptions): Promise<T>;
  download(url: string, options?: RequestOptions): Promise<ArrayBuffer>;
}

/**
 * Request options.
 */
export interface RequestOptions {
  method?: string;
  body?: any;
  params?: Record<string, any>;
}

/**
 * Revisions service interface.
 */
export interface RevisionsService {
  /**
   * List revisions for a file.
   *
   * @param fileId - File ID
   * @param params - Optional list parameters
   * @returns Revision list with pagination
   */
  list(fileId: string, params?: ListRevisionsParams): Promise<RevisionList>;

  /**
   * Get a specific revision.
   *
   * @param fileId - File ID
   * @param revisionId - Revision ID
   * @returns The revision
   */
  get(fileId: string, revisionId: string): Promise<Revision>;

  /**
   * Download a specific revision's content.
   *
   * @param fileId - File ID
   * @param revisionId - Revision ID
   * @returns The revision content
   */
  download(fileId: string, revisionId: string): Promise<ArrayBuffer>;

  /**
   * Update a revision.
   *
   * @param fileId - File ID
   * @param revisionId - Revision ID
   * @param request - Update request
   * @returns The updated revision
   */
  update(fileId: string, revisionId: string, request: UpdateRevisionRequest): Promise<Revision>;

  /**
   * Delete a revision.
   *
   * @param fileId - File ID
   * @param revisionId - Revision ID
   */
  delete(fileId: string, revisionId: string): Promise<void>;
}

/**
 * Implementation of RevisionsService.
 */
export class RevisionsServiceImpl implements RevisionsService {
  private readonly baseUrl = 'https://www.googleapis.com/drive/v3';

  constructor(private transport: RevisionTransport) {}

  async list(fileId: string, params?: ListRevisionsParams): Promise<RevisionList> {
    return this.transport.request<RevisionList>(
      `${this.baseUrl}/files/${fileId}/revisions`,
      {
        method: 'GET',
        params: params as any,
      }
    );
  }

  async get(fileId: string, revisionId: string): Promise<Revision> {
    return this.transport.request<Revision>(
      `${this.baseUrl}/files/${fileId}/revisions/${revisionId}`,
      {
        method: 'GET',
      }
    );
  }

  async download(fileId: string, revisionId: string): Promise<ArrayBuffer> {
    return this.transport.download(
      `${this.baseUrl}/files/${fileId}/revisions/${revisionId}?alt=media`
    );
  }

  async update(
    fileId: string,
    revisionId: string,
    request: UpdateRevisionRequest
  ): Promise<Revision> {
    return this.transport.request<Revision>(
      `${this.baseUrl}/files/${fileId}/revisions/${revisionId}`,
      {
        method: 'PATCH',
        body: request,
      }
    );
  }

  async delete(fileId: string, revisionId: string): Promise<void> {
    await this.transport.request<void>(
      `${this.baseUrl}/files/${fileId}/revisions/${revisionId}`,
      {
        method: 'DELETE',
      }
    );
  }
}

/**
 * Mock implementation for testing.
 */
export class MockRevisionsService implements RevisionsService {
  private revisions = new Map<string, Map<string, Revision>>();
  private nextId = 1;

  async list(fileId: string, params?: ListRevisionsParams): Promise<RevisionList> {
    const fileRevisions = this.revisions.get(fileId);
    const revisions = fileRevisions ? Array.from(fileRevisions.values()) : [];

    return {
      kind: 'drive#revisionList',
      revisions,
    };
  }

  async get(fileId: string, revisionId: string): Promise<Revision> {
    const fileRevisions = this.revisions.get(fileId);
    if (!fileRevisions) {
      throw new Error(`File not found: ${fileId}`);
    }

    const revision = fileRevisions.get(revisionId);
    if (!revision) {
      throw new Error(`Revision not found: ${revisionId}`);
    }

    return revision;
  }

  async download(fileId: string, revisionId: string): Promise<ArrayBuffer> {
    await this.get(fileId, revisionId); // Validate existence
    return new ArrayBuffer(1024);
  }

  async update(
    fileId: string,
    revisionId: string,
    request: UpdateRevisionRequest
  ): Promise<Revision> {
    const revision = await this.get(fileId, revisionId);
    Object.assign(revision, request);
    return revision;
  }

  async delete(fileId: string, revisionId: string): Promise<void> {
    const fileRevisions = this.revisions.get(fileId);
    if (fileRevisions) {
      fileRevisions.delete(revisionId);
    }
  }

  /**
   * Helper method to add a mock revision.
   */
  addRevision(fileId: string, revision?: Partial<Revision>): Revision {
    if (!this.revisions.has(fileId)) {
      this.revisions.set(fileId, new Map());
    }

    const rev: Revision = {
      kind: 'drive#revision',
      id: `revision-${this.nextId++}`,
      mimeType: 'text/plain',
      modifiedTime: new Date().toISOString(),
      keepForever: false,
      published: false,
      publishAuto: false,
      publishedOutsideDomain: false,
      ...revision,
    };

    this.revisions.get(fileId)!.set(rev.id, rev);
    return rev;
  }
}

/**
 * Create a mock revisions service.
 */
export function createMockRevisionsService(): MockRevisionsService {
  return new MockRevisionsService();
}

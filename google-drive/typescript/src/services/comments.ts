/**
 * Comments service for Google Drive API.
 *
 * Manages comments on files.
 */

import {
  Comment,
  CommentList,
  CreateCommentRequest,
  UpdateCommentRequest,
  ListCommentsParams,
} from '../types';

/**
 * HTTP transport interface.
 */
export interface CommentTransport {
  request<T>(url: string, options: RequestOptions): Promise<T>;
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
 * Comments service interface.
 */
export interface CommentsService {
  /**
   * Create a new comment.
   *
   * @param fileId - File ID
   * @param request - Comment creation request
   * @returns The created comment
   */
  create(fileId: string, request: CreateCommentRequest): Promise<Comment>;

  /**
   * List comments for a file.
   *
   * @param fileId - File ID
   * @param params - Optional list parameters
   * @returns Comment list with pagination
   */
  list(fileId: string, params?: ListCommentsParams): Promise<CommentList>;

  /**
   * Get a specific comment.
   *
   * @param fileId - File ID
   * @param commentId - Comment ID
   * @returns The comment
   */
  get(fileId: string, commentId: string): Promise<Comment>;

  /**
   * Update a comment.
   *
   * @param fileId - File ID
   * @param commentId - Comment ID
   * @param request - Update request
   * @returns The updated comment
   */
  update(fileId: string, commentId: string, request: UpdateCommentRequest): Promise<Comment>;

  /**
   * Delete a comment.
   *
   * @param fileId - File ID
   * @param commentId - Comment ID
   */
  delete(fileId: string, commentId: string): Promise<void>;
}

/**
 * Implementation of CommentsService.
 */
export class CommentsServiceImpl implements CommentsService {
  private readonly baseUrl = 'https://www.googleapis.com/drive/v3';

  constructor(private transport: CommentTransport) {}

  async create(fileId: string, request: CreateCommentRequest): Promise<Comment> {
    return this.transport.request<Comment>(`${this.baseUrl}/files/${fileId}/comments`, {
      method: 'POST',
      body: request,
    });
  }

  async list(fileId: string, params?: ListCommentsParams): Promise<CommentList> {
    return this.transport.request<CommentList>(`${this.baseUrl}/files/${fileId}/comments`, {
      method: 'GET',
      params: params as any,
    });
  }

  async get(fileId: string, commentId: string): Promise<Comment> {
    return this.transport.request<Comment>(
      `${this.baseUrl}/files/${fileId}/comments/${commentId}`,
      {
        method: 'GET',
      }
    );
  }

  async update(fileId: string, commentId: string, request: UpdateCommentRequest): Promise<Comment> {
    return this.transport.request<Comment>(
      `${this.baseUrl}/files/${fileId}/comments/${commentId}`,
      {
        method: 'PATCH',
        body: request,
      }
    );
  }

  async delete(fileId: string, commentId: string): Promise<void> {
    await this.transport.request<void>(
      `${this.baseUrl}/files/${fileId}/comments/${commentId}`,
      {
        method: 'DELETE',
      }
    );
  }
}

/**
 * Mock implementation for testing.
 */
export class MockCommentsService implements CommentsService {
  private comments = new Map<string, Map<string, Comment>>();
  private nextId = 1;

  async create(fileId: string, request: CreateCommentRequest): Promise<Comment> {
    if (!this.comments.has(fileId)) {
      this.comments.set(fileId, new Map());
    }

    const now = new Date().toISOString();
    const comment: Comment = {
      kind: 'drive#comment',
      id: `comment-${this.nextId++}`,
      createdTime: now,
      modifiedTime: now,
      author: {
        kind: 'drive#user',
        displayName: 'Mock User',
        photoLink: '',
        me: true,
        permissionId: 'permission-1',
        emailAddress: 'user@example.com',
      },
      htmlContent: request.content,
      content: request.content,
      deleted: false,
      resolved: false,
      anchor: request.anchor,
      quotedFileContent: request.quotedFileContent,
      replies: [],
    };

    this.comments.get(fileId)!.set(comment.id, comment);
    return comment;
  }

  async list(fileId: string, params?: ListCommentsParams): Promise<CommentList> {
    const fileComments = this.comments.get(fileId);
    const comments = fileComments ? Array.from(fileComments.values()) : [];

    return {
      kind: 'drive#commentList',
      comments,
    };
  }

  async get(fileId: string, commentId: string): Promise<Comment> {
    const fileComments = this.comments.get(fileId);
    if (!fileComments) {
      throw new Error(`File not found: ${fileId}`);
    }

    const comment = fileComments.get(commentId);
    if (!comment) {
      throw new Error(`Comment not found: ${commentId}`);
    }

    return comment;
  }

  async update(fileId: string, commentId: string, request: UpdateCommentRequest): Promise<Comment> {
    const comment = await this.get(fileId, commentId);
    comment.content = request.content;
    comment.htmlContent = request.content;
    comment.modifiedTime = new Date().toISOString();
    return comment;
  }

  async delete(fileId: string, commentId: string): Promise<void> {
    const fileComments = this.comments.get(fileId);
    if (fileComments) {
      fileComments.delete(commentId);
    }
  }
}

/**
 * Create a mock comments service.
 */
export function createMockCommentsService(): CommentsService {
  return new MockCommentsService();
}

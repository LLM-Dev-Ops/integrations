/**
 * Replies service for Google Drive API.
 *
 * Manages replies to comments.
 */

import {
  Reply,
  ReplyList,
  CreateReplyRequest,
  UpdateReplyRequest,
  ListRepliesParams,
} from '../types';

/**
 * HTTP transport interface.
 */
export interface ReplyTransport {
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
 * Replies service interface.
 */
export interface RepliesService {
  /**
   * Create a new reply.
   *
   * @param fileId - File ID
   * @param commentId - Comment ID
   * @param request - Reply creation request
   * @returns The created reply
   */
  create(fileId: string, commentId: string, request: CreateReplyRequest): Promise<Reply>;

  /**
   * List replies for a comment.
   *
   * @param fileId - File ID
   * @param commentId - Comment ID
   * @param params - Optional list parameters
   * @returns Reply list with pagination
   */
  list(fileId: string, commentId: string, params?: ListRepliesParams): Promise<ReplyList>;

  /**
   * Get a specific reply.
   *
   * @param fileId - File ID
   * @param commentId - Comment ID
   * @param replyId - Reply ID
   * @returns The reply
   */
  get(fileId: string, commentId: string, replyId: string): Promise<Reply>;

  /**
   * Update a reply.
   *
   * @param fileId - File ID
   * @param commentId - Comment ID
   * @param replyId - Reply ID
   * @param request - Update request
   * @returns The updated reply
   */
  update(
    fileId: string,
    commentId: string,
    replyId: string,
    request: UpdateReplyRequest
  ): Promise<Reply>;

  /**
   * Delete a reply.
   *
   * @param fileId - File ID
   * @param commentId - Comment ID
   * @param replyId - Reply ID
   */
  delete(fileId: string, commentId: string, replyId: string): Promise<void>;
}

/**
 * Implementation of RepliesService.
 */
export class RepliesServiceImpl implements RepliesService {
  private readonly baseUrl = 'https://www.googleapis.com/drive/v3';

  constructor(private transport: ReplyTransport) {}

  async create(fileId: string, commentId: string, request: CreateReplyRequest): Promise<Reply> {
    return this.transport.request<Reply>(
      `${this.baseUrl}/files/${fileId}/comments/${commentId}/replies`,
      {
        method: 'POST',
        body: request,
      }
    );
  }

  async list(fileId: string, commentId: string, params?: ListRepliesParams): Promise<ReplyList> {
    return this.transport.request<ReplyList>(
      `${this.baseUrl}/files/${fileId}/comments/${commentId}/replies`,
      {
        method: 'GET',
        params: params as any,
      }
    );
  }

  async get(fileId: string, commentId: string, replyId: string): Promise<Reply> {
    return this.transport.request<Reply>(
      `${this.baseUrl}/files/${fileId}/comments/${commentId}/replies/${replyId}`,
      {
        method: 'GET',
      }
    );
  }

  async update(
    fileId: string,
    commentId: string,
    replyId: string,
    request: UpdateReplyRequest
  ): Promise<Reply> {
    return this.transport.request<Reply>(
      `${this.baseUrl}/files/${fileId}/comments/${commentId}/replies/${replyId}`,
      {
        method: 'PATCH',
        body: request,
      }
    );
  }

  async delete(fileId: string, commentId: string, replyId: string): Promise<void> {
    await this.transport.request<void>(
      `${this.baseUrl}/files/${fileId}/comments/${commentId}/replies/${replyId}`,
      {
        method: 'DELETE',
      }
    );
  }
}

/**
 * Mock implementation for testing.
 */
export class MockRepliesService implements RepliesService {
  private replies = new Map<string, Map<string, Map<string, Reply>>>();
  private nextId = 1;

  async create(fileId: string, commentId: string, request: CreateReplyRequest): Promise<Reply> {
    if (!this.replies.has(fileId)) {
      this.replies.set(fileId, new Map());
    }
    if (!this.replies.get(fileId)!.has(commentId)) {
      this.replies.get(fileId)!.set(commentId, new Map());
    }

    const now = new Date().toISOString();
    const reply: Reply = {
      kind: 'drive#reply',
      id: `reply-${this.nextId++}`,
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
      action: request.action,
    };

    this.replies.get(fileId)!.get(commentId)!.set(reply.id, reply);
    return reply;
  }

  async list(fileId: string, commentId: string, params?: ListRepliesParams): Promise<ReplyList> {
    const commentReplies = this.replies.get(fileId)?.get(commentId);
    const replies = commentReplies ? Array.from(commentReplies.values()) : [];

    return {
      kind: 'drive#replyList',
      replies,
    };
  }

  async get(fileId: string, commentId: string, replyId: string): Promise<Reply> {
    const commentReplies = this.replies.get(fileId)?.get(commentId);
    if (!commentReplies) {
      throw new Error(`Comment not found: ${commentId}`);
    }

    const reply = commentReplies.get(replyId);
    if (!reply) {
      throw new Error(`Reply not found: ${replyId}`);
    }

    return reply;
  }

  async update(
    fileId: string,
    commentId: string,
    replyId: string,
    request: UpdateReplyRequest
  ): Promise<Reply> {
    const reply = await this.get(fileId, commentId, replyId);
    reply.content = request.content;
    reply.htmlContent = request.content;
    reply.action = request.action;
    reply.modifiedTime = new Date().toISOString();
    return reply;
  }

  async delete(fileId: string, commentId: string, replyId: string): Promise<void> {
    const commentReplies = this.replies.get(fileId)?.get(commentId);
    if (commentReplies) {
      commentReplies.delete(replyId);
    }
  }
}

/**
 * Create a mock replies service.
 */
export function createMockRepliesService(): RepliesService {
  return new MockRepliesService();
}

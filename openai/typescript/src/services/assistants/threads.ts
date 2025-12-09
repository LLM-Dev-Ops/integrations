import type { RequestOptions } from '../../types/common.js';
import type { AssistantToolResources } from './types.js';

export interface Thread {
  id: string;
  object: 'thread';
  created_at: number;
  metadata: Record<string, string>;
  tool_resources?: AssistantToolResources | null;
}

export interface ThreadCreateRequest {
  messages?: ThreadMessageCreateRequest[];
  metadata?: Record<string, string>;
  tool_resources?: AssistantToolResources;
}

export interface ThreadMessageCreateRequest {
  role: 'user' | 'assistant';
  content: string;
  attachments?: MessageAttachment[];
  metadata?: Record<string, string>;
}

export interface MessageAttachment {
  file_id: string;
  tools: { type: 'code_interpreter' | 'file_search' }[];
}

export interface ThreadUpdateRequest {
  metadata?: Record<string, string>;
  tool_resources?: AssistantToolResources;
}

export interface ThreadDeleteResponse {
  id: string;
  object: 'thread.deleted';
  deleted: boolean;
}

export type ThreadCreateParams = ThreadCreateRequest & RequestOptions;
export type ThreadUpdateParams = ThreadUpdateRequest & RequestOptions;
export type ThreadRetrieveParams = RequestOptions;
export type ThreadDeleteParams = RequestOptions;

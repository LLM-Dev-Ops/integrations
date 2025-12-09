import type { RequestOptions, PaginatedResponse } from '../../types/common.js';
import type { MessageAttachment } from './threads.js';

export type MessageRole = 'user' | 'assistant';
export type MessageStatus = 'in_progress' | 'incomplete' | 'completed';

export interface Message {
  id: string;
  object: 'thread.message';
  created_at: number;
  thread_id: string;
  status: MessageStatus;
  incomplete_details: MessageIncompleteDetails | null;
  completed_at: number | null;
  incomplete_at: number | null;
  role: MessageRole;
  content: MessageContent[];
  assistant_id: string | null;
  run_id: string | null;
  attachments: MessageAttachment[] | null;
  metadata: Record<string, string>;
}

export interface MessageIncompleteDetails {
  reason: 'content_filter' | 'max_tokens' | 'run_cancelled' | 'run_expired' | 'run_failed';
}

export type MessageContent = MessageContentText | MessageContentImageFile | MessageContentImageUrl;

export interface MessageContentText {
  type: 'text';
  text: {
    value: string;
    annotations: MessageContentAnnotation[];
  };
}

export interface MessageContentImageFile {
  type: 'image_file';
  image_file: {
    file_id: string;
    detail?: 'auto' | 'low' | 'high';
  };
}

export interface MessageContentImageUrl {
  type: 'image_url';
  image_url: {
    url: string;
    detail?: 'auto' | 'low' | 'high';
  };
}

export type MessageContentAnnotation =
  | MessageContentAnnotationFileCitation
  | MessageContentAnnotationFilePath;

export interface MessageContentAnnotationFileCitation {
  type: 'file_citation';
  text: string;
  file_citation: {
    file_id: string;
    quote: string;
  };
  start_index: number;
  end_index: number;
}

export interface MessageContentAnnotationFilePath {
  type: 'file_path';
  text: string;
  file_path: {
    file_id: string;
  };
  start_index: number;
  end_index: number;
}

export interface MessageCreateRequest {
  role: MessageRole;
  content: string;
  attachments?: MessageAttachment[];
  metadata?: Record<string, string>;
}

export interface MessageUpdateRequest {
  metadata?: Record<string, string>;
}

export interface MessageListParams {
  limit?: number;
  order?: 'asc' | 'desc';
  after?: string;
  before?: string;
  run_id?: string;
}

export type MessageListResponse = PaginatedResponse<Message>;

export type MessageCreateParams = MessageCreateRequest & RequestOptions;
export type MessageUpdateParams = MessageUpdateRequest & RequestOptions;
export type MessageListRequestParams = MessageListParams & RequestOptions;
export type MessageRetrieveParams = RequestOptions;
export type MessageDeleteParams = RequestOptions;

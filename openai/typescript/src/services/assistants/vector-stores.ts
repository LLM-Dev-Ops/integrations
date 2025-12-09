import type { RequestOptions, PaginatedResponse } from '../../types/common.js';

export type VectorStoreStatus = 'expired' | 'in_progress' | 'completed';
export type VectorStoreFileStatus = 'in_progress' | 'completed' | 'cancelled' | 'failed';

export interface VectorStore {
  id: string;
  object: 'vector_store';
  created_at: number;
  name: string;
  usage_bytes: number;
  file_counts: VectorStoreFileCounts;
  status: VectorStoreStatus;
  expires_after?: VectorStoreExpiresAfter;
  expires_at?: number | null;
  last_active_at: number | null;
  metadata: Record<string, string>;
}

export interface VectorStoreFileCounts {
  in_progress: number;
  completed: number;
  failed: number;
  cancelled: number;
  total: number;
}

export interface VectorStoreExpiresAfter {
  anchor: 'last_active_at';
  days: number;
}

export interface VectorStoreCreateRequest {
  file_ids?: string[];
  name?: string;
  expires_after?: VectorStoreExpiresAfter;
  metadata?: Record<string, string>;
}

export interface VectorStoreUpdateRequest {
  name?: string | null;
  expires_after?: VectorStoreExpiresAfter | null;
  metadata?: Record<string, string>;
}

export interface VectorStoreListParams {
  limit?: number;
  order?: 'asc' | 'desc';
  after?: string;
  before?: string;
}

export type VectorStoreListResponse = PaginatedResponse<VectorStore>;

export interface VectorStoreDeleteResponse {
  id: string;
  object: 'vector_store.deleted';
  deleted: boolean;
}

export interface VectorStoreFile {
  id: string;
  object: 'vector_store.file';
  created_at: number;
  vector_store_id: string;
  usage_bytes: number;
  status: VectorStoreFileStatus;
  last_error: VectorStoreFileError | null;
}

export interface VectorStoreFileError {
  code: string;
  message: string;
}

export interface VectorStoreFileCreateRequest {
  file_id: string;
}

export interface VectorStoreFileListParams {
  limit?: number;
  order?: 'asc' | 'desc';
  after?: string;
  before?: string;
  filter?: 'in_progress' | 'completed' | 'failed' | 'cancelled';
}

export type VectorStoreFileListResponse = PaginatedResponse<VectorStoreFile>;

export interface VectorStoreFileDeleteResponse {
  id: string;
  object: 'vector_store.file.deleted';
  deleted: boolean;
}

export type VectorStoreCreateParams = VectorStoreCreateRequest & RequestOptions;
export type VectorStoreUpdateParams = VectorStoreUpdateRequest & RequestOptions;
export type VectorStoreListRequestParams = VectorStoreListParams & RequestOptions;
export type VectorStoreRetrieveParams = RequestOptions;
export type VectorStoreDeleteParams = RequestOptions;
export type VectorStoreFileCreateParams = VectorStoreFileCreateRequest & RequestOptions;
export type VectorStoreFileListRequestParams = VectorStoreFileListParams & RequestOptions;
export type VectorStoreFileRetrieveParams = RequestOptions;
export type VectorStoreFileDeleteParams = RequestOptions;

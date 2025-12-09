import type { RequestOptions } from '../../types/common.js';

export type FilePurpose =
  | 'assistants'
  | 'assistants_output'
  | 'batch'
  | 'batch_output'
  | 'fine-tune'
  | 'fine-tune-results'
  | 'vision';

export interface FileObject {
  id: string;
  object: 'file';
  bytes: number;
  created_at: number;
  filename: string;
  purpose: string;
  status?: 'uploaded' | 'processed' | 'error';
  status_details?: string;
}

export interface FileListResponse {
  object: 'list';
  data: FileObject[];
}

export interface FileDeleteResponse {
  id: string;
  object: 'file';
  deleted: boolean;
}

export interface FileCreateRequest {
  file: File | Blob;
  purpose: FilePurpose;
}

export interface FileListParams {
  purpose?: FilePurpose;
}

export type FileCreateParams = FileCreateRequest & RequestOptions;
export type FileListRequestParams = FileListParams & RequestOptions;
export type FileRetrieveParams = RequestOptions;
export type FileDeleteParams = RequestOptions;
export type FileContentParams = RequestOptions;

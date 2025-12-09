import type { PaginatedResponse } from '../types/common.js';

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

export interface FileDeleteResponse {
  id: string;
  object: 'file';
  deleted: boolean;
}

export function createFileObject(overrides?: Partial<FileObject>): FileObject {
  return {
    id: 'file-abc123',
    object: 'file',
    bytes: 175,
    created_at: 1677652288,
    filename: 'training_data.jsonl',
    purpose: 'fine-tune',
    status: 'uploaded',
    ...overrides,
  };
}

export function createFileListResponse(
  count: number = 3
): PaginatedResponse<FileObject> {
  return {
    object: 'list',
    data: Array.from({ length: count }, (_, i) =>
      createFileObject({
        id: `file-${i}`,
        filename: `file-${i}.jsonl`,
      })
    ),
    has_more: false,
  };
}

export function createFileDeleteResponse(
  overrides?: Partial<FileDeleteResponse>
): FileDeleteResponse {
  return {
    id: 'file-abc123',
    object: 'file',
    deleted: true,
    ...overrides,
  };
}

export function createFileUploadRequest(): FormData {
  const formData = new FormData();
  const blob = new Blob(['{"prompt": "test", "completion": "data"}'], {
    type: 'application/json',
  });
  formData.append('file', blob, 'training_data.jsonl');
  formData.append('purpose', 'fine-tune');
  return formData;
}

export type BatchStatus =
  | 'validating'
  | 'failed'
  | 'in_progress'
  | 'finalizing'
  | 'completed'
  | 'expired'
  | 'cancelling'
  | 'cancelled';

export interface BatchCreateRequest {
  input_file_id: string;
  endpoint: '/v1/chat/completions' | '/v1/embeddings' | '/v1/completions';
  completion_window: '24h';
  metadata?: Record<string, string>;
}

export interface BatchObject {
  id: string;
  object: 'batch';
  endpoint: string;
  errors?: BatchErrors;
  input_file_id: string;
  completion_window: string;
  status: BatchStatus;
  output_file_id?: string;
  error_file_id?: string;
  created_at: number;
  in_progress_at?: number;
  expires_at?: number;
  finalizing_at?: number;
  completed_at?: number;
  failed_at?: number;
  expired_at?: number;
  cancelling_at?: number;
  cancelled_at?: number;
  request_counts?: BatchRequestCounts;
  metadata?: Record<string, string>;
}

export interface BatchErrors {
  object: string;
  data: BatchError[];
}

export interface BatchError {
  code: string;
  message: string;
  param?: string;
  line?: number;
}

export interface BatchRequestCounts {
  total: number;
  completed: number;
  failed: number;
}

export interface BatchListParams {
  limit?: number;
  after?: string;
}

export interface BatchListResponse {
  object: 'list';
  data: BatchObject[];
  first_id?: string;
  last_id?: string;
  has_more: boolean;
}

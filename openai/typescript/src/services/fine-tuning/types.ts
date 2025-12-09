export type FineTuningJobStatus =
  | 'validating_files'
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export interface FineTuningJobCreateRequest {
  model: string;
  training_file: string;
  validation_file?: string;
  hyperparameters?: FineTuningHyperparameters;
  suffix?: string;
  seed?: number;
}

export interface FineTuningHyperparameters {
  n_epochs?: number | 'auto';
  batch_size?: number | 'auto';
  learning_rate_multiplier?: number | 'auto';
}

export interface FineTuningJob {
  id: string;
  object: 'fine_tuning.job';
  created_at: number;
  finished_at?: number;
  model: string;
  fine_tuned_model?: string;
  organization_id: string;
  status: FineTuningJobStatus;
  hyperparameters: FineTuningHyperparameters;
  training_file: string;
  validation_file?: string;
  result_files: string[];
  trained_tokens?: number;
  error?: FineTuningJobError;
  seed?: number;
}

export interface FineTuningJobError {
  code: string;
  message: string;
  param?: string;
}

export interface FineTuningJobListParams {
  limit?: number;
  after?: string;
}

export interface FineTuningJobListResponse {
  object: 'list';
  data: FineTuningJob[];
  has_more: boolean;
}

export interface FineTuningJobEvent {
  id: string;
  object: 'fine_tuning.job.event';
  created_at: number;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface FineTuningJobEventListResponse {
  object: 'list';
  data: FineTuningJobEvent[];
  has_more: boolean;
}

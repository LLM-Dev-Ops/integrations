/**
 * Fine-tuning types for Mistral API.
 */

/**
 * Fine-tuning job status.
 */
export type FineTuningJobStatus =
  | 'QUEUED'
  | 'STARTED'
  | 'VALIDATING'
  | 'VALIDATED'
  | 'RUNNING'
  | 'FAILED_VALIDATION'
  | 'FAILED'
  | 'SUCCESS'
  | 'CANCELLED'
  | 'CANCELLING';

/**
 * Hyperparameters for fine-tuning.
 */
export interface FineTuningHyperparameters {
  /** Number of training epochs. */
  training_steps?: number;
  /** Learning rate. */
  learning_rate?: number;
  /** Weight decay. */
  weight_decay?: number;
  /** Warmup fraction. */
  warmup_fraction?: number;
  /** Epochs (alternative to training_steps). */
  epochs?: number;
  /** LoRA r parameter. */
  lora_r?: number;
  /** LoRA alpha parameter. */
  lora_alpha?: number;
  /** Sequence length. */
  seq_len?: number;
}

/**
 * Training file reference.
 */
export interface TrainingFile {
  /** File ID. */
  file_id: string;
  /** Weight for this file. */
  weight?: number;
}

/**
 * Integration with Weights & Biases.
 */
export interface WandbIntegration {
  type: 'wandb';
  /** W&B project name. */
  project: string;
  /** W&B run name. */
  name?: string;
  /** W&B API key. */
  api_key?: string;
}

/**
 * Fine-tuning integrations.
 */
export type FineTuningIntegration = WandbIntegration;

/**
 * Fine-tuning job creation request.
 */
export interface CreateFineTuningJobRequest {
  /** Base model to fine-tune. */
  model: string;
  /** Training file ID(s). */
  training_files: TrainingFile[];
  /** Validation file ID(s). */
  validation_files?: string[];
  /** Hyperparameters. */
  hyperparameters?: FineTuningHyperparameters;
  /** Suffix for the fine-tuned model name. */
  suffix?: string;
  /** Integrations. */
  integrations?: FineTuningIntegration[];
  /** Auto-start the job. */
  auto_start?: boolean;
}

/**
 * Fine-tuning job.
 */
export interface FineTuningJob {
  /** Job ID. */
  id: string;
  /** Object type. */
  object: string;
  /** Base model. */
  model: string;
  /** Job status. */
  status: FineTuningJobStatus;
  /** Training files. */
  training_files: string[];
  /** Validation files. */
  validation_files: string[];
  /** Hyperparameters used. */
  hyperparameters: FineTuningHyperparameters;
  /** Fine-tuned model name. */
  fine_tuned_model?: string;
  /** Creation timestamp. */
  created_at: number;
  /** Modification timestamp. */
  modified_at?: number;
  /** Suffix. */
  suffix?: string;
  /** Integrations. */
  integrations: FineTuningIntegration[];
  /** Trained tokens. */
  trained_tokens?: number;
  /** Metadata. */
  metadata: Record<string, string>;
}

/**
 * Response from listing fine-tuning jobs.
 */
export interface FineTuningJobListResponse {
  /** Object type. */
  object: string;
  /** List of jobs. */
  data: FineTuningJob[];
  /** Total count. */
  total?: number;
}

/**
 * Fine-tuning event.
 */
export interface FineTuningEvent {
  /** Event name. */
  name: string;
  /** Event data. */
  data: Record<string, unknown>;
  /** Event timestamp. */
  created_at: number;
}

/**
 * Checkpoint from fine-tuning.
 */
export interface FineTuningCheckpoint {
  /** Checkpoint metrics. */
  metrics: CheckpointMetrics;
  /** Step number. */
  step_number: number;
  /** Creation timestamp. */
  created_at: number;
}

/**
 * Metrics for a checkpoint.
 */
export interface CheckpointMetrics {
  /** Training loss. */
  train_loss?: number;
  /** Validation loss. */
  valid_loss?: number;
  /** Validation mean per-token accuracy. */
  valid_mean_token_accuracy?: number;
}

/**
 * Query parameters for listing fine-tuning jobs.
 */
export interface ListFineTuningJobsParams {
  /** Page number. */
  page?: number;
  /** Page size. */
  page_size?: number;
  /** Model filter. */
  model?: string;
  /** Status filter. */
  status?: string;
  /** Created after timestamp. */
  created_after?: number;
  /** Created by user. */
  created_by_me?: boolean;
  /** W&B project filter. */
  wandb_project?: string;
  /** W&B name filter. */
  wandb_name?: string;
  /** Suffix filter. */
  suffix?: string;
}

/**
 * Creates a training file reference.
 */
export function trainingFile(fileId: string, weight?: number): TrainingFile {
  const file: TrainingFile = { file_id: fileId };
  if (weight !== undefined) {
    file.weight = weight;
  }
  return file;
}

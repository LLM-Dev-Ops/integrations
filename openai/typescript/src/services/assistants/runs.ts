import type { RequestOptions, PaginatedResponse } from '../../types/common.js';
import type { AssistantTool, AssistantToolResources } from './types.js';

export type RunStatus =
  | 'queued'
  | 'in_progress'
  | 'requires_action'
  | 'cancelling'
  | 'cancelled'
  | 'failed'
  | 'completed'
  | 'expired';

export interface Run {
  id: string;
  object: 'thread.run';
  created_at: number;
  thread_id: string;
  assistant_id: string;
  status: RunStatus;
  required_action: RunRequiredAction | null;
  last_error: RunError | null;
  expires_at: number | null;
  started_at: number | null;
  cancelled_at: number | null;
  failed_at: number | null;
  completed_at: number | null;
  model: string;
  instructions: string | null;
  tools: AssistantTool[];
  metadata: Record<string, string>;
  usage: RunUsage | null;
  temperature?: number | null;
  top_p?: number | null;
  max_prompt_tokens?: number | null;
  max_completion_tokens?: number | null;
  truncation_strategy?: RunTruncationStrategy;
  tool_choice?: 'none' | 'auto' | 'required' | { type: 'function'; function: { name: string } };
  response_format?: 'auto' | { type: 'text' | 'json_object' };
}

export interface RunRequiredAction {
  type: 'submit_tool_outputs';
  submit_tool_outputs: {
    tool_calls: RunToolCall[];
  };
}

export interface RunToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface RunError {
  code: string;
  message: string;
}

export interface RunUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface RunTruncationStrategy {
  type: 'auto' | 'last_messages';
  last_messages?: number;
}

export interface RunCreateRequest {
  assistant_id: string;
  model?: string | null;
  instructions?: string | null;
  additional_instructions?: string | null;
  additional_messages?: { role: 'user' | 'assistant'; content: string }[];
  tools?: AssistantTool[] | null;
  metadata?: Record<string, string>;
  temperature?: number | null;
  top_p?: number | null;
  max_prompt_tokens?: number | null;
  max_completion_tokens?: number | null;
  truncation_strategy?: RunTruncationStrategy;
  tool_choice?: 'none' | 'auto' | 'required' | { type: 'function'; function: { name: string } };
  response_format?: 'auto' | { type: 'text' | 'json_object' };
}

export interface RunUpdateRequest {
  metadata?: Record<string, string>;
}

export interface RunSubmitToolOutputsRequest {
  tool_outputs: RunToolOutput[];
}

export interface RunToolOutput {
  tool_call_id: string;
  output: string;
}

export interface RunListParams {
  limit?: number;
  order?: 'asc' | 'desc';
  after?: string;
  before?: string;
}

export type RunListResponse = PaginatedResponse<Run>;

export interface RunStep {
  id: string;
  object: 'thread.run.step';
  created_at: number;
  assistant_id: string;
  thread_id: string;
  run_id: string;
  type: 'message_creation' | 'tool_calls';
  status: RunStatus;
  step_details: RunStepDetails;
  last_error: RunError | null;
  expired_at: number | null;
  cancelled_at: number | null;
  failed_at: number | null;
  completed_at: number | null;
  metadata: Record<string, string>;
  usage: RunUsage | null;
}

export type RunStepDetails = RunStepDetailsMessageCreation | RunStepDetailsToolCalls;

export interface RunStepDetailsMessageCreation {
  type: 'message_creation';
  message_creation: {
    message_id: string;
  };
}

export interface RunStepDetailsToolCalls {
  type: 'tool_calls';
  tool_calls: RunToolCall[];
}

export type RunStepListResponse = PaginatedResponse<RunStep>;

export type RunCreateParams = RunCreateRequest & RequestOptions;
export type RunUpdateParams = RunUpdateRequest & RequestOptions;
export type RunListRequestParams = RunListParams & RequestOptions;
export type RunRetrieveParams = RequestOptions;
export type RunCancelParams = RequestOptions;
export type RunSubmitToolOutputsParams = RunSubmitToolOutputsRequest & RequestOptions;
export type RunStepListParams = RunListParams & RequestOptions;
export type RunStepRetrieveParams = RequestOptions;

export interface Assistant {
  id: string;
  object: 'assistant';
  created_at: number;
  name?: string;
  description?: string;
  model: string;
  instructions?: string;
  tools: AssistantTool[];
  tool_resources?: AssistantToolResources;
  metadata?: Record<string, string>;
  temperature?: number;
  top_p?: number;
  response_format?: 'auto' | { type: 'text' } | { type: 'json_object' };
}

export type AssistantTool =
  | { type: 'code_interpreter' }
  | { type: 'file_search'; file_search?: { max_num_results?: number } }
  | { type: 'function'; function: AssistantFunction };

export interface AssistantFunction {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
}

export interface AssistantToolResources {
  code_interpreter?: { file_ids: string[] };
  file_search?: { vector_store_ids: string[] };
}

export interface AssistantCreateRequest {
  model: string;
  name?: string;
  description?: string;
  instructions?: string;
  tools?: AssistantTool[];
  tool_resources?: AssistantToolResources;
  metadata?: Record<string, string>;
  temperature?: number;
  top_p?: number;
  response_format?: 'auto' | { type: 'text' } | { type: 'json_object' };
}

export interface AssistantUpdateRequest {
  model?: string;
  name?: string;
  description?: string;
  instructions?: string;
  tools?: AssistantTool[];
  tool_resources?: AssistantToolResources;
  metadata?: Record<string, string>;
  temperature?: number;
  top_p?: number;
}

export interface AssistantListParams {
  limit?: number;
  order?: 'asc' | 'desc';
  after?: string;
  before?: string;
}

export interface AssistantListResponse {
  object: 'list';
  data: Assistant[];
  first_id?: string;
  last_id?: string;
  has_more: boolean;
}

export interface AssistantDeleteResponse {
  id: string;
  object: 'assistant.deleted';
  deleted: boolean;
}

import type { ResilienceOrchestrator } from '../../resilience/orchestrator.js';
import type { RequestOptions } from '../../types/common.js';
import type {
  Assistant,
  AssistantCreateRequest,
  AssistantUpdateRequest,
  AssistantListParams,
  AssistantListResponse,
  AssistantDeleteResponse,
} from './types.js';
import type {
  Thread,
  ThreadCreateRequest,
  ThreadUpdateRequest,
  ThreadDeleteResponse,
} from './threads.js';
import type {
  Message,
  MessageCreateRequest,
  MessageUpdateRequest,
  MessageListParams,
  MessageListResponse,
} from './messages.js';
import type {
  Run,
  RunCreateRequest,
  RunUpdateRequest,
  RunSubmitToolOutputsRequest,
  RunListParams,
  RunListResponse,
  RunStep,
  RunStepListResponse,
} from './runs.js';
import type {
  VectorStore,
  VectorStoreCreateRequest,
  VectorStoreUpdateRequest,
  VectorStoreListParams,
  VectorStoreListResponse,
  VectorStoreDeleteResponse,
  VectorStoreFile,
  VectorStoreFileCreateRequest,
  VectorStoreFileListParams,
  VectorStoreFileListResponse,
  VectorStoreFileDeleteResponse,
} from './vector-stores.js';

export interface AssistantsService {
  create(request: AssistantCreateRequest, options?: RequestOptions): Promise<Assistant>;
  retrieve(assistantId: string, options?: RequestOptions): Promise<Assistant>;
  update(assistantId: string, request: AssistantUpdateRequest, options?: RequestOptions): Promise<Assistant>;
  delete(assistantId: string, options?: RequestOptions): Promise<AssistantDeleteResponse>;
  list(params?: AssistantListParams, options?: RequestOptions): Promise<AssistantListResponse>;

  threads: {
    create(request?: ThreadCreateRequest, options?: RequestOptions): Promise<Thread>;
    retrieve(threadId: string, options?: RequestOptions): Promise<Thread>;
    update(threadId: string, request: ThreadUpdateRequest, options?: RequestOptions): Promise<Thread>;
    delete(threadId: string, options?: RequestOptions): Promise<ThreadDeleteResponse>;
  };

  messages: {
    create(threadId: string, request: MessageCreateRequest, options?: RequestOptions): Promise<Message>;
    retrieve(threadId: string, messageId: string, options?: RequestOptions): Promise<Message>;
    update(threadId: string, messageId: string, request: MessageUpdateRequest, options?: RequestOptions): Promise<Message>;
    list(threadId: string, params?: MessageListParams, options?: RequestOptions): Promise<MessageListResponse>;
  };

  runs: {
    create(threadId: string, request: RunCreateRequest, options?: RequestOptions): Promise<Run>;
    retrieve(threadId: string, runId: string, options?: RequestOptions): Promise<Run>;
    update(threadId: string, runId: string, request: RunUpdateRequest, options?: RequestOptions): Promise<Run>;
    cancel(threadId: string, runId: string, options?: RequestOptions): Promise<Run>;
    submitToolOutputs(threadId: string, runId: string, request: RunSubmitToolOutputsRequest, options?: RequestOptions): Promise<Run>;
    list(threadId: string, params?: RunListParams, options?: RequestOptions): Promise<RunListResponse>;
    listSteps(threadId: string, runId: string, params?: RunListParams, options?: RequestOptions): Promise<RunStepListResponse>;
    retrieveStep(threadId: string, runId: string, stepId: string, options?: RequestOptions): Promise<RunStep>;
  };

  vectorStores: {
    create(request: VectorStoreCreateRequest, options?: RequestOptions): Promise<VectorStore>;
    retrieve(vectorStoreId: string, options?: RequestOptions): Promise<VectorStore>;
    update(vectorStoreId: string, request: VectorStoreUpdateRequest, options?: RequestOptions): Promise<VectorStore>;
    delete(vectorStoreId: string, options?: RequestOptions): Promise<VectorStoreDeleteResponse>;
    list(params?: VectorStoreListParams, options?: RequestOptions): Promise<VectorStoreListResponse>;

    files: {
      create(vectorStoreId: string, request: VectorStoreFileCreateRequest, options?: RequestOptions): Promise<VectorStoreFile>;
      retrieve(vectorStoreId: string, fileId: string, options?: RequestOptions): Promise<VectorStoreFile>;
      delete(vectorStoreId: string, fileId: string, options?: RequestOptions): Promise<VectorStoreFileDeleteResponse>;
      list(vectorStoreId: string, params?: VectorStoreFileListParams, options?: RequestOptions): Promise<VectorStoreFileListResponse>;
    };
  };
}

export class AssistantsServiceImpl implements AssistantsService {
  public readonly threads: AssistantsService['threads'];
  public readonly messages: AssistantsService['messages'];
  public readonly runs: AssistantsService['runs'];
  public readonly vectorStores: AssistantsService['vectorStores'];

  constructor(private readonly orchestrator: ResilienceOrchestrator) {
    this.threads = this.createThreadsService();
    this.messages = this.createMessagesService();
    this.runs = this.createRunsService();
    this.vectorStores = this.createVectorStoresService();
  }

  async create(request: AssistantCreateRequest, options?: RequestOptions): Promise<Assistant> {
    return this.orchestrator.request({
      method: 'POST',
      path: '/v1/assistants',
      body: request,
      headers: { 'OpenAI-Beta': 'assistants=v2', ...options?.headers },
      ...options,
    });
  }

  async retrieve(assistantId: string, options?: RequestOptions): Promise<Assistant> {
    return this.orchestrator.request({
      method: 'GET',
      path: `/v1/assistants/${encodeURIComponent(assistantId)}`,
      headers: { 'OpenAI-Beta': 'assistants=v2', ...options?.headers },
      ...options,
    });
  }

  async update(assistantId: string, request: AssistantUpdateRequest, options?: RequestOptions): Promise<Assistant> {
    return this.orchestrator.request({
      method: 'POST',
      path: `/v1/assistants/${encodeURIComponent(assistantId)}`,
      body: request,
      headers: { 'OpenAI-Beta': 'assistants=v2', ...options?.headers },
      ...options,
    });
  }

  async delete(assistantId: string, options?: RequestOptions): Promise<AssistantDeleteResponse> {
    return this.orchestrator.request({
      method: 'DELETE',
      path: `/v1/assistants/${encodeURIComponent(assistantId)}`,
      headers: { 'OpenAI-Beta': 'assistants=v2', ...options?.headers },
      ...options,
    });
  }

  async list(params?: AssistantListParams, options?: RequestOptions): Promise<AssistantListResponse> {
    const query: Record<string, string | number> = {};
    if (params?.limit) query.limit = params.limit;
    if (params?.order) query.order = params.order;
    if (params?.after) query.after = params.after;
    if (params?.before) query.before = params.before;

    return this.orchestrator.request({
      method: 'GET',
      path: '/v1/assistants',
      query,
      headers: { 'OpenAI-Beta': 'assistants=v2', ...options?.headers },
      ...options,
    });
  }

  private createThreadsService(): AssistantsService['threads'] {
    return {
      create: async (request?: ThreadCreateRequest, options?: RequestOptions): Promise<Thread> => {
        const httpRequest = RequestBuilder.create()
          .setMethod('POST')
          .setPath('/v1/threads')
          .setBody(request ?? {})
          .setOptions(options)
          .build();

        const response = await this.orchestrator.request(httpRequest);
        return ResponseParser.parse<Thread>(response);
      },

      retrieve: async (threadId: string, options?: RequestOptions): Promise<Thread> => {
        const httpRequest = RequestBuilder.create()
          .setMethod('GET')
          .setPath(`/v1/threads/${threadId}`)
          .setOptions(options)
          .build();

        const response = await this.orchestrator.request(httpRequest);
        return ResponseParser.parse<Thread>(response);
      },

      update: async (threadId: string, request: ThreadUpdateRequest, options?: RequestOptions): Promise<Thread> => {
        const httpRequest = RequestBuilder.create()
          .setMethod('POST')
          .setPath(`/v1/threads/${threadId}`)
          .setBody(request)
          .setOptions(options)
          .build();

        const response = await this.orchestrator.request(httpRequest);
        return ResponseParser.parse<Thread>(response);
      },

      delete: async (threadId: string, options?: RequestOptions): Promise<ThreadDeleteResponse> => {
        const httpRequest = RequestBuilder.create()
          .setMethod('DELETE')
          .setPath(`/v1/threads/${threadId}`)
          .setOptions(options)
          .build();

        const response = await this.orchestrator.request(httpRequest);
        return ResponseParser.parse<ThreadDeleteResponse>(response);
      },
    };
  }

  private createMessagesService(): AssistantsService['messages'] {
    return {
      create: async (threadId: string, request: MessageCreateRequest, options?: RequestOptions): Promise<Message> => {
        const httpRequest = RequestBuilder.create()
          .setMethod('POST')
          .setPath(`/v1/threads/${threadId}/messages`)
          .setBody(request)
          .setOptions(options)
          .build();

        const response = await this.orchestrator.request(httpRequest);
        return ResponseParser.parse<Message>(response);
      },

      retrieve: async (threadId: string, messageId: string, options?: RequestOptions): Promise<Message> => {
        const httpRequest = RequestBuilder.create()
          .setMethod('GET')
          .setPath(`/v1/threads/${threadId}/messages/${messageId}`)
          .setOptions(options)
          .build();

        const response = await this.orchestrator.request(httpRequest);
        return ResponseParser.parse<Message>(response);
      },

      update: async (threadId: string, messageId: string, request: MessageUpdateRequest, options?: RequestOptions): Promise<Message> => {
        const httpRequest = RequestBuilder.create()
          .setMethod('POST')
          .setPath(`/v1/threads/${threadId}/messages/${messageId}`)
          .setBody(request)
          .setOptions(options)
          .build();

        const response = await this.orchestrator.request(httpRequest);
        return ResponseParser.parse<Message>(response);
      },

      list: async (threadId: string, params?: MessageListParams, options?: RequestOptions): Promise<MessageListResponse> => {
        const httpRequest = RequestBuilder.create()
          .setMethod('GET')
          .setPath(`/v1/threads/${threadId}/messages`)
          .setQuery(params as Record<string, string | number | undefined>)
          .setOptions(options)
          .build();

        const response = await this.orchestrator.request(httpRequest);
        return ResponseParser.parse<MessageListResponse>(response);
      },
    };
  }

  private createRunsService(): AssistantsService['runs'] {
    return {
      create: async (threadId: string, request: RunCreateRequest, options?: RequestOptions): Promise<Run> => {
        const httpRequest = RequestBuilder.create()
          .setMethod('POST')
          .setPath(`/v1/threads/${threadId}/runs`)
          .setBody(request)
          .setOptions(options)
          .build();

        const response = await this.orchestrator.request(httpRequest);
        return ResponseParser.parse<Run>(response);
      },

      retrieve: async (threadId: string, runId: string, options?: RequestOptions): Promise<Run> => {
        const httpRequest = RequestBuilder.create()
          .setMethod('GET')
          .setPath(`/v1/threads/${threadId}/runs/${runId}`)
          .setOptions(options)
          .build();

        const response = await this.orchestrator.request(httpRequest);
        return ResponseParser.parse<Run>(response);
      },

      update: async (threadId: string, runId: string, request: RunUpdateRequest, options?: RequestOptions): Promise<Run> => {
        const httpRequest = RequestBuilder.create()
          .setMethod('POST')
          .setPath(`/v1/threads/${threadId}/runs/${runId}`)
          .setBody(request)
          .setOptions(options)
          .build();

        const response = await this.orchestrator.request(httpRequest);
        return ResponseParser.parse<Run>(response);
      },

      cancel: async (threadId: string, runId: string, options?: RequestOptions): Promise<Run> => {
        const httpRequest = RequestBuilder.create()
          .setMethod('POST')
          .setPath(`/v1/threads/${threadId}/runs/${runId}/cancel`)
          .setOptions(options)
          .build();

        const response = await this.orchestrator.request(httpRequest);
        return ResponseParser.parse<Run>(response);
      },

      submitToolOutputs: async (threadId: string, runId: string, request: RunSubmitToolOutputsRequest, options?: RequestOptions): Promise<Run> => {
        const httpRequest = RequestBuilder.create()
          .setMethod('POST')
          .setPath(`/v1/threads/${threadId}/runs/${runId}/submit_tool_outputs`)
          .setBody(request)
          .setOptions(options)
          .build();

        const response = await this.orchestrator.request(httpRequest);
        return ResponseParser.parse<Run>(response);
      },

      list: async (threadId: string, params?: RunListParams, options?: RequestOptions): Promise<RunListResponse> => {
        const httpRequest = RequestBuilder.create()
          .setMethod('GET')
          .setPath(`/v1/threads/${threadId}/runs`)
          .setQuery(params as Record<string, string | number | undefined>)
          .setOptions(options)
          .build();

        const response = await this.orchestrator.request(httpRequest);
        return ResponseParser.parse<RunListResponse>(response);
      },

      listSteps: async (threadId: string, runId: string, params?: RunListParams, options?: RequestOptions): Promise<RunStepListResponse> => {
        const httpRequest = RequestBuilder.create()
          .setMethod('GET')
          .setPath(`/v1/threads/${threadId}/runs/${runId}/steps`)
          .setQuery(params as Record<string, string | number | undefined>)
          .setOptions(options)
          .build();

        const response = await this.orchestrator.request(httpRequest);
        return ResponseParser.parse<RunStepListResponse>(response);
      },

      retrieveStep: async (threadId: string, runId: string, stepId: string, options?: RequestOptions): Promise<RunStep> => {
        const httpRequest = RequestBuilder.create()
          .setMethod('GET')
          .setPath(`/v1/threads/${threadId}/runs/${runId}/steps/${stepId}`)
          .setOptions(options)
          .build();

        const response = await this.orchestrator.request(httpRequest);
        return ResponseParser.parse<RunStep>(response);
      },
    };
  }

  private createVectorStoresService(): AssistantsService['vectorStores'] {
    const files = {
      create: async (vectorStoreId: string, request: VectorStoreFileCreateRequest, options?: RequestOptions): Promise<VectorStoreFile> => {
        const httpRequest = RequestBuilder.create()
          .setMethod('POST')
          .setPath(`/v1/vector_stores/${vectorStoreId}/files`)
          .setBody(request)
          .setOptions(options)
          .build();

        const response = await this.orchestrator.request(httpRequest);
        return ResponseParser.parse<VectorStoreFile>(response);
      },

      retrieve: async (vectorStoreId: string, fileId: string, options?: RequestOptions): Promise<VectorStoreFile> => {
        const httpRequest = RequestBuilder.create()
          .setMethod('GET')
          .setPath(`/v1/vector_stores/${vectorStoreId}/files/${fileId}`)
          .setOptions(options)
          .build();

        const response = await this.orchestrator.request(httpRequest);
        return ResponseParser.parse<VectorStoreFile>(response);
      },

      delete: async (vectorStoreId: string, fileId: string, options?: RequestOptions): Promise<VectorStoreFileDeleteResponse> => {
        const httpRequest = RequestBuilder.create()
          .setMethod('DELETE')
          .setPath(`/v1/vector_stores/${vectorStoreId}/files/${fileId}`)
          .setOptions(options)
          .build();

        const response = await this.orchestrator.request(httpRequest);
        return ResponseParser.parse<VectorStoreFileDeleteResponse>(response);
      },

      list: async (vectorStoreId: string, params?: VectorStoreFileListParams, options?: RequestOptions): Promise<VectorStoreFileListResponse> => {
        const httpRequest = RequestBuilder.create()
          .setMethod('GET')
          .setPath(`/v1/vector_stores/${vectorStoreId}/files`)
          .setQuery(params as Record<string, string | number | undefined>)
          .setOptions(options)
          .build();

        const response = await this.orchestrator.request(httpRequest);
        return ResponseParser.parse<VectorStoreFileListResponse>(response);
      },
    };

    return {
      create: async (request: VectorStoreCreateRequest, options?: RequestOptions): Promise<VectorStore> => {
        const httpRequest = RequestBuilder.create()
          .setMethod('POST')
          .setPath('/v1/vector_stores')
          .setBody(request)
          .setOptions(options)
          .build();

        const response = await this.orchestrator.request(httpRequest);
        return ResponseParser.parse<VectorStore>(response);
      },

      retrieve: async (vectorStoreId: string, options?: RequestOptions): Promise<VectorStore> => {
        const httpRequest = RequestBuilder.create()
          .setMethod('GET')
          .setPath(`/v1/vector_stores/${vectorStoreId}`)
          .setOptions(options)
          .build();

        const response = await this.orchestrator.request(httpRequest);
        return ResponseParser.parse<VectorStore>(response);
      },

      update: async (vectorStoreId: string, request: VectorStoreUpdateRequest, options?: RequestOptions): Promise<VectorStore> => {
        const httpRequest = RequestBuilder.create()
          .setMethod('POST')
          .setPath(`/v1/vector_stores/${vectorStoreId}`)
          .setBody(request)
          .setOptions(options)
          .build();

        const response = await this.orchestrator.request(httpRequest);
        return ResponseParser.parse<VectorStore>(response);
      },

      delete: async (vectorStoreId: string, options?: RequestOptions): Promise<VectorStoreDeleteResponse> => {
        const httpRequest = RequestBuilder.create()
          .setMethod('DELETE')
          .setPath(`/v1/vector_stores/${vectorStoreId}`)
          .setOptions(options)
          .build();

        const response = await this.orchestrator.request(httpRequest);
        return ResponseParser.parse<VectorStoreDeleteResponse>(response);
      },

      list: async (params?: VectorStoreListParams, options?: RequestOptions): Promise<VectorStoreListResponse> => {
        const httpRequest = RequestBuilder.create()
          .setMethod('GET')
          .setPath('/v1/vector_stores')
          .setQuery(params as Record<string, string | number | undefined>)
          .setOptions(options)
          .build();

        const response = await this.orchestrator.request(httpRequest);
        return ResponseParser.parse<VectorStoreListResponse>(response);
      },

      files,
    };
  }
}

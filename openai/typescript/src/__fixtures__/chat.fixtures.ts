import type {
  ChatCompletionResponse,
  ChatCompletionChunk,
  ChatCompletionRequest,
  ChatMessage,
} from '../services/chat/types.js';

export function createChatMessage(
  overrides?: Partial<ChatMessage>
): ChatMessage {
  return {
    role: 'user',
    content: 'Hello, how are you?',
    ...overrides,
  };
}

export function createChatCompletionRequest(
  overrides?: Partial<ChatCompletionRequest>
): ChatCompletionRequest {
  return {
    model: 'gpt-4',
    messages: [createChatMessage()],
    ...overrides,
  };
}

export function createChatCompletionResponse(
  overrides?: Partial<ChatCompletionResponse>
): ChatCompletionResponse {
  return {
    id: 'chatcmpl-123',
    object: 'chat.completion',
    created: 1677652288,
    model: 'gpt-4',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: 'Hello! I am doing well, thank you for asking. How can I assist you today?',
        },
        finish_reason: 'stop',
        logprobs: null,
      },
    ],
    usage: {
      prompt_tokens: 13,
      completion_tokens: 17,
      total_tokens: 30,
    },
    system_fingerprint: 'fp_44709d6fcb',
    ...overrides,
  };
}

export function createChatCompletionChunk(
  overrides?: Partial<ChatCompletionChunk>
): ChatCompletionChunk {
  return {
    id: 'chatcmpl-123',
    object: 'chat.completion.chunk',
    created: 1677652288,
    model: 'gpt-4',
    choices: [
      {
        index: 0,
        delta: {
          content: 'Hello',
        },
        finish_reason: null,
        logprobs: null,
      },
    ],
    system_fingerprint: 'fp_44709d6fcb',
    ...overrides,
  };
}

export function createStreamChunks(): ChatCompletionChunk[] {
  return [
    createChatCompletionChunk({
      choices: [
        {
          index: 0,
          delta: { role: 'assistant', content: '' },
          finish_reason: null,
          logprobs: null,
        },
      ],
    }),
    createChatCompletionChunk({
      choices: [
        {
          index: 0,
          delta: { content: 'Hello' },
          finish_reason: null,
          logprobs: null,
        },
      ],
    }),
    createChatCompletionChunk({
      choices: [
        {
          index: 0,
          delta: { content: '!' },
          finish_reason: null,
          logprobs: null,
        },
      ],
    }),
    createChatCompletionChunk({
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: 'stop',
          logprobs: null,
        },
      ],
    }),
  ];
}

export function createToolCallResponse(): ChatCompletionResponse {
  return createChatCompletionResponse({
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'call_abc123',
              type: 'function',
              function: {
                name: 'get_current_weather',
                arguments: '{"location": "San Francisco, CA"}',
              },
            },
          ],
        },
        finish_reason: 'tool_calls',
        logprobs: null,
      },
    ],
  });
}

export function createFunctionCallResponse(): ChatCompletionResponse {
  return createChatCompletionResponse({
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: null,
          function_call: {
            name: 'get_current_weather',
            arguments: '{"location": "San Francisco, CA"}',
          },
        },
        finish_reason: 'function_call',
        logprobs: null,
      },
    ],
  });
}

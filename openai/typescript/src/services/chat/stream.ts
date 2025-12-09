import type { ChatCompletionChunk, ChatCompletionResponse, ChatMessage } from './types.js';

export class ChatCompletionStreamAccumulator {
  private id: string = '';
  private model: string = '';
  private created: number = 0;
  private systemFingerprint?: string;
  private contentParts: string[] = [];
  private toolCalls: Map<number, { id: string; type: string; name: string; arguments: string }> = new Map();
  private finishReason: string | null = null;

  process(chunk: ChatCompletionChunk): void {
    if (!this.id) this.id = chunk.id;
    if (!this.model) this.model = chunk.model;
    if (!this.created) this.created = chunk.created;
    if (chunk.system_fingerprint) this.systemFingerprint = chunk.system_fingerprint;

    for (const choice of chunk.choices) {
      if (choice.delta.content) {
        this.contentParts.push(choice.delta.content);
      }

      if (choice.delta.tool_calls) {
        for (const tc of choice.delta.tool_calls) {
          const existing = this.toolCalls.get(tc.index);
          if (existing) {
            if (tc.function?.arguments) {
              existing.arguments += tc.function.arguments;
            }
          } else if (tc.id) {
            this.toolCalls.set(tc.index, {
              id: tc.id,
              type: tc.type ?? 'function',
              name: tc.function?.name ?? '',
              arguments: tc.function?.arguments ?? '',
            });
          }
        }
      }

      if (choice.finish_reason) {
        this.finishReason = choice.finish_reason;
      }
    }
  }

  getContent(): string {
    return this.contentParts.join('');
  }

  getMessage(): ChatMessage {
    const toolCalls = this.toolCalls.size > 0
      ? Array.from(this.toolCalls.values()).map(tc => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.name, arguments: tc.arguments },
        }))
      : undefined;

    return {
      role: 'assistant',
      content: this.getContent() || null,
      tool_calls: toolCalls,
    };
  }

  getResponse(): ChatCompletionResponse {
    return {
      id: this.id,
      object: 'chat.completion',
      created: this.created,
      model: this.model,
      choices: [{
        index: 0,
        message: this.getMessage(),
        finish_reason: this.finishReason as any,
      }],
      system_fingerprint: this.systemFingerprint,
    };
  }
}

export async function collectStreamContent(stream: AsyncIterable<ChatCompletionChunk>): Promise<string> {
  const accumulator = new ChatCompletionStreamAccumulator();
  for await (const chunk of stream) {
    accumulator.process(chunk);
  }
  return accumulator.getContent();
}

export async function* transformChatStream(
  stream: AsyncIterable<ChatCompletionChunk>
): AsyncIterable<{ chunk: ChatCompletionChunk; accumulated: string }> {
  let accumulated = '';
  for await (const chunk of stream) {
    for (const choice of chunk.choices) {
      if (choice.delta.content) {
        accumulated += choice.delta.content;
      }
    }
    yield { chunk, accumulated };
  }
}

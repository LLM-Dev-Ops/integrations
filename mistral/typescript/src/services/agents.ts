/**
 * Agents service.
 */

import type { HttpTransport } from '../transport';
import type {
  AgentCompletionRequest,
  AgentCompletionResponse,
  AgentCompletionChunk,
} from '../types/agents';

/**
 * Agents service interface.
 */
export interface AgentsService {
  /** Creates an agent completion. */
  complete(request: AgentCompletionRequest): Promise<AgentCompletionResponse>;

  /** Creates a streaming agent completion. */
  completeStream(request: AgentCompletionRequest): AsyncIterable<AgentCompletionChunk>;
}

/**
 * Default implementation of the agents service.
 */
export class DefaultAgentsService implements AgentsService {
  constructor(private readonly transport: HttpTransport) {}

  async complete(request: AgentCompletionRequest): Promise<AgentCompletionResponse> {
    const body = await this.transport.post('/v1/agents/completions', request);
    return JSON.parse(body) as AgentCompletionResponse;
  }

  async *completeStream(request: AgentCompletionRequest): AsyncIterable<AgentCompletionChunk> {
    const streamRequest = { ...request, stream: true };

    for await (const data of this.transport.postStream('/v1/agents/completions', streamRequest)) {
      try {
        yield JSON.parse(data) as AgentCompletionChunk;
      } catch {
        // Skip malformed chunks
      }
    }
  }
}

/**
 * Creates an agents service.
 */
export function createAgentsService(transport: HttpTransport): AgentsService {
  return new DefaultAgentsService(transport);
}

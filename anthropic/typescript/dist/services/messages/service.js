import { validateCreateMessageRequest, validateCountTokensRequest } from './validation.js';
import { MessageStream } from './stream.js';
import { startTelemetryContext, emitRequestComplete, emitError, extractUsageMetadata, } from '../../observability/telemetry.js';
export class MessagesServiceImpl {
    transport;
    authManager;
    resilience;
    constructor(transport, authManager, resilience) {
        this.transport = transport;
        this.authManager = authManager;
        this.resilience = resilience;
    }
    async create(request, options) {
        validateCreateMessageRequest(request);
        // Start telemetry context
        const telemetryContext = startTelemetryContext({
            operation: 'messages.create',
            model: request.model,
            provider: request.model,
            metadata: {
                maxTokens: request.max_tokens,
                temperature: request.temperature,
                hasTools: !!request.tools,
                messageCount: request.messages.length,
            },
        });
        try {
            const result = await this.resilience.execute(async () => {
                const headers = this.authManager.getHeaders();
                return this.transport.request('POST', '/v1/messages', { ...request, stream: false }, {
                    ...options,
                    headers: {
                        ...headers,
                        ...options?.headers,
                    },
                });
            });
            // Emit completion event with usage metadata
            emitRequestComplete(telemetryContext, {
                ...extractUsageMetadata(result.usage),
                stopReason: result.stop_reason,
                contentBlocks: result.content.length,
            });
            return result;
        }
        catch (error) {
            // Emit error event
            emitError(telemetryContext, error);
            throw error;
        }
    }
    async createStream(request, options) {
        validateCreateMessageRequest(request);
        // Start telemetry context
        const telemetryContext = startTelemetryContext({
            operation: 'messages.createStream',
            model: request.model,
            provider: request.model,
            metadata: {
                maxTokens: request.max_tokens,
                temperature: request.temperature,
                hasTools: !!request.tools,
                messageCount: request.messages.length,
                streaming: true,
            },
        });
        try {
            const headers = this.authManager.getHeaders();
            const stream = await this.transport.requestStream('POST', '/v1/messages', { ...request, stream: true }, {
                ...options,
                headers: {
                    ...headers,
                    ...options?.headers,
                },
            });
            // Emit completion event for stream initiation
            // Note: This only tracks stream creation, not the full stream lifecycle
            emitRequestComplete(telemetryContext, {
                streamInitiated: true,
            });
            return new MessageStream(stream);
        }
        catch (error) {
            // Emit error event
            emitError(telemetryContext, error);
            throw error;
        }
    }
    async countTokens(request, options) {
        validateCountTokensRequest(request);
        // Start telemetry context
        const telemetryContext = startTelemetryContext({
            operation: 'messages.countTokens',
            model: request.model,
            provider: request.model,
            metadata: {
                hasTools: !!request.tools,
                messageCount: request.messages?.length,
            },
        });
        try {
            const result = await this.resilience.execute(async () => {
                const headers = this.authManager.getHeaders();
                return this.transport.request('POST', '/v1/messages/count_tokens', request, {
                    ...options,
                    headers: {
                        ...headers,
                        ...options?.headers,
                    },
                });
            });
            // Emit completion event with token count
            emitRequestComplete(telemetryContext, {
                inputTokens: result.input_tokens,
            });
            return result;
        }
        catch (error) {
            // Emit error event
            emitError(telemetryContext, error);
            throw error;
        }
    }
}
export function createMessagesService(transport, authManager, resilience) {
    return new MessagesServiceImpl(transport, authManager, resilience);
}
//# sourceMappingURL=service.js.map
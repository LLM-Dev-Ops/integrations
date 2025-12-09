// MessageStream class
export class MessageStream {
    reader;
    buffer = '';
    isDone = false;
    constructor(stream) {
        this.reader = stream.getReader();
    }
    async *[Symbol.asyncIterator]() {
        const decoder = new TextDecoder();
        while (!this.isDone) {
            const { done, value } = await this.reader.read();
            if (done) {
                this.isDone = true;
                break;
            }
            this.buffer += decoder.decode(value, { stream: true });
            // Parse SSE events from buffer
            const events = this.parseEvents();
            for (const event of events) {
                yield event;
                if (event.type === 'message_stop' || event.type === 'error') {
                    this.isDone = true;
                }
            }
        }
    }
    parseEvents() {
        const events = [];
        const lines = this.buffer.split('\n');
        // Keep the last incomplete line in the buffer
        this.buffer = lines.pop() ?? '';
        let currentEvent = {};
        for (const line of lines) {
            if (line.startsWith('event: ')) {
                currentEvent.event = line.slice(7).trim();
            }
            else if (line.startsWith('data: ')) {
                currentEvent.data = line.slice(6).trim();
            }
            else if (line === '' && currentEvent.data) {
                // Empty line signals end of event
                try {
                    const eventType = currentEvent.event || 'message';
                    const eventData = JSON.parse(currentEvent.data);
                    // Map event type to our event interface
                    const event = this.mapEvent(eventType, eventData);
                    if (event) {
                        events.push(event);
                    }
                }
                catch (error) {
                    // Ignore parse errors for malformed events
                    console.error('Failed to parse SSE event:', error);
                }
                currentEvent = {};
            }
        }
        return events;
    }
    mapEvent(eventType, data) {
        switch (eventType) {
            case 'message_start':
                return {
                    type: 'message_start',
                    message: data.message,
                };
            case 'content_block_start':
                return {
                    type: 'content_block_start',
                    index: data.index,
                    content_block: data.content_block,
                };
            case 'content_block_delta':
                return {
                    type: 'content_block_delta',
                    index: data.index,
                    delta: data.delta,
                };
            case 'content_block_stop':
                return {
                    type: 'content_block_stop',
                    index: data.index,
                };
            case 'message_delta':
                return {
                    type: 'message_delta',
                    delta: data.delta,
                    usage: data.usage,
                };
            case 'message_stop':
                return { type: 'message_stop' };
            case 'ping':
                return { type: 'ping' };
            case 'error':
                return {
                    type: 'error',
                    error: data.error,
                };
            default:
                return null;
        }
    }
    async collect() {
        const accumulator = new MessageStreamAccumulator();
        for await (const event of this) {
            accumulator.add(event);
            if (event.type === 'error') {
                throw new Error(`Stream error: ${event.error.message}`);
            }
        }
        return accumulator.toMessage();
    }
    async cancel() {
        await this.reader.cancel();
        this.isDone = true;
    }
}
// Stream accumulator for convenience
export class MessageStreamAccumulator {
    message = {
        content: [],
        usage: {
            input_tokens: 0,
            output_tokens: 0,
        },
    };
    contentBlocks = [];
    currentBlockText = new Map();
    currentBlockJson = new Map();
    currentThinking = new Map();
    add(event) {
        switch (event.type) {
            case 'message_start':
                this.message = {
                    ...this.message,
                    ...event.message,
                    content: [],
                };
                break;
            case 'content_block_start':
                this.contentBlocks[event.index] = event.content_block;
                if (event.content_block.type === 'text') {
                    this.currentBlockText.set(event.index, event.content_block.text);
                }
                else if (event.content_block.type === 'thinking') {
                    this.currentThinking.set(event.index, event.content_block.thinking);
                }
                else if (event.content_block.type === 'tool_use') {
                    this.currentBlockJson.set(event.index, JSON.stringify(event.content_block.input));
                }
                break;
            case 'content_block_delta':
                this.handleDelta(event.index, event.delta);
                break;
            case 'content_block_stop':
                this.finalizeBlock(event.index);
                break;
            case 'message_delta':
                if (event.delta.stop_reason) {
                    this.message.stop_reason = event.delta.stop_reason;
                }
                if (event.delta.stop_sequence) {
                    this.message.stop_sequence = event.delta.stop_sequence;
                }
                if (event.usage) {
                    this.message.usage = {
                        ...this.message.usage,
                        ...event.usage,
                    };
                }
                break;
            case 'message_stop':
                // Finalize message
                this.message.content = this.contentBlocks;
                break;
            case 'ping':
                // Ignore ping events
                break;
            case 'error':
                // Error will be handled by the caller
                break;
        }
    }
    handleDelta(index, delta) {
        switch (delta.type) {
            case 'text_delta':
                if (delta.text) {
                    const current = this.currentBlockText.get(index) || '';
                    this.currentBlockText.set(index, current + delta.text);
                }
                break;
            case 'input_json_delta':
                if (delta.partial_json) {
                    const current = this.currentBlockJson.get(index) || '';
                    this.currentBlockJson.set(index, current + delta.partial_json);
                }
                break;
            case 'thinking_delta':
                if (delta.thinking) {
                    const current = this.currentThinking.get(index) || '';
                    this.currentThinking.set(index, current + delta.thinking);
                }
                break;
        }
    }
    finalizeBlock(index) {
        const block = this.contentBlocks[index];
        if (!block)
            return;
        if (block.type === 'text') {
            const text = this.currentBlockText.get(index);
            if (text !== undefined) {
                this.contentBlocks[index] = { type: 'text', text };
            }
        }
        else if (block.type === 'thinking') {
            const thinking = this.currentThinking.get(index);
            if (thinking !== undefined) {
                this.contentBlocks[index] = { type: 'thinking', thinking };
            }
        }
        else if (block.type === 'tool_use') {
            const json = this.currentBlockJson.get(index);
            if (json !== undefined) {
                try {
                    const input = JSON.parse(json);
                    this.contentBlocks[index] = {
                        ...block,
                        input,
                    };
                }
                catch {
                    // Keep the original block if JSON parsing fails
                }
            }
        }
    }
    get content() {
        return this.contentBlocks
            .filter((b) => b && b.type === 'text')
            .map(b => b.text)
            .join('');
    }
    toMessage() {
        if (!this.message.id || !this.message.model) {
            throw new Error('Incomplete message: missing required fields');
        }
        return {
            id: this.message.id,
            type: 'message',
            role: 'assistant',
            content: this.contentBlocks.filter(b => b !== undefined),
            model: this.message.model,
            stop_reason: this.message.stop_reason ?? null,
            stop_sequence: this.message.stop_sequence ?? null,
            usage: this.message.usage ?? {
                input_tokens: 0,
                output_tokens: 0,
            },
        };
    }
}
//# sourceMappingURL=stream.js.map
import type { Message, ContentBlock, Usage, StopReason } from './types.js';
export type MessageStreamEvent = MessageStartEvent | ContentBlockStartEvent | ContentBlockDeltaEvent | ContentBlockStopEvent | MessageDeltaEvent | MessageStopEvent | PingEvent | ErrorEvent;
export interface MessageStartEvent {
    type: 'message_start';
    message: Partial<Message>;
}
export interface ContentBlockStartEvent {
    type: 'content_block_start';
    index: number;
    content_block: ContentBlock;
}
export interface ContentBlockDeltaEvent {
    type: 'content_block_delta';
    index: number;
    delta: ContentDelta;
}
export interface ContentDelta {
    type: 'text_delta' | 'input_json_delta' | 'thinking_delta';
    text?: string;
    partial_json?: string;
    thinking?: string;
}
export interface ContentBlockStopEvent {
    type: 'content_block_stop';
    index: number;
}
export interface MessageDeltaEvent {
    type: 'message_delta';
    delta: {
        stop_reason?: StopReason;
        stop_sequence?: string;
    };
    usage?: Partial<Usage>;
}
export interface MessageStopEvent {
    type: 'message_stop';
}
export interface PingEvent {
    type: 'ping';
}
export interface ErrorEvent {
    type: 'error';
    error: {
        type: string;
        message: string;
    };
}
export declare class MessageStream implements AsyncIterable<MessageStreamEvent> {
    private reader;
    private buffer;
    private isDone;
    constructor(stream: ReadableStream<Uint8Array>);
    [Symbol.asyncIterator](): AsyncIterator<MessageStreamEvent>;
    private parseEvents;
    private mapEvent;
    collect(): Promise<Message>;
    cancel(): Promise<void>;
}
export declare class MessageStreamAccumulator {
    private message;
    private contentBlocks;
    private currentBlockText;
    private currentBlockJson;
    private currentThinking;
    add(event: MessageStreamEvent): void;
    private handleDelta;
    private finalizeBlock;
    get content(): string;
    toMessage(): Message;
}
//# sourceMappingURL=stream.d.ts.map
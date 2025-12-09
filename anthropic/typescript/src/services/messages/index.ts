// Service
export type { MessagesService } from './service.js';
export { MessagesServiceImpl, createMessagesService } from './service.js';

// Types
export type {
  Message,
  ContentBlock,
  TextBlock,
  ImageBlock,
  ToolUseBlock,
  ToolResultBlock,
  DocumentBlock,
  ThinkingBlock,
  ImageSource,
  DocumentSource,
  Tool,
  CacheControl,
  CreateMessageRequest,
  MessageParam,
  SystemBlock,
  ThinkingConfig,
  ToolChoice,
  Metadata,
  CountTokensRequest,
  TokenCount,
  Usage,
  StopReason,
} from './types.js';

export {
  createUserMessage,
  createAssistantMessage,
  createTextBlock,
  createToolUseBlock,
  createToolResultBlock,
  createImageBlock,
  createDocumentBlock,
} from './types.js';

// Streaming
export type {
  MessageStreamEvent,
  MessageStartEvent,
  ContentBlockStartEvent,
  ContentBlockDeltaEvent,
  ContentBlockStopEvent,
  MessageDeltaEvent,
  MessageStopEvent,
  PingEvent,
  ErrorEvent,
  ContentDelta,
} from './stream.js';

export { MessageStream, MessageStreamAccumulator } from './stream.js';

// Validation
export { validateCreateMessageRequest, validateCountTokensRequest } from './validation.js';

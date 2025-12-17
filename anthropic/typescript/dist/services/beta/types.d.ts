import type { MessageParam, Tool, CacheControl, ThinkingConfig, ThinkingBlock, ImageSource, DocumentSource } from '../messages/types.js';
export type { CacheControl, ThinkingConfig, ThinkingBlock, ImageSource };
export type PdfSource = DocumentSource;
export interface DocumentContent {
    type: 'document';
    source: PdfSource;
}
export interface SystemPromptWithCache {
    text: string;
    cache_control?: CacheControl;
}
export interface CacheUsage {
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
}
export interface TokenCountRequest {
    model: string;
    messages: MessageParam[];
    system?: string | SystemPromptWithCache[];
    tools?: Tool[];
}
export interface TokenCountResponse {
    input_tokens: number;
}
export type ComputerToolType = 'computer_20241022' | 'text_editor_20241022' | 'bash_20241022';
export interface ComputerTool {
    type: ComputerToolType;
    name: string;
    display_width_px?: number;
    display_height_px?: number;
    display_number?: number;
}
export interface ComputerToolResult {
    type: 'tool_result';
    tool_use_id: string;
    content: ComputerToolResultContent[];
    is_error?: boolean;
}
export type ComputerToolResultContent = {
    type: 'text';
    text: string;
} | {
    type: 'image';
    source: ImageSource;
};
//# sourceMappingURL=types.d.ts.map
import type { MessageParam, Tool } from '../messages/types.js';
export interface ThinkingConfig {
    type: 'enabled';
    budget_tokens: number;
}
export interface ThinkingBlock {
    type: 'thinking';
    thinking: string;
}
export interface PdfSource {
    type: 'base64';
    media_type: 'application/pdf';
    data: string;
}
export interface DocumentContent {
    type: 'document';
    source: PdfSource;
}
export interface CacheControl {
    type: 'ephemeral';
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
export interface ImageSource {
    type: 'base64';
    media_type: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
    data: string;
}
//# sourceMappingURL=types.d.ts.map
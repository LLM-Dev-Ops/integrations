/**
 * Generation-related types for the Gemini API.
 */
import type { Content } from './content.js';
import type { SafetySetting, SafetyRating } from './safety.js';
import type { Tool, ToolConfig } from './tools.js';
/** Configuration for content generation */
export interface GenerationConfig {
    temperature?: number;
    topP?: number;
    topK?: number;
    maxOutputTokens?: number;
    stopSequences?: string[];
    candidateCount?: number;
    responseMimeType?: string;
    responseSchema?: Record<string, unknown>;
}
/** Block reason for prompt feedback */
export type BlockReason = 'SAFETY' | 'OTHER' | 'BLOCKLIST' | 'PROHIBITED_CONTENT';
/** Prompt feedback */
export interface PromptFeedback {
    blockReason?: BlockReason;
    safetyRatings?: SafetyRating[];
}
/** Finish reason for generation */
export type FinishReason = 'STOP' | 'MAX_TOKENS' | 'SAFETY' | 'RECITATION' | 'OTHER' | 'BLOCKLIST' | 'PROHIBITED_CONTENT' | 'SPII';
/** Usage metadata */
export interface UsageMetadata {
    promptTokenCount: number;
    candidatesTokenCount?: number;
    totalTokenCount: number;
    cachedContentTokenCount?: number;
}
/** Citation source */
export interface CitationSource {
    startIndex?: number;
    endIndex?: number;
    uri?: string;
}
/** Citation metadata */
export interface CitationMetadata {
    citationSources: CitationSource[];
}
/** Grounding metadata */
export interface GroundingMetadata {
    webSearchQueries?: string[];
    searchEntryPoint?: Record<string, unknown>;
    groundingChunks?: Record<string, unknown>[];
    groundingSupports?: Record<string, unknown>[];
}
/** Response candidate */
export interface Candidate {
    content: Content;
    finishReason?: FinishReason;
    safetyRatings?: SafetyRating[];
    citationMetadata?: CitationMetadata;
    groundingMetadata?: GroundingMetadata;
    index?: number;
    tokenCount?: number;
}
/** Request for content generation */
export interface GenerateContentRequest {
    contents: Content[];
    systemInstruction?: Content;
    tools?: Tool[];
    toolConfig?: ToolConfig;
    safetySettings?: SafetySetting[];
    generationConfig?: GenerationConfig;
    cachedContent?: string;
}
/** Response from content generation */
export interface GenerateContentResponse {
    candidates?: Candidate[];
    promptFeedback?: PromptFeedback;
    usageMetadata?: UsageMetadata;
    modelVersion?: string;
}
//# sourceMappingURL=generation.d.ts.map
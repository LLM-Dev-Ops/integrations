/**
 * Common types for the Gemini API.
 */
import type { Content } from './content.js';
import type { GenerateContentRequest } from './generation.js';
/** Request for token counting */
export interface CountTokensRequest {
    contents?: Content[];
    generateContentRequest?: GenerateContentRequest;
}
/** Response from token counting */
export interface CountTokensResponse {
    totalTokens: number;
    cachedContentTokenCount?: number;
}
//# sourceMappingURL=common.d.ts.map
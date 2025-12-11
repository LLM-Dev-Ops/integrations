/**
 * Cached content types for the Gemini API.
 */
import type { Content } from './content.js';
import type { Tool } from './tools.js';
/** Usage metadata for cached content */
export interface CachedContentUsageMetadata {
    totalTokenCount: number;
}
/** Cached content */
export interface CachedContent {
    name?: string;
    displayName?: string;
    model: string;
    createTime?: string;
    updateTime?: string;
    expireTime?: string;
    usageMetadata?: CachedContentUsageMetadata;
}
/** Request for creating cached content */
export interface CreateCachedContentRequest {
    model: string;
    displayName?: string;
    contents: Content[];
    systemInstruction?: Content;
    tools?: Tool[];
    ttl?: string;
    expireTime?: string;
}
/** Request for updating cached content */
export interface UpdateCachedContentRequest {
    ttl?: string;
    expireTime?: string;
}
/** Parameters for listing cached contents */
export interface ListCachedContentsParams {
    pageSize?: number;
    pageToken?: string;
}
/** Response from listing cached contents */
export interface ListCachedContentsResponse {
    cachedContents: CachedContent[];
    nextPageToken?: string;
}
//# sourceMappingURL=cached-content.d.ts.map
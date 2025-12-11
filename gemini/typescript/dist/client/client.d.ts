/**
 * Implementation of the Gemini client.
 */
import type { GeminiConfig } from '../config/index.js';
import type { ContentService } from '../services/content.js';
import type { EmbeddingsService } from '../services/embeddings.js';
import type { ModelsService } from '../services/models.js';
import type { FilesService } from '../services/files.js';
import type { CachedContentService } from '../services/cached-content.js';
import type { GeminiClient } from './types.js';
/**
 * Implementation of the Gemini client.
 */
export declare class GeminiClientImpl implements GeminiClient {
    private readonly config;
    private readonly httpClient;
    private _content?;
    private _embeddings?;
    private _models?;
    private _files?;
    private _cachedContent?;
    constructor(config: GeminiConfig);
    get content(): ContentService;
    get embeddings(): EmbeddingsService;
    get models(): ModelsService;
    get files(): FilesService;
    get cachedContent(): CachedContentService;
}
//# sourceMappingURL=client.d.ts.map
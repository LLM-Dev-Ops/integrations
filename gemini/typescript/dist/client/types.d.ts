/**
 * Client interface and types for Gemini API.
 */
import type { ContentService } from '../services/content.js';
import type { EmbeddingsService } from '../services/embeddings.js';
import type { ModelsService } from '../services/models.js';
import type { FilesService } from '../services/files.js';
import type { CachedContentService } from '../services/cached-content.js';
/**
 * Main client for interacting with Google Gemini API.
 */
export interface GeminiClient {
    /** Access the content generation service */
    readonly content: ContentService;
    /** Access the embeddings service */
    readonly embeddings: EmbeddingsService;
    /** Access the models service */
    readonly models: ModelsService;
    /** Access the files service */
    readonly files: FilesService;
    /** Access the cached content service */
    readonly cachedContent: CachedContentService;
}
//# sourceMappingURL=types.d.ts.map
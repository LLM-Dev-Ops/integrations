/**
 * Implementation of the Gemini client.
 */
import { resolveConfig, validateConfig } from '../config/index.js';
import { ContentServiceImpl } from '../services/content.js';
import { EmbeddingsServiceImpl } from '../services/embeddings.js';
import { ModelsServiceImpl } from '../services/models.js';
import { FilesServiceImpl } from '../services/files.js';
import { CachedContentServiceImpl } from '../services/cached-content.js';
import { HttpClient } from './http.js';
/**
 * Implementation of the Gemini client.
 */
export class GeminiClientImpl {
    config;
    httpClient;
    // Lazy-initialized services
    _content;
    _embeddings;
    _models;
    _files;
    _cachedContent;
    constructor(config) {
        validateConfig(config);
        this.config = resolveConfig(config);
        this.httpClient = new HttpClient(this.config);
    }
    get content() {
        if (!this._content) {
            this._content = new ContentServiceImpl(this.httpClient);
        }
        return this._content;
    }
    get embeddings() {
        if (!this._embeddings) {
            this._embeddings = new EmbeddingsServiceImpl(this.httpClient);
        }
        return this._embeddings;
    }
    get models() {
        if (!this._models) {
            this._models = new ModelsServiceImpl(this.httpClient);
        }
        return this._models;
    }
    get files() {
        if (!this._files) {
            this._files = new FilesServiceImpl(this.httpClient, this.config);
        }
        return this._files;
    }
    get cachedContent() {
        if (!this._cachedContent) {
            this._cachedContent = new CachedContentServiceImpl(this.httpClient);
        }
        return this._cachedContent;
    }
}
//# sourceMappingURL=client.js.map
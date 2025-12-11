/**
 * Implementation of the Gemini client.
 */

import type { GeminiConfig, ResolvedGeminiConfig } from '../config/index.js';
import { resolveConfig, validateConfig } from '../config/index.js';
import type { ContentService } from '../services/content.js';
import type { EmbeddingsService } from '../services/embeddings.js';
import type { ModelsService } from '../services/models.js';
import type { FilesService } from '../services/files.js';
import type { CachedContentService } from '../services/cached-content.js';
import { ContentServiceImpl } from '../services/content.js';
import { EmbeddingsServiceImpl } from '../services/embeddings.js';
import { ModelsServiceImpl } from '../services/models.js';
import { FilesServiceImpl } from '../services/files.js';
import { CachedContentServiceImpl } from '../services/cached-content.js';
import type { GeminiClient } from './types.js';
import { HttpClient } from './http.js';

/**
 * Implementation of the Gemini client.
 */
export class GeminiClientImpl implements GeminiClient {
  private readonly config: ResolvedGeminiConfig;
  private readonly httpClient: HttpClient;

  // Lazy-initialized services
  private _content?: ContentService;
  private _embeddings?: EmbeddingsService;
  private _models?: ModelsService;
  private _files?: FilesService;
  private _cachedContent?: CachedContentService;

  constructor(config: GeminiConfig) {
    validateConfig(config);
    this.config = resolveConfig(config);
    this.httpClient = new HttpClient(this.config);
  }

  get content(): ContentService {
    if (!this._content) {
      this._content = new ContentServiceImpl(this.httpClient);
    }
    return this._content;
  }

  get embeddings(): EmbeddingsService {
    if (!this._embeddings) {
      this._embeddings = new EmbeddingsServiceImpl(this.httpClient);
    }
    return this._embeddings;
  }

  get models(): ModelsService {
    if (!this._models) {
      this._models = new ModelsServiceImpl(this.httpClient);
    }
    return this._models;
  }

  get files(): FilesService {
    if (!this._files) {
      this._files = new FilesServiceImpl(this.httpClient, this.config);
    }
    return this._files;
  }

  get cachedContent(): CachedContentService {
    if (!this._cachedContent) {
      this._cachedContent = new CachedContentServiceImpl(this.httpClient);
    }
    return this._cachedContent;
  }
}

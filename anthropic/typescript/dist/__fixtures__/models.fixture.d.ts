import type { ModelInfo, ModelListResponse } from '../services/models/types.js';
/**
 * Mock factory for creating test model info
 */
export declare function mockModelInfo(overrides?: Partial<ModelInfo>): ModelInfo;
/**
 * Mock factory for creating test model list response
 */
export declare function mockModelListResponse(overrides?: Partial<ModelListResponse>): ModelListResponse;
/**
 * Predefined model fixtures
 */
export declare const CLAUDE_3_5_SONNET: ModelInfo;
export declare const CLAUDE_3_5_HAIKU: ModelInfo;
export declare const CLAUDE_3_OPUS: ModelInfo;
export declare const CLAUDE_3_SONNET: ModelInfo;
export declare const CLAUDE_3_HAIKU: ModelInfo;
/**
 * All available models
 */
export declare const ALL_MODELS: ModelInfo[];
//# sourceMappingURL=models.fixture.d.ts.map
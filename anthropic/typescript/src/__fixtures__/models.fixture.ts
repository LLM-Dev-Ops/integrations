import type { ModelInfo, ModelListResponse } from '../services/models/types.js';

/**
 * Mock factory for creating test model info
 */
export function mockModelInfo(overrides?: Partial<ModelInfo>): ModelInfo {
  return {
    id: 'claude-3-5-sonnet-20241022',
    display_name: 'Claude 3.5 Sonnet',
    created_at: '2024-10-22T00:00:00Z',
    type: 'model',
    ...overrides,
  };
}

/**
 * Mock factory for creating test model list response
 */
export function mockModelListResponse(overrides?: Partial<ModelListResponse>): ModelListResponse {
  return {
    data: [
      mockModelInfo({
        id: 'claude-3-5-sonnet-20241022',
        display_name: 'Claude 3.5 Sonnet',
        created_at: '2024-10-22T00:00:00Z',
      }),
      mockModelInfo({
        id: 'claude-3-5-haiku-20241022',
        display_name: 'Claude 3.5 Haiku',
        created_at: '2024-10-22T00:00:00Z',
      }),
      mockModelInfo({
        id: 'claude-3-opus-20240229',
        display_name: 'Claude 3 Opus',
        created_at: '2024-02-29T00:00:00Z',
      }),
    ],
    has_more: false,
    first_id: 'claude-3-5-sonnet-20241022',
    last_id: 'claude-3-opus-20240229',
    ...overrides,
  };
}

/**
 * Predefined model fixtures
 */
export const CLAUDE_3_5_SONNET: ModelInfo = mockModelInfo({
  id: 'claude-3-5-sonnet-20241022',
  display_name: 'Claude 3.5 Sonnet',
  created_at: '2024-10-22T00:00:00Z',
});

export const CLAUDE_3_5_HAIKU: ModelInfo = mockModelInfo({
  id: 'claude-3-5-haiku-20241022',
  display_name: 'Claude 3.5 Haiku',
  created_at: '2024-10-22T00:00:00Z',
});

export const CLAUDE_3_OPUS: ModelInfo = mockModelInfo({
  id: 'claude-3-opus-20240229',
  display_name: 'Claude 3 Opus',
  created_at: '2024-02-29T00:00:00Z',
});

export const CLAUDE_3_SONNET: ModelInfo = mockModelInfo({
  id: 'claude-3-sonnet-20240229',
  display_name: 'Claude 3 Sonnet',
  created_at: '2024-02-29T00:00:00Z',
});

export const CLAUDE_3_HAIKU: ModelInfo = mockModelInfo({
  id: 'claude-3-haiku-20240307',
  display_name: 'Claude 3 Haiku',
  created_at: '2024-03-07T00:00:00Z',
});

/**
 * All available models
 */
export const ALL_MODELS: ModelInfo[] = [
  CLAUDE_3_5_SONNET,
  CLAUDE_3_5_HAIKU,
  CLAUDE_3_OPUS,
  CLAUDE_3_SONNET,
  CLAUDE_3_HAIKU,
];

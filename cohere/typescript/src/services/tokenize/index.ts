/**
 * Tokenize service module.
 */

import type { HttpTransport } from '../../transport';
import type { CohereConfig } from '../../config';
import { ValidationError } from '../../errors';
import type { ApiMeta } from '../../types';

/**
 * Tokenize request
 */
export interface TokenizeRequest {
  /** Text to tokenize */
  text: string;
  /** Model to use for tokenization */
  model?: string;
}

/**
 * Tokenize response
 */
export interface TokenizeResponse {
  /** Token IDs */
  tokens: number[];
  /** Token strings */
  tokenStrings: string[];
  /** API metadata */
  meta?: ApiMeta;
}

/**
 * Detokenize request
 */
export interface DetokenizeRequest {
  /** Tokens to convert back to text */
  tokens: number[];
  /** Model to use */
  model?: string;
}

/**
 * Detokenize response
 */
export interface DetokenizeResponse {
  /** Reconstructed text */
  text: string;
  /** API metadata */
  meta?: ApiMeta;
}

/**
 * Tokenize service interface
 */
export interface TokenizeService {
  /**
   * Tokenize text
   */
  tokenize(request: TokenizeRequest): Promise<TokenizeResponse>;

  /**
   * Convert tokens back to text
   */
  detokenize(request: DetokenizeRequest): Promise<DetokenizeResponse>;
}

/**
 * Tokenize service implementation
 */
export class TokenizeServiceImpl implements TokenizeService {
  private readonly transport: HttpTransport;
  private readonly config: CohereConfig;

  constructor(transport: HttpTransport, config: CohereConfig) {
    this.transport = transport;
    this.config = config;
  }

  /**
   * Tokenize text
   */
  async tokenize(request: TokenizeRequest): Promise<TokenizeResponse> {
    if (!request.text) {
      throw new ValidationError('Text is required', [
        { field: 'text', message: 'Text is required', code: 'REQUIRED' },
      ]);
    }

    const url = this.config.buildUrl('/tokenize');
    const body: Record<string, unknown> = {
      text: request.text,
    };
    if (request.model) body['model'] = request.model;

    const response = await this.transport.send('POST', url, {}, body);
    const data = response.body as Record<string, unknown>;

    return {
      tokens: (data['tokens'] ?? []) as number[],
      tokenStrings: (data['token_strings'] ?? []) as string[],
      meta: data['meta'] as TokenizeResponse['meta'],
    };
  }

  /**
   * Convert tokens back to text
   */
  async detokenize(request: DetokenizeRequest): Promise<DetokenizeResponse> {
    if (!request.tokens || request.tokens.length === 0) {
      throw new ValidationError('Tokens are required', [
        { field: 'tokens', message: 'At least one token is required', code: 'REQUIRED' },
      ]);
    }

    const url = this.config.buildUrl('/detokenize');
    const body: Record<string, unknown> = {
      tokens: request.tokens,
    };
    if (request.model) body['model'] = request.model;

    const response = await this.transport.send('POST', url, {}, body);
    const data = response.body as Record<string, unknown>;

    return {
      text: String(data['text'] ?? ''),
      meta: data['meta'] as DetokenizeResponse['meta'],
    };
  }
}

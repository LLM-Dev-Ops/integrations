/**
 * Embedding Service
 *
 * Implements embeddings generation for Azure OpenAI.
 */

import type { RequestOptions, AzureDeployment } from '../../types/index.js';
import type { AuthProvider } from '../../auth/index.js';
import type { DeploymentRegistry } from '../../deployment/index.js';
import type { EmbeddingRequest, EmbeddingResponse } from './types.js';
import { buildEmbeddingsUrl } from '../../infra/url-builder.js';
import { mapResponseToError, mapFetchError } from '../../errors/index.js';

/** Embedding service interface */
export interface EmbeddingService {
  /**
   * Creates embeddings for the given input
   */
  create(request: EmbeddingRequest, options?: RequestOptions): Promise<EmbeddingResponse>;

  /**
   * Creates embeddings for multiple inputs (convenience method)
   */
  createBatch(
    deploymentId: string,
    inputs: string[],
    options?: RequestOptions
  ): Promise<EmbeddingResponse>;
}

/** Service dependencies */
export interface EmbeddingServiceDependencies {
  authProvider: AuthProvider;
  deploymentRegistry: DeploymentRegistry;
  defaultTimeout: number;
}

/**
 * Embedding service implementation
 */
export class EmbeddingServiceImpl implements EmbeddingService {
  private readonly authProvider: AuthProvider;
  private readonly deploymentRegistry: DeploymentRegistry;
  private readonly defaultTimeout: number;

  constructor(deps: EmbeddingServiceDependencies) {
    this.authProvider = deps.authProvider;
    this.deploymentRegistry = deps.deploymentRegistry;
    this.defaultTimeout = deps.defaultTimeout;
  }

  async create(
    request: EmbeddingRequest,
    options?: RequestOptions
  ): Promise<EmbeddingResponse> {
    const deployment = this.resolveDeployment(request.deploymentId);
    const url = buildEmbeddingsUrl(deployment);

    const [authHeader, authValue] = await this.authProvider.getAuthHeader();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      [authHeader]: authValue,
      ...options?.headers,
    };

    // Build request body (remove deploymentId as it's in URL)
    const { deploymentId: _, ...body } = request;

    const timeout = options?.timeout ?? this.defaultTimeout;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: options?.signal ?? controller.signal,
      });

      if (!response.ok) {
        throw await mapResponseToError(response, request.deploymentId);
      }

      return await response.json() as EmbeddingResponse;
    } catch (error) {
      throw mapFetchError(error, request.deploymentId);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async createBatch(
    deploymentId: string,
    inputs: string[],
    options?: RequestOptions
  ): Promise<EmbeddingResponse> {
    return this.create(
      {
        deploymentId,
        input: inputs,
      },
      options
    );
  }

  /**
   * Resolves deployment from registry
   */
  private resolveDeployment(deploymentId: string): AzureDeployment {
    const deployment = this.deploymentRegistry.resolve(deploymentId);
    if (!deployment) {
      // Try to resolve by model hint
      const resolution = this.deploymentRegistry.resolveByModel(deploymentId, {
        requiredCapabilities: ['embedding'],
      });
      if (resolution) {
        return resolution.deployment;
      }
      throw new Error(`Embedding deployment not found: ${deploymentId}`);
    }
    return deployment;
  }
}

/**
 * Utility to compute cosine similarity between two embeddings
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Embeddings must have the same dimension');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const aVal = a[i] ?? 0;
    const bVal = b[i] ?? 0;
    dotProduct += aVal * bVal;
    normA += aVal * aVal;
    normB += bVal * bVal;
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  if (magnitude === 0) return 0;

  return dotProduct / magnitude;
}

/**
 * Utility to compute euclidean distance between two embeddings
 */
export function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Embeddings must have the same dimension');
  }

  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const aVal = a[i] ?? 0;
    const bVal = b[i] ?? 0;
    const diff = aVal - bVal;
    sum += diff * diff;
  }

  return Math.sqrt(sum);
}

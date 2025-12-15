/**
 * Azure OpenAI URL Builder
 *
 * Constructs Azure-specific API URLs following the format:
 * https://{resource}.openai.azure.com/openai/deployments/{deployment}/{operation}?api-version={version}
 */

import type { AzureDeployment, ApiVersion } from '../types/index.js';

/** Supported Azure OpenAI operations */
export type AzureOperation =
  | 'chat/completions'
  | 'completions'
  | 'embeddings'
  | 'images/generations'
  | 'audio/transcriptions'
  | 'audio/translations'
  | 'audio/speech';

/**
 * URL Builder for Azure OpenAI endpoints
 */
export class AzureUrlBuilder {
  private readonly deployment: AzureDeployment;
  private operation?: AzureOperation;
  private apiVersionOverride?: ApiVersion;
  private queryParams: Map<string, string> = new Map();

  constructor(deployment: AzureDeployment) {
    this.deployment = deployment;
  }

  /**
   * Creates a new URL builder for a deployment
   */
  static for(deployment: AzureDeployment): AzureUrlBuilder {
    return new AzureUrlBuilder(deployment);
  }

  /**
   * Sets the operation path
   */
  withOperation(operation: AzureOperation): this {
    this.operation = operation;
    return this;
  }

  /**
   * Overrides the default API version
   */
  withApiVersion(version: ApiVersion): this {
    this.apiVersionOverride = version;
    return this;
  }

  /**
   * Adds a query parameter
   */
  withQueryParam(key: string, value: string): this {
    this.queryParams.set(key, value);
    return this;
  }

  /**
   * Builds the complete URL
   */
  build(): string {
    if (!this.operation) {
      throw new Error('Operation must be specified');
    }

    const baseUrl = this.deployment.endpoint
      ?? `https://${this.deployment.resourceName}.openai.azure.com`;

    const apiVersion = this.apiVersionOverride ?? this.deployment.apiVersion;

    // Build path
    const path = `/openai/deployments/${this.deployment.deploymentId}/${this.operation}`;

    // Build query string
    const params = new URLSearchParams();
    params.set('api-version', apiVersion);

    for (const [key, value] of this.queryParams) {
      params.set(key, value);
    }

    return `${baseUrl}${path}?${params.toString()}`;
  }
}

/**
 * Convenience function to build chat completions URL
 */
export function buildChatCompletionsUrl(deployment: AzureDeployment, apiVersion?: ApiVersion): string {
  const builder = AzureUrlBuilder.for(deployment).withOperation('chat/completions');
  if (apiVersion) {
    builder.withApiVersion(apiVersion);
  }
  return builder.build();
}

/**
 * Convenience function to build embeddings URL
 */
export function buildEmbeddingsUrl(deployment: AzureDeployment, apiVersion?: ApiVersion): string {
  const builder = AzureUrlBuilder.for(deployment).withOperation('embeddings');
  if (apiVersion) {
    builder.withApiVersion(apiVersion);
  }
  return builder.build();
}

/**
 * Convenience function to build completions URL (legacy)
 */
export function buildCompletionsUrl(deployment: AzureDeployment, apiVersion?: ApiVersion): string {
  const builder = AzureUrlBuilder.for(deployment).withOperation('completions');
  if (apiVersion) {
    builder.withApiVersion(apiVersion);
  }
  return builder.build();
}

/**
 * Convenience function to build image generation URL
 */
export function buildImageGenerationUrl(deployment: AzureDeployment, apiVersion?: ApiVersion): string {
  const builder = AzureUrlBuilder.for(deployment).withOperation('images/generations');
  if (apiVersion) {
    builder.withApiVersion(apiVersion);
  }
  return builder.build();
}

/**
 * Convenience function to build audio transcription URL
 */
export function buildAudioTranscriptionUrl(deployment: AzureDeployment, apiVersion?: ApiVersion): string {
  const builder = AzureUrlBuilder.for(deployment).withOperation('audio/transcriptions');
  if (apiVersion) {
    builder.withApiVersion(apiVersion);
  }
  return builder.build();
}

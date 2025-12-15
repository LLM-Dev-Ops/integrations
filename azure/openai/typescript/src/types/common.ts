/**
 * Azure OpenAI Common Types
 *
 * Core type definitions for Azure OpenAI integration following SPARC specification.
 */

/** Supported Azure API versions */
export type ApiVersion =
  | '2024-06-01'
  | '2024-08-01-preview'
  | '2024-10-01-preview'
  | '2023-05-15'
  | '2023-12-01-preview';

/** Azure region identifiers */
export type AzureRegion =
  | 'eastus'
  | 'eastus2'
  | 'westus'
  | 'westus2'
  | 'westus3'
  | 'centralus'
  | 'northcentralus'
  | 'southcentralus'
  | 'westeurope'
  | 'northeurope'
  | 'uksouth'
  | 'ukwest'
  | 'francecentral'
  | 'swedencentral'
  | 'switzerlandnorth'
  | 'japaneast'
  | 'japanwest'
  | 'australiaeast'
  | 'southeastasia'
  | 'koreacentral'
  | 'canadacentral'
  | 'canadaeast'
  | string;

/** Model family identifiers for deployment routing */
export type ModelFamily =
  | 'gpt-4'
  | 'gpt-4o'
  | 'gpt-4o-mini'
  | 'gpt-4-turbo'
  | 'gpt-35-turbo'
  | 'text-embedding-ada-002'
  | 'text-embedding-3-small'
  | 'text-embedding-3-large'
  | 'dall-e-3'
  | 'whisper';

/** Model capabilities for feature detection */
export type ModelCapability =
  | 'chat'
  | 'completion'
  | 'embedding'
  | 'image-generation'
  | 'audio-transcription'
  | 'audio-translation'
  | 'function-calling'
  | 'vision'
  | 'json-mode'
  | 'streaming';

/** Token usage information */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** Request options for API calls */
export interface RequestOptions {
  timeout?: number;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

/** Authentication method */
export type AuthMethod = 'api-key' | 'azure-ad' | 'managed-identity';

/** Azure deployment configuration */
export interface AzureDeployment {
  /** Unique deployment identifier */
  deploymentId: string;
  /** Azure resource name (the subdomain) */
  resourceName: string;
  /** Azure region where deployment is hosted */
  region: AzureRegion;
  /** API version for this deployment */
  apiVersion: ApiVersion;
  /** Model family this deployment serves */
  modelFamily: ModelFamily;
  /** Capabilities supported by this deployment */
  capabilities: ModelCapability[];
  /** Maximum tokens supported */
  maxTokens?: number;
  /** Whether this deployment is active */
  active?: boolean;
  /** Priority for load balancing (higher = preferred) */
  priority?: number;
  /** Custom endpoint override (for private endpoints) */
  endpoint?: string;
}

/** Content filter severity levels */
export type ContentFilterSeverity = 'safe' | 'low' | 'medium' | 'high';

/** Content filter category */
export interface ContentFilterCategory {
  filtered: boolean;
  severity: ContentFilterSeverity;
}

/** Content filter results from Azure */
export interface ContentFilterResults {
  hate?: ContentFilterCategory;
  selfHarm?: ContentFilterCategory;
  sexual?: ContentFilterCategory;
  violence?: ContentFilterCategory;
  profanity?: ContentFilterCategory;
  jailbreak?: { filtered: boolean; detected: boolean };
  protectedMaterialText?: { filtered: boolean; detected: boolean };
  protectedMaterialCode?: { filtered: boolean; detected: boolean; citation?: { url?: string; license?: string } };
}

/** Prompt filter results */
export interface PromptFilterResult {
  promptIndex: number;
  contentFilterResults: ContentFilterResults;
}

/** Azure-specific error response */
export interface AzureErrorResponse {
  error: {
    code: string;
    message: string;
    param?: string;
    type?: string;
    innerError?: {
      code?: string;
      contentFilterResults?: ContentFilterResults;
    };
  };
}

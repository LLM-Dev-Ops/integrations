/**
 * Azure Cognitive Search - Index Service
 *
 * Provides index metadata and statistics operations.
 * Note: Index creation/deletion is out of scope (infrastructure provisioning).
 */

import type { HttpTransport } from '../transport/index.js';
import type {
  GetIndexRequest,
  GetIndexStatsRequest,
  IndexDefinition,
  IndexStats,
  IndexField,
} from '../types/index.js';

/** Raw Azure index definition response */
interface AzureIndexDefinition {
  name: string;
  fields: Array<{
    name: string;
    type: string;
    key?: boolean;
    searchable?: boolean;
    filterable?: boolean;
    sortable?: boolean;
    facetable?: boolean;
    retrievable?: boolean;
    dimensions?: number;
    vectorSearchProfile?: string;
  }>;
  scoringProfiles?: Array<{
    name: string;
    textWeights?: Record<string, number>;
    functions?: Array<{
      type: 'freshness' | 'magnitude' | 'distance' | 'tag';
      fieldName: string;
      boost: number;
      interpolation?: 'constant' | 'linear' | 'quadratic' | 'logarithmic';
    }>;
  }>;
  semantic?: {
    configurations?: Array<{
      name: string;
      prioritizedFields: {
        titleField?: { fieldName: string };
        contentFields?: Array<{ fieldName: string }>;
        keywordsFields?: Array<{ fieldName: string }>;
      };
    }>;
  };
}

/** Raw Azure index stats response */
interface AzureIndexStats {
  documentCount: number;
  storageSize: number;
  vectorIndexSize?: number;
}

/**
 * Index service for Azure Cognitive Search
 */
export class IndexService {
  private readonly transport: HttpTransport;

  constructor(transport: HttpTransport) {
    this.transport = transport;
  }

  /**
   * Get index definition
   */
  async getIndex(request: GetIndexRequest): Promise<IndexDefinition> {
    const response = await this.transport.request<AzureIndexDefinition>({
      method: 'GET',
      path: `/indexes/${encodeURIComponent(request.index)}`,
      timeout: request.timeout,
      signal: request.signal,
    });

    return this.parseIndexDefinition(response.data);
  }

  /**
   * Get index statistics
   */
  async getStats(request: GetIndexStatsRequest): Promise<IndexStats> {
    const response = await this.transport.request<AzureIndexStats>({
      method: 'GET',
      path: `/indexes/${encodeURIComponent(request.index)}/stats`,
      timeout: request.timeout,
      signal: request.signal,
    });

    return {
      documentCount: response.data.documentCount,
      storageSize: response.data.storageSize,
      vectorIndexSize: response.data.vectorIndexSize,
    };
  }

  /**
   * List all indexes
   */
  async listIndexes(options?: { timeout?: number; signal?: AbortSignal }): Promise<string[]> {
    const response = await this.transport.request<{ value: Array<{ name: string }> }>({
      method: 'GET',
      path: '/indexes',
      timeout: options?.timeout,
      signal: options?.signal,
    });

    return response.data.value.map((idx) => idx.name);
  }

  /**
   * Get the key field for an index
   */
  async getKeyField(index: string, options?: { timeout?: number; signal?: AbortSignal }): Promise<string> {
    const indexDef = await this.getIndex({ index, ...options });
    const keyField = indexDef.fields.find((f) => f.key);
    if (!keyField) {
      throw new Error(`No key field found in index ${index}`);
    }
    return keyField.name;
  }

  /**
   * Get vector fields in an index
   */
  async getVectorFields(
    index: string,
    options?: { timeout?: number; signal?: AbortSignal }
  ): Promise<Array<{ name: string; dimensions?: number }>> {
    const indexDef = await this.getIndex({ index, ...options });
    return indexDef.fields
      .filter((f) => f.type === 'Collection(Edm.Single)' || f.dimensions)
      .map((f) => ({
        name: f.name,
        dimensions: f.dimensions,
      }));
  }

  // ========================================================================
  // Private Methods
  // ========================================================================

  private parseIndexDefinition(data: AzureIndexDefinition): IndexDefinition {
    const fields: IndexField[] = data.fields.map((f) => ({
      name: f.name,
      type: f.type,
      key: f.key,
      searchable: f.searchable,
      filterable: f.filterable,
      sortable: f.sortable,
      facetable: f.facetable,
      retrievable: f.retrievable,
      dimensions: f.dimensions,
      vectorSearchProfile: f.vectorSearchProfile,
    }));

    const definition: IndexDefinition = {
      name: data.name,
      fields,
    };

    if (data.scoringProfiles && data.scoringProfiles.length > 0) {
      definition.scoringProfiles = data.scoringProfiles.map((sp) => ({
        name: sp.name,
        textWeights: sp.textWeights,
        functions: sp.functions,
      }));
    }

    if (data.semantic?.configurations && data.semantic.configurations.length > 0) {
      definition.semanticSettings = {
        configurations: data.semantic.configurations.map((c) => ({
          name: c.name,
          prioritizedFields: {
            titleField: c.prioritizedFields.titleField
              ? { fieldName: c.prioritizedFields.titleField.fieldName }
              : undefined,
            contentFields: c.prioritizedFields.contentFields?.map((f) => ({
              fieldName: f.fieldName,
            })),
            keywordsFields: c.prioritizedFields.keywordsFields?.map((f) => ({
              fieldName: f.fieldName,
            })),
          },
        })),
      };
    }

    return definition;
  }
}

/** Create an index service */
export function createIndexService(transport: HttpTransport): IndexService {
  return new IndexService(transport);
}

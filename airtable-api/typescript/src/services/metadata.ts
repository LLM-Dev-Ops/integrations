/**
 * Metadata service for Airtable API following SPARC specification.
 *
 * Provides access to base and table schema information with optional caching.
 */

import { AirtableClient } from '../client/index.js';
import {
  Base,
  BaseId,
  TableId,
  TableSchema,
  FieldSchema,
  ViewSchema,
  isValidBaseId,
  isValidTableId,
} from '../types/index.js';
import { ValidationError } from '../errors/index.js';
import { Logger, NoopLogger } from '../observability/index.js';

// ============================================================================
// Response Types
// ============================================================================

/**
 * Response from listing bases.
 */
interface ListBasesResponse {
  /** Array of bases */
  bases: Base[];
}

/**
 * Response from listing tables.
 */
interface ListTablesResponse {
  /** Array of table schemas */
  tables: TableSchema[];
}

// ============================================================================
// Schema Cache
// ============================================================================

/**
 * Cache entry with expiration.
 */
interface CacheEntry<T> {
  /** Cached value */
  value: T;
  /** Expiration timestamp */
  expiresAt: number;
}

/**
 * TTL-based schema cache for metadata.
 *
 * Caches table schemas and base metadata to reduce API calls.
 * Uses time-to-live (TTL) based expiration.
 *
 * @example
 * ```typescript
 * const cache = new SchemaCache(300000); // 5 minute TTL
 * cache.set('appXXXXXXXXXXXXXX:tables', tables, 600000); // 10 minute override
 * const tables = cache.get('appXXXXXXXXXXXXXX:tables');
 * ```
 */
export class SchemaCache {
  private readonly cache = new Map<string, CacheEntry<unknown>>();
  private readonly defaultTtlMs: number;

  /**
   * Creates a new schema cache.
   *
   * @param defaultTtlMs - Default TTL in milliseconds (default: 5 minutes)
   */
  constructor(defaultTtlMs: number = 300000) {
    this.defaultTtlMs = defaultTtlMs;
  }

  /**
   * Gets a value from the cache.
   *
   * @param key - Cache key
   * @returns Cached value or undefined if not found or expired
   */
  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;

    if (!entry) {
      return undefined;
    }

    // Check expiration
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.value;
  }

  /**
   * Sets a value in the cache.
   *
   * @param key - Cache key
   * @param value - Value to cache
   * @param ttlMs - TTL in milliseconds (uses default if not specified)
   */
  set<T>(key: string, value: T, ttlMs?: number): void {
    const ttl = ttlMs ?? this.defaultTtlMs;
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttl,
    });
  }

  /**
   * Invalidates a cache entry.
   *
   * @param key - Cache key to invalidate
   */
  invalidate(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Clears all cache entries.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Gets cache statistics.
   *
   * @returns Statistics about cache size and entries
   */
  getStats(): {
    size: number;
    keys: string[];
  } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}

// ============================================================================
// Metadata Service Interface
// ============================================================================

/**
 * Metadata service interface for base and table schema operations.
 *
 * Provides methods to list and retrieve base metadata and table schemas.
 */
export interface MetadataService {
  /**
   * Lists all accessible bases.
   *
   * @returns Array of bases with metadata
   * @throws {AuthenticationError} If authentication fails
   * @throws {AirtableError} On API errors
   */
  listBases(): Promise<Base[]>;

  /**
   * Gets metadata for a specific base.
   *
   * @param baseId - Base ID (e.g., "appXXXXXXXXXXXXXX")
   * @returns Base metadata
   * @throws {ValidationError} If base ID is invalid
   * @throws {NotFoundError} If base is not found
   * @throws {AirtableError} On API errors
   */
  getBase(baseId: string): Promise<Base>;

  /**
   * Lists all tables in a base with their schemas.
   *
   * @param baseId - Base ID
   * @returns Array of table schemas
   * @throws {ValidationError} If base ID is invalid
   * @throws {NotFoundError} If base is not found
   * @throws {AirtableError} On API errors
   */
  listTables(baseId: string): Promise<TableSchema[]>;

  /**
   * Gets schema for a specific table.
   *
   * @param baseId - Base ID
   * @param tableIdOrName - Table ID (e.g., "tblXXXXXXXXXXXXXX") or table name
   * @returns Table schema
   * @throws {ValidationError} If base ID or table ID is invalid
   * @throws {NotFoundError} If base or table is not found
   * @throws {AirtableError} On API errors
   */
  getTable(baseId: string, tableIdOrName: string): Promise<TableSchema>;
}

// ============================================================================
// Metadata Service Implementation
// ============================================================================

/**
 * Implementation of MetadataService with optional caching.
 *
 * Provides access to Airtable base and table metadata through the Meta API.
 * Supports optional caching to reduce API calls.
 *
 * @example
 * ```typescript
 * const client = createAirtableClient(config);
 * const metadata = new MetadataServiceImpl(client, { cacheTtlMs: 300000 });
 *
 * // List all bases
 * const bases = await metadata.listBases();
 *
 * // Get table schema
 * const schema = await metadata.getTable('appXXXXXXXXXXXXXX', 'tblXXXXXXXXXXXXXX');
 * ```
 */
export class MetadataServiceImpl implements MetadataService {
  private readonly client: AirtableClient;
  private readonly cache?: SchemaCache;
  private readonly logger: Logger;

  /**
   * Creates a new metadata service.
   *
   * @param client - Airtable client instance
   * @param options - Service options
   * @param options.enableCache - Enable schema caching (default: false)
   * @param options.cacheTtlMs - Cache TTL in milliseconds (default: 300000 / 5 minutes)
   * @param options.logger - Optional logger instance
   */
  constructor(
    client: AirtableClient,
    options: {
      enableCache?: boolean;
      cacheTtlMs?: number;
      logger?: Logger;
    } = {}
  ) {
    this.client = client;
    this.logger = options.logger ?? client.logger ?? new NoopLogger();

    if (options.enableCache) {
      this.cache = new SchemaCache(options.cacheTtlMs);
      this.logger.info('Metadata cache enabled', { ttlMs: options.cacheTtlMs ?? 300000 });
    }
  }

  /**
   * Lists all accessible bases.
   *
   * @returns Array of bases
   */
  async listBases(): Promise<Base[]> {
    const cacheKey = 'meta:bases';

    // Check cache
    if (this.cache) {
      const cached = this.cache.get<Base[]>(cacheKey);
      if (cached) {
        this.logger.debug('Returning cached bases list');
        return cached;
      }
    }

    this.logger.info('Fetching bases list');

    const response = await this.client.get<ListBasesResponse>('/meta/bases');
    const bases = response.bases;

    // Cache result
    if (this.cache) {
      this.cache.set(cacheKey, bases);
    }

    this.logger.info('Fetched bases list', { count: bases.length });
    return bases;
  }

  /**
   * Gets metadata for a specific base.
   *
   * @param baseId - Base ID
   * @returns Base metadata
   */
  async getBase(baseId: string): Promise<Base> {
    // Validate base ID
    if (!isValidBaseId(baseId)) {
      throw new ValidationError(`Invalid base ID format: ${baseId}`, 'baseId');
    }

    const cacheKey = `meta:base:${baseId}`;

    // Check cache
    if (this.cache) {
      const cached = this.cache.get<Base>(cacheKey);
      if (cached) {
        this.logger.debug('Returning cached base metadata', { baseId });
        return cached;
      }
    }

    this.logger.info('Fetching base metadata', { baseId });

    const base = await this.client.get<Base>(`/meta/bases/${baseId}`);

    // Cache result
    if (this.cache) {
      this.cache.set(cacheKey, base);
    }

    this.logger.info('Fetched base metadata', { baseId, name: base.name });
    return base;
  }

  /**
   * Lists all tables in a base with their schemas.
   *
   * @param baseId - Base ID
   * @returns Array of table schemas
   */
  async listTables(baseId: string): Promise<TableSchema[]> {
    // Validate base ID
    if (!isValidBaseId(baseId)) {
      throw new ValidationError(`Invalid base ID format: ${baseId}`, 'baseId');
    }

    const cacheKey = `meta:tables:${baseId}`;

    // Check cache
    if (this.cache) {
      const cached = this.cache.get<TableSchema[]>(cacheKey);
      if (cached) {
        this.logger.debug('Returning cached tables list', { baseId });
        return cached;
      }
    }

    this.logger.info('Fetching tables list', { baseId });

    const response = await this.client.get<ListTablesResponse>(`/meta/bases/${baseId}/tables`);
    const tables = response.tables;

    // Cache result
    if (this.cache) {
      this.cache.set(cacheKey, tables);
    }

    this.logger.info('Fetched tables list', { baseId, count: tables.length });
    return tables;
  }

  /**
   * Gets schema for a specific table.
   *
   * @param baseId - Base ID
   * @param tableIdOrName - Table ID or table name
   * @returns Table schema
   */
  async getTable(baseId: string, tableIdOrName: string): Promise<TableSchema> {
    // Validate base ID
    if (!isValidBaseId(baseId)) {
      throw new ValidationError(`Invalid base ID format: ${baseId}`, 'baseId');
    }

    // Check if it's a table ID or name
    const isTableId = isValidTableId(tableIdOrName);
    const cacheKey = `meta:table:${baseId}:${tableIdOrName}`;

    // Check cache
    if (this.cache) {
      const cached = this.cache.get<TableSchema>(cacheKey);
      if (cached) {
        this.logger.debug('Returning cached table schema', { baseId, tableIdOrName });
        return cached;
      }
    }

    this.logger.info('Fetching table schema', { baseId, tableIdOrName, isTableId });

    // If table name is provided, we need to list tables and find it
    if (!isTableId) {
      const tables = await this.listTables(baseId);
      const table = tables.find(t => t.name === tableIdOrName);

      if (!table) {
        throw new ValidationError(`Table not found: ${tableIdOrName}`, 'tableIdOrName');
      }

      // Cache result
      if (this.cache) {
        this.cache.set(cacheKey, table);
      }

      this.logger.info('Found table by name', { baseId, tableName: tableIdOrName, tableId: table.id });
      return table;
    }

    // Table ID provided - fetch from API
    // Note: Airtable's Meta API doesn't have a direct endpoint for single table
    // We need to list all tables and filter
    const tables = await this.listTables(baseId);
    const table = tables.find(t => t.id === tableIdOrName);

    if (!table) {
      throw new ValidationError(`Table not found: ${tableIdOrName}`, 'tableIdOrName');
    }

    // Cache result
    if (this.cache) {
      this.cache.set(cacheKey, table);
    }

    this.logger.info('Found table by ID', { baseId, tableId: tableIdOrName });
    return table;
  }

  /**
   * Clears the metadata cache.
   *
   * Useful when you know metadata has changed and want to force a refresh.
   */
  clearCache(): void {
    if (this.cache) {
      this.cache.clear();
      this.logger.info('Metadata cache cleared');
    }
  }

  /**
   * Invalidates cache for a specific base.
   *
   * @param baseId - Base ID to invalidate
   */
  invalidateBase(baseId: string): void {
    if (this.cache) {
      this.cache.invalidate(`meta:base:${baseId}`);
      this.cache.invalidate(`meta:tables:${baseId}`);
      this.logger.info('Invalidated base cache', { baseId });
    }
  }

  /**
   * Invalidates cache for a specific table.
   *
   * @param baseId - Base ID
   * @param tableIdOrName - Table ID or name
   */
  invalidateTable(baseId: string, tableIdOrName: string): void {
    if (this.cache) {
      this.cache.invalidate(`meta:table:${baseId}:${tableIdOrName}`);
      this.logger.info('Invalidated table cache', { baseId, tableIdOrName });
    }
  }

  /**
   * Gets cache statistics.
   *
   * @returns Cache stats or undefined if cache is disabled
   */
  getCacheStats(): { size: number; keys: string[] } | undefined {
    return this.cache?.getStats();
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates a metadata service instance.
 *
 * @param client - Airtable client instance
 * @param options - Service options
 * @param options.enableCache - Enable schema caching (default: false)
 * @param options.cacheTtlMs - Cache TTL in milliseconds (default: 300000 / 5 minutes)
 * @param options.logger - Optional logger instance
 * @returns MetadataService implementation
 *
 * @example
 * ```typescript
 * const client = createAirtableClient(config);
 *
 * // Without caching
 * const metadata = createMetadataService(client);
 *
 * // With caching
 * const metadataWithCache = createMetadataService(client, {
 *   enableCache: true,
 *   cacheTtlMs: 600000, // 10 minutes
 * });
 *
 * // List bases
 * const bases = await metadata.listBases();
 *
 * // Get table schema
 * const table = await metadata.getTable('appXXXXXXXXXXXXXX', 'Table Name');
 * ```
 */
export function createMetadataService(
  client: AirtableClient,
  options: {
    enableCache?: boolean;
    cacheTtlMs?: number;
    logger?: Logger;
  } = {}
): MetadataService {
  return new MetadataServiceImpl(client, options);
}

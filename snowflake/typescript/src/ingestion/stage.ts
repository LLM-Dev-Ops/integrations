/**
 * Snowflake Stage Operations
 *
 * Manages file operations on Snowflake stages (PUT, LIST, GET, REMOVE).
 * @module @llmdevops/snowflake-integration/ingestion/stage
 */

import type {
  StageFile,
  PutOptions,
  PutResult,
  QueryResult,
  Value,
} from '../types/index.js';
import {
  StageNotFoundError,
  FileNotFoundError,
  PutFailedError,
  wrapError,
} from '../errors/index.js';

/**
 * Query executor interface for stage operations.
 */
export interface StageQueryExecutor {
  execute(sql: string, params?: Value[]): Promise<QueryResult>;
}

/**
 * Options for listing stage files.
 */
export interface ListStageOptions {
  /** Pattern to match files */
  pattern?: string;
  /** Include metadata */
  includeMetadata?: boolean;
}

/**
 * Options for getting files from stage.
 */
export interface GetFileOptions {
  /** Parallel downloads */
  parallel?: number;
}

/**
 * Manager for Snowflake stage operations.
 */
export class StageManager {
  private executor: StageQueryExecutor;

  /**
   * Creates a new stage manager.
   */
  constructor(executor: StageQueryExecutor) {
    this.executor = executor;
  }

  /**
   * Uploads a file to a Snowflake stage.
   *
   * @param localPath - Local file path
   * @param stagePath - Stage path (e.g., '@my_stage/folder/')
   * @param options - PUT options
   * @returns PUT operation results
   * @throws {PutFailedError} If upload fails
   * @throws {StageNotFoundError} If stage does not exist
   */
  async putFile(
    localPath: string,
    stagePath: string,
    options?: PutOptions
  ): Promise<PutResult[]> {
    try {
      // Build PUT command
      const sql = this.buildPutCommand(localPath, stagePath, options);

      // Execute PUT command
      const result = await this.executor.execute(sql);

      // Parse results
      return this.parsePutResults(result);
    } catch (error) {
      if (error instanceof StageNotFoundError || error instanceof PutFailedError) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.toLowerCase().includes('stage') && errorMessage.toLowerCase().includes('not exist')) {
        throw new StageNotFoundError(stagePath);
      }

      throw new PutFailedError(
        `Failed to upload file to ${stagePath}: ${errorMessage}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Lists files in a Snowflake stage.
   *
   * @param stagePath - Stage path (e.g., '@my_stage/folder/')
   * @param pattern - Optional file pattern
   * @returns Array of stage files
   * @throws {StageNotFoundError} If stage does not exist
   */
  async listStage(stagePath: string, pattern?: string): Promise<StageFile[]> {
    try {
      // Build LIST command
      const sql = pattern
        ? `LIST ${stagePath} PATTERN = '${pattern}'`
        : `LIST ${stagePath}`;

      // Execute LIST command
      const result = await this.executor.execute(sql);

      // Parse results
      return this.parseListResults(result);
    } catch (error) {
      if (error instanceof StageNotFoundError) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.toLowerCase().includes('stage') && errorMessage.toLowerCase().includes('not exist')) {
        throw new StageNotFoundError(stagePath);
      }

      throw wrapError(error, `Failed to list stage ${stagePath}`);
    }
  }

  /**
   * Downloads a file from a Snowflake stage.
   *
   * @param stagePath - Stage file path (e.g., '@my_stage/file.csv')
   * @param localPath - Local destination path
   * @param options - GET options
   * @throws {FileNotFoundError} If file does not exist
   * @throws {StageNotFoundError} If stage does not exist
   */
  async getFile(stagePath: string, localPath: string, options?: GetFileOptions): Promise<void> {
    try {
      // Build GET command
      const sql = this.buildGetCommand(stagePath, localPath, options);

      // Execute GET command
      await this.executor.execute(sql);
    } catch (error) {
      if (error instanceof FileNotFoundError || error instanceof StageNotFoundError) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.toLowerCase().includes('file') && errorMessage.toLowerCase().includes('not found')) {
        throw new FileNotFoundError(stagePath);
      }
      if (errorMessage.toLowerCase().includes('stage') && errorMessage.toLowerCase().includes('not exist')) {
        throw new StageNotFoundError(stagePath);
      }

      throw wrapError(error, `Failed to download file from ${stagePath}`);
    }
  }

  /**
   * Removes a file from a Snowflake stage.
   *
   * @param stagePath - Stage file path (e.g., '@my_stage/file.csv')
   * @throws {FileNotFoundError} If file does not exist
   * @throws {StageNotFoundError} If stage does not exist
   */
  async removeFile(stagePath: string): Promise<void> {
    try {
      // Build REMOVE command
      const sql = `REMOVE ${stagePath}`;

      // Execute REMOVE command
      await this.executor.execute(sql);
    } catch (error) {
      if (error instanceof FileNotFoundError || error instanceof StageNotFoundError) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.toLowerCase().includes('file') && errorMessage.toLowerCase().includes('not found')) {
        throw new FileNotFoundError(stagePath);
      }
      if (errorMessage.toLowerCase().includes('stage') && errorMessage.toLowerCase().includes('not exist')) {
        throw new StageNotFoundError(stagePath);
      }

      throw wrapError(error, `Failed to remove file from ${stagePath}`);
    }
  }

  /**
   * Removes multiple files from a Snowflake stage using a pattern.
   *
   * @param stagePath - Stage path (e.g., '@my_stage/folder/')
   * @param pattern - File pattern
   * @throws {StageNotFoundError} If stage does not exist
   */
  async removeFiles(stagePath: string, pattern: string): Promise<void> {
    try {
      // Build REMOVE command with pattern
      const sql = `REMOVE ${stagePath} PATTERN = '${pattern}'`;

      // Execute REMOVE command
      await this.executor.execute(sql);
    } catch (error) {
      if (error instanceof StageNotFoundError) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.toLowerCase().includes('stage') && errorMessage.toLowerCase().includes('not exist')) {
        throw new StageNotFoundError(stagePath);
      }

      throw wrapError(error, `Failed to remove files from ${stagePath}`);
    }
  }

  /**
   * Checks if a file exists in a stage.
   *
   * @param stagePath - Stage file path
   * @returns True if file exists
   */
  async fileExists(stagePath: string): Promise<boolean> {
    try {
      const files = await this.listStage(stagePath);
      return files.length > 0;
    } catch (error) {
      if (error instanceof FileNotFoundError) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Gets the size of a file in a stage.
   *
   * @param stagePath - Stage file path
   * @returns File size in bytes
   * @throws {FileNotFoundError} If file does not exist
   */
  async getFileSize(stagePath: string): Promise<number> {
    const files = await this.listStage(stagePath);
    if (files.length === 0) {
      throw new FileNotFoundError(stagePath);
    }
    return files[0]!.size;
  }

  /**
   * Builds a PUT command.
   */
  private buildPutCommand(localPath: string, stagePath: string, options?: PutOptions): string {
    const parts = [`PUT 'file://${localPath}' ${stagePath}`];

    if (options?.autoCompress !== undefined) {
      parts.push(`AUTO_COMPRESS = ${options.autoCompress}`);
    }
    if (options?.sourceCompression !== undefined) {
      parts.push(`SOURCE_COMPRESSION = ${options.sourceCompression}`);
    }
    if (options?.parallel !== undefined) {
      parts.push(`PARALLEL = ${options.parallel}`);
    }
    if (options?.overwrite !== undefined) {
      parts.push(`OVERWRITE = ${options.overwrite}`);
    }

    return parts.join(' ');
  }

  /**
   * Builds a GET command.
   */
  private buildGetCommand(stagePath: string, localPath: string, options?: GetFileOptions): string {
    const parts = [`GET ${stagePath} 'file://${localPath}'`];

    if (options?.parallel !== undefined) {
      parts.push(`PARALLEL = ${options.parallel}`);
    }

    return parts.join(' ');
  }

  /**
   * Parses PUT command results.
   */
  private parsePutResults(result: QueryResult): PutResult[] {
    const results: PutResult[] = [];

    for (const row of result.resultSet.rows) {
      results.push({
        sourceFileName: row.getString('source') || '',
        targetFileName: row.getString('target') || '',
        sourceSize: row.getNumber('source_size') || 0,
        targetSize: row.getNumber('target_size') || 0,
        sourceCompression: row.getString('source_compression') || 'NONE',
        targetCompression: row.getString('target_compression') || 'NONE',
        status: (row.getString('status') as 'UPLOADED' | 'SKIPPED') || 'UPLOADED',
        message: row.getString('message') || undefined,
      });
    }

    return results;
  }

  /**
   * Parses LIST command results.
   */
  private parseListResults(result: QueryResult): StageFile[] {
    const files: StageFile[] = [];

    for (const row of result.resultSet.rows) {
      const name = row.getString('name');
      if (!name) continue;

      files.push({
        name,
        size: row.getNumber('size') || 0,
        md5: row.getString('md5') || undefined,
        lastModified: row.getDate('last_modified') || undefined,
      });
    }

    return files;
  }
}

/**
 * Creates a stage path.
 *
 * @param stageName - Stage name
 * @param path - Optional path within stage
 * @returns Formatted stage path
 */
export function createStagePath(stageName: string, path?: string): string {
  const stage = stageName.startsWith('@') ? stageName : `@${stageName}`;
  if (!path) {
    return stage;
  }
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `${stage}/${cleanPath}`;
}

/**
 * Parses a stage path into components.
 *
 * @param stagePath - Stage path (e.g., '@my_stage/folder/file.csv')
 * @returns Stage name and path
 */
export function parseStagePath(stagePath: string): { stage: string; path?: string } {
  const cleaned = stagePath.startsWith('@') ? stagePath.slice(1) : stagePath;
  const parts = cleaned.split('/');
  const stage = parts[0] || '';
  const path = parts.length > 1 ? parts.slice(1).join('/') : undefined;
  return { stage, path };
}

/**
 * Validates a stage path format.
 *
 * @param stagePath - Stage path to validate
 * @returns True if valid
 */
export function isValidStagePath(stagePath: string): boolean {
  if (!stagePath || stagePath.length === 0) {
    return false;
  }
  // Stage path should start with @ or be a valid identifier
  if (!stagePath.startsWith('@') && !/^[a-zA-Z_][a-zA-Z0-9_]*/.test(stagePath)) {
    return false;
  }
  return true;
}

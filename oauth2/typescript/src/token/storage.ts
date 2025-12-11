/**
 * Token Storage
 *
 * Pluggable token persistence interface and implementations.
 */

import { StoredTokens } from "../types";
import { StorageError } from "../error";
import * as fs from "fs/promises";
import * as path from "path";

/**
 * Token storage interface (for dependency injection).
 */
export interface TokenStorage {
  /**
   * Store tokens with key.
   */
  store(key: string, tokens: StoredTokens): Promise<void>;

  /**
   * Get tokens by key.
   */
  get(key: string): Promise<StoredTokens | null>;

  /**
   * Delete tokens by key.
   */
  delete(key: string): Promise<void>;

  /**
   * Check if tokens exist for key.
   */
  exists(key: string): Promise<boolean>;

  /**
   * List all stored keys.
   */
  listKeys(): Promise<string[]>;

  /**
   * Clear all stored tokens.
   */
  clear(): Promise<void>;
}

/**
 * In-memory token storage implementation.
 */
export class InMemoryTokenStorage implements TokenStorage {
  private tokens: Map<string, StoredTokens> = new Map();

  async store(key: string, tokens: StoredTokens): Promise<void> {
    this.tokens.set(key, tokens);
  }

  async get(key: string): Promise<StoredTokens | null> {
    return this.tokens.get(key) ?? null;
  }

  async delete(key: string): Promise<void> {
    this.tokens.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    return this.tokens.has(key);
  }

  async listKeys(): Promise<string[]> {
    return Array.from(this.tokens.keys());
  }

  async clear(): Promise<void> {
    this.tokens.clear();
  }
}

/**
 * Serializable token data for file storage.
 */
interface SerializedTokens {
  accessToken: string;
  tokenType: string;
  expiresAt?: string;
  refreshToken?: string;
  scopes: string[];
  idToken?: string;
  storedAt: string;
  metadata?: Record<string, string>;
}

/**
 * File-based token storage implementation.
 */
export class FileTokenStorage implements TokenStorage {
  private directory: string;
  private fileExtension: string = ".token.json";

  constructor(directory: string) {
    this.directory = directory;
  }

  async store(key: string, tokens: StoredTokens): Promise<void> {
    await this.ensureDirectory();

    const serialized: SerializedTokens = {
      accessToken: tokens.accessToken.expose(),
      tokenType: tokens.tokenType,
      expiresAt: tokens.expiresAt?.toISOString(),
      refreshToken: tokens.refreshToken?.expose(),
      scopes: tokens.scopes,
      idToken: tokens.idToken?.expose(),
      storedAt: tokens.storedAt.toISOString(),
      metadata: tokens.metadata,
    };

    const filePath = this.getFilePath(key);
    try {
      await fs.writeFile(filePath, JSON.stringify(serialized, null, 2));
    } catch (error) {
      throw new StorageError(
        `Failed to write token file: ${error}`,
        "WriteFailed"
      );
    }
  }

  async get(key: string): Promise<StoredTokens | null> {
    const filePath = this.getFilePath(key);

    try {
      const content = await fs.readFile(filePath, "utf-8");
      const serialized: SerializedTokens = JSON.parse(content);

      // Import SecretString dynamically to avoid circular dependency
      const { SecretString } = await import("../types/token");

      return {
        accessToken: new SecretString(serialized.accessToken),
        tokenType: serialized.tokenType,
        expiresAt: serialized.expiresAt
          ? new Date(serialized.expiresAt)
          : undefined,
        refreshToken: serialized.refreshToken
          ? new SecretString(serialized.refreshToken)
          : undefined,
        scopes: serialized.scopes,
        idToken: serialized.idToken
          ? new SecretString(serialized.idToken)
          : undefined,
        storedAt: new Date(serialized.storedAt),
        metadata: serialized.metadata,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw new StorageError(
        `Failed to read token file: ${error}`,
        "ReadFailed"
      );
    }
  }

  async delete(key: string): Promise<void> {
    const filePath = this.getFilePath(key);
    try {
      await fs.unlink(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw new StorageError(
          `Failed to delete token file: ${error}`,
          "DeleteFailed"
        );
      }
    }
  }

  async exists(key: string): Promise<boolean> {
    const filePath = this.getFilePath(key);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async listKeys(): Promise<string[]> {
    try {
      await this.ensureDirectory();
      const files = await fs.readdir(this.directory);
      return files
        .filter((f) => f.endsWith(this.fileExtension))
        .map((f) => f.slice(0, -this.fileExtension.length));
    } catch {
      return [];
    }
  }

  async clear(): Promise<void> {
    const keys = await this.listKeys();
    await Promise.all(keys.map((key) => this.delete(key)));
  }

  private getFilePath(key: string): string {
    // Sanitize key for filesystem
    const sanitizedKey = this.sanitizeKey(key);
    return path.join(this.directory, sanitizedKey + this.fileExtension);
  }

  private sanitizeKey(key: string): string {
    return key
      .replace(/[/\\:*?"<>|]/g, "_")
      .slice(0, 200);
  }

  private async ensureDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.directory, { recursive: true });
    } catch (error) {
      throw new StorageError(
        `Failed to create token directory: ${error}`,
        "WriteFailed"
      );
    }
  }
}

/**
 * Mock token storage for testing.
 */
export class MockTokenStorage implements TokenStorage {
  private tokens: Map<string, StoredTokens> = new Map();
  private storeHistory: Array<{ key: string; tokens: StoredTokens }> = [];
  private getHistory: string[] = [];
  private deleteHistory: string[] = [];
  private nextError?: StorageError;

  /**
   * Set the next error to throw.
   */
  setNextError(error: StorageError): this {
    this.nextError = error;
    return this;
  }

  /**
   * Pre-populate tokens.
   */
  setTokens(key: string, tokens: StoredTokens): this {
    this.tokens.set(key, tokens);
    return this;
  }

  /**
   * Get store history.
   */
  getStoreHistory(): Array<{ key: string; tokens: StoredTokens }> {
    return [...this.storeHistory];
  }

  /**
   * Get get history.
   */
  getGetHistory(): string[] {
    return [...this.getHistory];
  }

  /**
   * Get delete history.
   */
  getDeleteHistory(): string[] {
    return [...this.deleteHistory];
  }

  /**
   * Assert tokens were stored.
   */
  assertStored(key: string): void {
    const stored = this.storeHistory.find((h) => h.key === key);
    if (!stored) {
      throw new Error(`Expected tokens to be stored for key: ${key}`);
    }
  }

  async store(key: string, tokens: StoredTokens): Promise<void> {
    if (this.nextError) {
      const error = this.nextError;
      this.nextError = undefined;
      throw error;
    }
    this.storeHistory.push({ key, tokens });
    this.tokens.set(key, tokens);
  }

  async get(key: string): Promise<StoredTokens | null> {
    this.getHistory.push(key);
    if (this.nextError) {
      const error = this.nextError;
      this.nextError = undefined;
      throw error;
    }
    return this.tokens.get(key) ?? null;
  }

  async delete(key: string): Promise<void> {
    this.deleteHistory.push(key);
    if (this.nextError) {
      const error = this.nextError;
      this.nextError = undefined;
      throw error;
    }
    this.tokens.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    return this.tokens.has(key);
  }

  async listKeys(): Promise<string[]> {
    return Array.from(this.tokens.keys());
  }

  async clear(): Promise<void> {
    this.tokens.clear();
  }
}

/**
 * Create in-memory token storage.
 */
export function createInMemoryStorage(): TokenStorage {
  return new InMemoryTokenStorage();
}

/**
 * Create file-based token storage.
 */
export function createFileStorage(directory: string): TokenStorage {
  return new FileTokenStorage(directory);
}

/**
 * Create mock token storage for testing.
 */
export function createMockTokenStorage(): MockTokenStorage {
  return new MockTokenStorage();
}

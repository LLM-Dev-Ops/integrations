/**
 * Azure Blob Storage Simulation Storage
 *
 * Handles loading, saving, and matching of recorded HTTP interactions.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import type {
  SimulationFile,
  RecordedInteraction,
  SerializedRequest,
  MatchingMode,
} from './types.js';
import { SimulationLoadError, SimulationNoMatchError } from '../errors/index.js';

/**
 * Current simulation file format version
 */
const SIMULATION_VERSION = '1.0';

/**
 * Manages storage of recorded interactions
 */
export class SimulationStorage {
  private interactions: RecordedInteraction[] = [];
  private matchingMode: MatchingMode;
  private usedInteractions: Set<number> = new Set();

  /**
   * Create a new simulation storage instance
   *
   * @param matchingMode - How to match recorded interactions (default: 'operation')
   */
  constructor(matchingMode: MatchingMode = 'operation') {
    this.matchingMode = matchingMode;
  }

  /**
   * Load recordings from a JSON file
   *
   * @param path - Path to the simulation file
   * @throws {SimulationLoadError} If the file cannot be loaded or parsed
   */
  async load(path: string): Promise<void> {
    try {
      const content = await readFile(path, 'utf-8');
      const file: SimulationFile = JSON.parse(content);

      // Validate file format
      if (!file.version || !Array.isArray(file.interactions)) {
        throw new SimulationLoadError({
          message: `Invalid simulation file format at ${path}`,
          path,
        });
      }

      // Version compatibility check (currently we only support 1.0)
      if (file.version !== SIMULATION_VERSION) {
        console.warn(
          `Simulation file version ${file.version} may not be compatible with current version ${SIMULATION_VERSION}`
        );
      }

      this.interactions = file.interactions;
      this.usedInteractions.clear();
    } catch (error) {
      if (error instanceof SimulationLoadError) {
        throw error;
      }
      throw new SimulationLoadError({
        message: `Failed to load simulation file: ${(error as Error).message}`,
        path,
        cause: error as Error,
      });
    }
  }

  /**
   * Save recordings to a JSON file
   *
   * @param path - Path where to save the simulation file
   * @param interactions - Interactions to save
   * @throws {SimulationLoadError} If the file cannot be written
   */
  async save(path: string, interactions: RecordedInteraction[]): Promise<void> {
    try {
      const file: SimulationFile = {
        version: SIMULATION_VERSION,
        created: new Date().toISOString(),
        interactions,
      };

      const content = JSON.stringify(file, null, 2);
      await writeFile(path, content, 'utf-8');
    } catch (error) {
      throw new SimulationLoadError({
        message: `Failed to save simulation file: ${(error as Error).message}`,
        path,
        cause: error as Error,
      });
    }
  }

  /**
   * Find a matching recorded interaction for a request
   *
   * @param request - Request to match
   * @param operation - Operation name
   * @returns Matching recorded interaction
   * @throws {SimulationNoMatchError} If no matching interaction is found
   */
  findMatch(request: SerializedRequest, operation: string): RecordedInteraction {
    const matchKey = this.generateMatchKey(request, operation);

    // Find first unused interaction that matches
    for (let i = 0; i < this.interactions.length; i++) {
      if (this.usedInteractions.has(i)) {
        continue;
      }

      const interaction = this.interactions[i];
      if (!interaction) {
        continue;
      }

      if (this.matches(request, operation, interaction)) {
        this.usedInteractions.add(i);
        return interaction;
      }
    }

    // No match found
    throw new SimulationNoMatchError({
      message: `No recorded interaction found for ${operation} (${request.method} ${request.url})`,
      operation,
      matchKey,
    });
  }

  /**
   * Check if a request matches a recorded interaction
   *
   * @param request - Request to match
   * @param operation - Operation name
   * @param interaction - Recorded interaction to check against
   * @returns True if the request matches the interaction
   */
  private matches(
    request: SerializedRequest,
    operation: string,
    interaction: RecordedInteraction
  ): boolean {
    switch (this.matchingMode) {
      case 'exact':
        return this.exactMatch(request, interaction);

      case 'operation':
        return this.operationMatch(request, operation, interaction);

      case 'relaxed':
        return this.relaxedMatch(request, operation, interaction);

      default:
        return false;
    }
  }

  /**
   * Exact matching: method, URL, and headers must match exactly
   */
  private exactMatch(request: SerializedRequest, interaction: RecordedInteraction): boolean {
    return (
      request.method === interaction.request.method &&
      request.url === interaction.request.url &&
      this.headersMatch(request.headers, interaction.request.headers)
    );
  }

  /**
   * Operation matching: operation name and method must match, URL path must match
   */
  private operationMatch(
    request: SerializedRequest,
    operation: string,
    interaction: RecordedInteraction
  ): boolean {
    if (operation !== interaction.operation) {
      return false;
    }

    if (request.method !== interaction.request.method) {
      return false;
    }

    // Match URL paths (ignore query parameters)
    const requestPath = this.extractPath(request.url);
    const interactionPath = this.extractPath(interaction.request.url);

    return requestPath === interactionPath;
  }

  /**
   * Relaxed matching: only operation name needs to match
   */
  private relaxedMatch(
    _request: SerializedRequest,
    operation: string,
    interaction: RecordedInteraction
  ): boolean {
    return operation === interaction.operation;
  }

  /**
   * Check if headers match (case-insensitive, ignoring certain headers)
   */
  private headersMatch(
    headers1: Record<string, string>,
    headers2: Record<string, string>
  ): boolean {
    const ignored = new Set(['authorization', 'date', 'x-ms-date', 'x-ms-client-request-id']);

    const normalize = (headers: Record<string, string>): Record<string, string> => {
      const result: Record<string, string> = {};
      for (const [key, value] of Object.entries(headers)) {
        const lowerKey = key.toLowerCase();
        if (!ignored.has(lowerKey)) {
          result[lowerKey] = value;
        }
      }
      return result;
    };

    const norm1 = normalize(headers1);
    const norm2 = normalize(headers2);

    const keys1 = Object.keys(norm1).sort();
    const keys2 = Object.keys(norm2).sort();

    if (keys1.length !== keys2.length) {
      return false;
    }

    for (let i = 0; i < keys1.length; i++) {
      const key = keys1[i];
      const key2 = keys2[i];
      if (!key || !key2 || key !== key2 || norm1[key] !== norm2[key2]) {
        return false;
      }
    }

    return true;
  }

  /**
   * Extract path from URL (without query parameters)
   */
  private extractPath(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.pathname;
    } catch {
      // If URL parsing fails, return the original URL
      const queryIndex = url.indexOf('?');
      return queryIndex >= 0 ? url.substring(0, queryIndex) : url;
    }
  }

  /**
   * Generate a matching key from request and operation
   *
   * @param request - Request to generate key from
   * @param operation - Operation name
   * @returns Match key string
   */
  generateMatchKey(request: SerializedRequest, operation: string): string {
    const parts = [operation, request.method, this.extractPath(request.url)];

    if (request.bodyHash) {
      parts.push(request.bodyHash);
    }

    return parts.join(':');
  }

  /**
   * Hash request body for matching
   *
   * @param body - Request body
   * @returns SHA-256 hash of the body
   */
  static hashBody(body: string | Uint8Array | ArrayBuffer): string {
    const hash = createHash('sha256');

    if (typeof body === 'string') {
      hash.update(body);
    } else if (body instanceof ArrayBuffer) {
      hash.update(new Uint8Array(body));
    } else {
      hash.update(body);
    }

    return hash.digest('hex');
  }

  /**
   * Get all recorded interactions
   */
  getInteractions(): RecordedInteraction[] {
    return [...this.interactions];
  }

  /**
   * Reset used interactions tracker
   */
  reset(): void {
    this.usedInteractions.clear();
  }

  /**
   * Get count of interactions
   */
  getCount(): number {
    return this.interactions.length;
  }
}

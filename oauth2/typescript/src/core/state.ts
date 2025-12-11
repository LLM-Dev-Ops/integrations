/**
 * State Manager
 *
 * CSRF protection via state parameter management.
 */

import * as crypto from "crypto";
import { AuthorizationError } from "../error";
import { StateMetadata } from "../types";

/**
 * State manager interface (for dependency injection).
 */
export interface StateManager {
  /**
   * Generate a new state with metadata.
   */
  generate(metadata: Omit<StateMetadata, "createdAt" | "expiresAt">): string;

  /**
   * Validate and consume a state.
   */
  consume(state: string): StateMetadata | null;

  /**
   * Check if state exists (without consuming).
   */
  exists(state: string): boolean;

  /**
   * Clean up expired states.
   */
  cleanup(): void;
}

/**
 * In-memory state manager implementation.
 */
export class InMemoryStateManager implements StateManager {
  private states: Map<string, StateMetadata> = new Map();
  private stateExpiration: number;
  private entropyBytes: number;

  constructor(options?: { expirationSeconds?: number; entropyBytes?: number }) {
    this.stateExpiration = (options?.expirationSeconds ?? 600) * 1000;
    this.entropyBytes = options?.entropyBytes ?? 16; // 128 bits minimum
  }

  generate(metadata: Omit<StateMetadata, "createdAt" | "expiresAt">): string {
    const state = this.generateSecureState();
    const now = new Date();

    const fullMetadata: StateMetadata = {
      ...metadata,
      createdAt: now,
      expiresAt: new Date(now.getTime() + this.stateExpiration),
    };

    this.states.set(state, fullMetadata);
    return state;
  }

  consume(state: string): StateMetadata | null {
    const metadata = this.states.get(state);
    if (!metadata) {
      return null;
    }

    // Remove state (one-time use)
    this.states.delete(state);

    // Check expiration
    if (new Date() > metadata.expiresAt) {
      return null;
    }

    return metadata;
  }

  exists(state: string): boolean {
    const metadata = this.states.get(state);
    if (!metadata) {
      return false;
    }
    return new Date() <= metadata.expiresAt;
  }

  cleanup(): void {
    const now = new Date();
    for (const [state, metadata] of this.states) {
      if (now > metadata.expiresAt) {
        this.states.delete(state);
      }
    }
  }

  private generateSecureState(): string {
    const bytes = crypto.randomBytes(this.entropyBytes);
    return bytes.toString("base64url");
  }
}

/**
 * Mock state manager for testing.
 */
export class MockStateManager implements StateManager {
  private states: Map<string, StateMetadata> = new Map();
  private generateHistory: StateMetadata[] = [];
  private consumeHistory: string[] = [];
  private nextState?: string;

  /**
   * Set the next state to generate.
   */
  setNextState(state: string): this {
    this.nextState = state;
    return this;
  }

  /**
   * Pre-populate a state.
   */
  setState(state: string, metadata: StateMetadata): this {
    this.states.set(state, metadata);
    return this;
  }

  /**
   * Get generate history.
   */
  getGenerateHistory(): StateMetadata[] {
    return [...this.generateHistory];
  }

  /**
   * Get consume history.
   */
  getConsumeHistory(): string[] {
    return [...this.consumeHistory];
  }

  generate(metadata: Omit<StateMetadata, "createdAt" | "expiresAt">): string {
    const state = this.nextState ?? `mock-state-${Date.now()}`;
    this.nextState = undefined;

    const now = new Date();
    const fullMetadata: StateMetadata = {
      ...metadata,
      createdAt: now,
      expiresAt: new Date(now.getTime() + 600000),
    };

    this.states.set(state, fullMetadata);
    this.generateHistory.push(fullMetadata);
    return state;
  }

  consume(state: string): StateMetadata | null {
    this.consumeHistory.push(state);
    const metadata = this.states.get(state);
    if (metadata) {
      this.states.delete(state);
    }
    return metadata ?? null;
  }

  exists(state: string): boolean {
    return this.states.has(state);
  }

  cleanup(): void {
    // No-op for mock
  }
}

/**
 * Validate state using constant-time comparison.
 */
export function validateState(
  received: string,
  expected: string
): boolean {
  if (received.length !== expected.length) {
    // Still do comparison to avoid timing attack
    crypto.timingSafeEqual(
      Buffer.from(received),
      Buffer.from(received)
    );
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(received),
    Buffer.from(expected)
  );
}

/**
 * Create production state manager.
 */
export function createStateManager(
  expirationSeconds?: number
): StateManager {
  return new InMemoryStateManager({ expirationSeconds });
}

/**
 * Create mock state manager for testing.
 */
export function createMockStateManager(): MockStateManager {
  return new MockStateManager();
}

/**
 * Simulation Layer for Azure AD OAuth2.
 *
 * Handles recording and replay of authentication interactions for CI/CD testing.
 */

import type { SimulationMode } from '../config.js';
import type { AccessToken, TokenResponse } from '../types/index.js';
import type {
  RecordedAuthInteraction,
  SerializedTokenRequest,
  SerializedTokenResponse,
  MockTokenTemplate,
} from './types.js';
import { SimulationStorage } from './storage.js';
import { simulationNoMatch } from '../error.js';
import { randomUUID } from 'crypto';

/**
 * Simulation layer for recording and replaying auth interactions.
 */
export class SimulationLayer {
  private mode: SimulationMode;
  private storage: SimulationStorage;
  private recordings: RecordedAuthInteraction[] = [];

  constructor(mode: SimulationMode) {
    this.mode = mode;
    this.storage = new SimulationStorage();
  }

  /**
   * Check if in recording mode.
   */
  isRecording(): boolean {
    return this.mode.type === 'recording';
  }

  /**
   * Check if in replay mode.
   */
  isReplay(): boolean {
    return this.mode.type === 'replay';
  }

  /**
   * Check if simulation is disabled.
   */
  isDisabled(): boolean {
    return this.mode.type === 'disabled';
  }

  /**
   * Initialize the simulation layer.
   */
  async initialize(): Promise<void> {
    if (this.mode.type === 'replay') {
      await this.storage.load(this.mode.path);
    }
  }

  /**
   * Record a token request and response.
   */
  async recordTokenRequest(
    flowType: string,
    request: SerializedTokenRequest,
    response: TokenResponse,
    durationMs: number
  ): Promise<void> {
    if (!this.isRecording()) {
      return;
    }

    const serializedResponse: SerializedTokenResponse = {
      accessToken: '[REDACTED]',  // Don't store real tokens
      tokenType: response.accessToken.tokenType,
      expiresIn: response.expiresIn,
      refreshToken: response.refreshToken ? '[REDACTED]' : undefined,
      idToken: response.idToken ? '[REDACTED]' : undefined,
      scopes: response.accessToken.scopes.join(' '),
    };

    const mockToken: MockTokenTemplate = {
      accessToken: 'mock_token_template',
      claims: {
        sub: 'mock-subject-id',
        aud: request.clientId,
        iss: 'https://login.microsoftonline.com/mock-tenant/v2.0',
      },
      expiresIn: response.expiresIn,
      scopes: response.accessToken.scopes,
    };

    const interaction: RecordedAuthInteraction = {
      timestamp: new Date().toISOString(),
      flowType,
      request,
      response: serializedResponse,
      mockToken,
      durationMs,
    };

    this.recordings.push(interaction);
    this.storage.add(interaction);
  }

  /**
   * Replay a token request.
   */
  async replayTokenRequest(request: SerializedTokenRequest): Promise<AccessToken> {
    if (!this.isReplay()) {
      throw new Error('Cannot replay in non-replay mode');
    }

    const recording = this.storage.find(request);
    if (!recording) {
      const key = `${request.grantType}:${request.clientId}:${request.scopes}`;
      throw simulationNoMatch(key);
    }

    // Generate fresh mock token
    return this.generateMockToken(recording.mockToken);
  }

  /**
   * Generate a mock token with fresh timestamps.
   */
  private generateMockToken(template: MockTokenTemplate): AccessToken {
    const now = Date.now();

    return {
      token: `mock_token_${randomUUID()}`,
      tokenType: 'Bearer',
      expiresOn: new Date(now + template.expiresIn * 1000),
      scopes: template.scopes,
      tenantId: 'mock-tenant-id',
    };
  }

  /**
   * Save recordings to file.
   */
  async save(): Promise<void> {
    if (this.mode.type === 'recording') {
      await this.storage.save(this.mode.path);
    }
  }

  /**
   * Get recording count.
   */
  getRecordingCount(): number {
    return this.isRecording() ? this.recordings.length : this.storage.getCount();
  }

  /**
   * Reset the simulation layer.
   */
  reset(): void {
    this.recordings = [];
    this.storage.reset();
  }
}

/**
 * Create a simulation layer.
 */
export function createSimulationLayer(mode: SimulationMode): SimulationLayer {
  return new SimulationLayer(mode);
}

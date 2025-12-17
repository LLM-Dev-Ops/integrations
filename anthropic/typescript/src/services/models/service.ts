import type { HttpTransport, RequestOptions } from '../../transport/http-transport.js';
import type { AuthManager } from '../../auth/auth-manager.js';
import type { ResilienceOrchestrator } from '../../resilience/orchestrator.js';
import type { ModelInfo, ModelListResponse } from './types.js';
import {
  startTelemetryContext,
  emitRequestComplete,
  emitError,
} from '../../observability/telemetry.js';

export interface ModelsService {
  list(options?: RequestOptions): Promise<ModelListResponse>;
  retrieve(modelId: string, options?: RequestOptions): Promise<ModelInfo>;
}

export class ModelsServiceImpl implements ModelsService {
  constructor(
    private readonly transport: HttpTransport,
    private readonly authManager: AuthManager,
    private readonly resilience: ResilienceOrchestrator,
  ) {}

  async list(options?: RequestOptions): Promise<ModelListResponse> {
    // Start telemetry context
    const telemetryContext = startTelemetryContext({
      operation: 'models.list',
    });

    try {
      const result = await this.resilience.execute(async () => {
        const headers = this.authManager.getHeaders();
        return this.transport.request<ModelListResponse>(
          'GET',
          '/v1/models',
          undefined,
          {
            ...options,
            headers: {
              ...headers,
              ...options?.headers,
            },
          }
        );
      });

      // Emit completion event with model count
      emitRequestComplete(telemetryContext, {
        modelCount: result.data?.length,
        hasMore: result.has_more,
      });

      return result;
    } catch (error) {
      // Emit error event
      emitError(telemetryContext, error);
      throw error;
    }
  }

  async retrieve(modelId: string, options?: RequestOptions): Promise<ModelInfo> {
    if (!modelId || typeof modelId !== 'string' || modelId.trim() === '') {
      throw new Error('Model ID is required and must be a non-empty string');
    }

    // Start telemetry context
    const telemetryContext = startTelemetryContext({
      operation: 'models.retrieve',
      model: modelId,
      provider: modelId,
    });

    try {
      const result = await this.resilience.execute(async () => {
        const headers = this.authManager.getHeaders();
        return this.transport.request<ModelInfo>(
          'GET',
          `/v1/models/${modelId}`,
          undefined,
          {
            ...options,
            headers: {
              ...headers,
              ...options?.headers,
            },
          }
        );
      });

      // Emit completion event
      emitRequestComplete(telemetryContext, {
        modelId: result.id,
        modelType: result.type,
      });

      return result;
    } catch (error) {
      // Emit error event
      emitError(telemetryContext, error);
      throw error;
    }
  }
}

export function createModelsService(
  transport: HttpTransport,
  authManager: AuthManager,
  resilience: ResilienceOrchestrator
): ModelsService {
  return new ModelsServiceImpl(transport, authManager, resilience);
}

import type { ResilienceOrchestrator } from '../../resilience/orchestrator.js';
import type { RequestOptions } from '../../types/common.js';
import type { ModerationRequest, ModerationResponse } from './types.js';
import { ModerationsValidator } from './validation.js';

export interface ModerationsService {
  create(request: ModerationRequest, options?: RequestOptions): Promise<ModerationResponse>;
}

export class ModerationsServiceImpl implements ModerationsService {
  constructor(private readonly orchestrator: ResilienceOrchestrator) {}

  async create(request: ModerationRequest, options?: RequestOptions): Promise<ModerationResponse> {
    ModerationsValidator.validate(request);

    return this.orchestrator.request({
      method: 'POST',
      path: '/v1/moderations',
      body: request,
      ...options,
    });
  }
}

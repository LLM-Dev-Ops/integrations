import type { OllamaConfig } from '../../config/types.js';
import type { SimulationLayer } from '../../simulation/layer.js';
import type { ModelList, ModelInfo, RunningModelList } from '../../types/models.js';

export interface ModelsServiceDeps {
  config: OllamaConfig;
  simulation: SimulationLayer;
}

export class ModelsService {
  private readonly simulation: SimulationLayer;

  constructor(deps: ModelsServiceDeps) {
    this.simulation = deps.simulation;
  }

  /**
   * List all locally available models
   * GET /api/tags
   */
  async list(): Promise<ModelList> {
    const response = await this.simulation.execute('list_models', {}, async (transport) => {
      return transport.get('/api/tags');
    });
    return response.body as ModelList;
  }

  /**
   * Show model details
   * POST /api/show
   */
  async show(name: string): Promise<ModelInfo> {
    const response = await this.simulation.execute('show_model', { name }, async (transport) => {
      return transport.post('/api/show', { name });
    });
    return response.body as ModelInfo;
  }

  /**
   * List running models (loaded in memory)
   * GET /api/ps
   */
  async running(): Promise<RunningModelList> {
    const response = await this.simulation.execute('running_models', {}, async (transport) => {
      return transport.get('/api/ps');
    });
    return response.body as RunningModelList;
  }

  /**
   * Check if model is available locally
   */
  async isAvailable(name: string): Promise<boolean> {
    const models = await this.list();
    return models.models.some(m => m.name === name || m.model === name);
  }

  /**
   * Delete a local model
   * DELETE /api/delete
   */
  async delete(name: string): Promise<void> {
    await this.simulation.execute('delete_model', { name }, async (transport) => {
      return transport.post('/api/delete', { name });
    });
  }
}

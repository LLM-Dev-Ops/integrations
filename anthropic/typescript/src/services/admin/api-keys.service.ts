import { HttpTransport } from '../../transport/index.js';
import { AuthManager } from '../../auth/index.js';
import { ResilienceOrchestrator } from '../../resilience/index.js';
import {
  ApiKey,
  ApiKeyWithSecret,
  CreateApiKeyRequest,
  UpdateApiKeyRequest,
  ListParams,
  ListResponse,
} from './types.js';

export interface ApiKeysService {
  list(params?: ListParams): Promise<ListResponse<ApiKey>>;
  get(apiKeyId: string): Promise<ApiKey>;
  create(request: CreateApiKeyRequest): Promise<ApiKeyWithSecret>;
  update(apiKeyId: string, request: UpdateApiKeyRequest): Promise<ApiKey>;
}

export class ApiKeysServiceImpl implements ApiKeysService {
  constructor(
    private transport: HttpTransport,
    private authManager: AuthManager,
    private resilience: ResilienceOrchestrator,
  ) {}

  async list(params?: ListParams): Promise<ListResponse<ApiKey>> {
    const headers = this.authManager.getHeaders();
    const queryParams = this.buildQueryParams(params);
    const endpoint = `/v1/api_keys${queryParams}`;

    return this.resilience.execute(() =>
      this.transport.request('GET', endpoint, undefined, headers)
    );
  }

  async get(apiKeyId: string): Promise<ApiKey> {
    const headers = this.authManager.getHeaders();
    return this.resilience.execute(() =>
      this.transport.request('GET', `/v1/api_keys/${apiKeyId}`, undefined, headers)
    );
  }

  async create(request: CreateApiKeyRequest): Promise<ApiKeyWithSecret> {
    const headers = this.authManager.getHeaders();
    return this.resilience.execute(() =>
      this.transport.request('POST', '/v1/api_keys', request, headers)
    );
  }

  async update(apiKeyId: string, request: UpdateApiKeyRequest): Promise<ApiKey> {
    const headers = this.authManager.getHeaders();
    return this.resilience.execute(() =>
      this.transport.request('POST', `/v1/api_keys/${apiKeyId}`, request, headers)
    );
  }

  private buildQueryParams(params?: ListParams): string {
    if (!params) {
      return '';
    }

    const queryParts: string[] = [];
    if (params.before_id) {
      queryParts.push(`before_id=${encodeURIComponent(params.before_id)}`);
    }
    if (params.after_id) {
      queryParts.push(`after_id=${encodeURIComponent(params.after_id)}`);
    }
    if (params.limit !== undefined) {
      queryParts.push(`limit=${params.limit}`);
    }

    return queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
  }
}

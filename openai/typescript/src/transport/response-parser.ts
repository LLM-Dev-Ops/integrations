import type { HttpResponse } from '../types/common.js';
import { ErrorMapper } from '../errors/mapping.js';

export class ResponseParser {
  static parse<T>(response: HttpResponse<unknown>): T {
    if (response.status >= 200 && response.status < 300) {
      return response.data as T;
    }

    throw ErrorMapper.fromResponse(response);
  }

  static parseList<T>(response: HttpResponse<unknown>): T[] {
    const data = this.parse<{ data: T[] }>(response);
    return data.data;
  }

  static async parseAsync<T>(responsePromise: Promise<HttpResponse<unknown>>): Promise<T> {
    try {
      const response = await responsePromise;
      return this.parse<T>(response);
    } catch (error) {
      if (error instanceof Error && 'statusCode' in error) {
        throw error;
      }
      throw ErrorMapper.fromNetworkError(error as Error);
    }
  }
}

import { QueryParams, TelemetryEvent } from './types.js';

export const MAX_BATCH_SIZE = 100;
export const MAX_BODY_BYTES = 64 * 1024;
const MAX_METADATA_BYTES = 16 * 1024;
const CONTROL_CHAR = /[\u0000-\u001f\u007f]/u;

export class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireText(value: unknown, name: string, maxLength: number): string {
  if (typeof value !== 'string' || value.trim().length === 0 ||
      value.length > maxLength || CONTROL_CHAR.test(value)) {
    throw new HttpError(400, `${name} must be a non-empty string of at most ${maxLength} characters without control characters`);
  }
  return value;
}

function optionalText(value: unknown, name: string, maxLength: number): string | undefined {
  return value === undefined ? undefined : requireText(value, name, maxLength);
}

export function validateEvent(value: unknown): TelemetryEvent {
  if (!isRecord(value)) throw new HttpError(400, 'event must be a JSON object');
  if (!Number.isSafeInteger(value.timestamp) || (value.timestamp as number) < 0) {
    throw new HttpError(400, 'timestamp must be a non-negative safe integer');
  }
  if (value.metadata !== undefined) {
    if (!isRecord(value.metadata)) throw new HttpError(400, 'metadata must be a JSON object');
    let encoded: string;
    try {
      encoded = JSON.stringify(value.metadata);
    } catch {
      throw new HttpError(400, 'metadata must be JSON serializable');
    }
    if (Buffer.byteLength(encoded, 'utf8') > MAX_METADATA_BYTES) {
      throw new HttpError(400, `metadata exceeds ${MAX_METADATA_BYTES} bytes`);
    }
  }
  return {
    correlationId: requireText(value.correlationId, 'correlationId', 255),
    integration: requireText(value.integration, 'integration', 100),
    provider: optionalText(value.provider, 'provider', 100),
    eventType: requireText(value.eventType, 'eventType', 100),
    timestamp: value.timestamp as number,
    metadata: value.metadata,
    traceId: optionalText(value.traceId, 'traceId', 64),
    spanId: optionalText(value.spanId, 'spanId', 32),
  };
}

export function validatePayload(value: unknown): TelemetryEvent[] {
  const items = Array.isArray(value) ? value : [value];
  if (items.length === 0) throw new HttpError(400, 'event batch must not be empty');
  if (items.length > MAX_BATCH_SIZE) {
    throw new HttpError(400, `event batch exceeds ${MAX_BATCH_SIZE} items`);
  }
  return items.map(validateEvent);
}

function parseInteger(value: string, name: string, min: number, max: number): number {
  if (!/^(0|[1-9]\d*)$/.test(value)) throw new HttpError(400, `${name} must be an integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new HttpError(400, `${name} must be between ${min} and ${max}`);
  }
  return parsed;
}

export function parseQueryParams(target: string): QueryParams {
  const url = new URL(target, 'http://service.invalid');
  const params: QueryParams = {};
  const selectors = [['integration', 100], ['correlationId', 255], ['eventType', 100]] as const;
  for (const [name, max] of selectors) {
    const value = url.searchParams.get(name);
    if (value !== null) params[name] = requireText(value, name, max);
  }
  const numbers = [['from', 0, Number.MAX_SAFE_INTEGER], ['to', 0, Number.MAX_SAFE_INTEGER],
    ['limit', 1, 1000], ['offset', 0, 1_000_000]] as const;
  for (const [name, min, max] of numbers) {
    const value = url.searchParams.get(name);
    if (value !== null) params[name] = parseInteger(value, name, min, max);
  }
  if (params.from !== undefined && params.to !== undefined && params.from > params.to) {
    throw new HttpError(400, 'from must be less than or equal to to');
  }
  return params;
}

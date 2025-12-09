import type { HttpTransport, HttpRequest } from './http-transport.js';

export interface StreamHandler<T> {
  handle(request: HttpRequest): AsyncIterable<T>;
}

export interface StreamAccumulator<TChunk, TComplete> {
  process(chunk: TChunk): void;
  getAccumulated(): Partial<TComplete>;
  isComplete(): boolean;
}

export async function collectStream<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of stream) {
    items.push(item);
  }
  return items;
}

export async function* transformStream<TIn, TOut>(
  stream: AsyncIterable<TIn>,
  transform: (chunk: TIn) => TOut
): AsyncIterable<TOut> {
  for await (const chunk of stream) {
    yield transform(chunk);
  }
}

export class StreamReader<T> {
  private buffer: T[] = [];
  private done = false;
  private iterator: AsyncIterator<T>;

  constructor(stream: AsyncIterable<T>) {
    this.iterator = stream[Symbol.asyncIterator]();
  }

  async read(): Promise<{ value: T; done: false } | { value: undefined; done: true }> {
    if (this.buffer.length > 0) {
      return { value: this.buffer.shift()!, done: false };
    }
    const result = await this.iterator.next();
    if (result.done) {
      this.done = true;
      return { value: undefined, done: true };
    }
    return { value: result.value, done: false };
  }

  isDone(): boolean {
    return this.done;
  }
}

export class SSEStreamHandler<T> implements StreamHandler<T> {
  constructor(private readonly transport: HttpTransport) {}

  async *handle(request: HttpRequest): AsyncIterable<T> {
    try {
      for await (const chunk of this.transport.stream<T>(request)) {
        yield chunk;
      }
    } catch (error) {
      throw error;
    }
  }
}

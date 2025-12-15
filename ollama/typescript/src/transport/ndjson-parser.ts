/**
 * NDJSON Stream Parser
 *
 * Parses newline-delimited JSON (NDJSON) streams from Ollama API.
 * Based on SPARC specification Section 6.1.
 */

/**
 * Parser for newline-delimited JSON streams
 *
 * Handles:
 * - Buffering of partial lines
 * - UTF-8 decoding
 * - JSON parsing of complete lines
 * - Skipping empty lines
 *
 * @template T - Type of parsed JSON objects
 */
export class NdjsonParser<T> {
  private buffer: string = '';
  private decoder = new TextDecoder('utf-8');

  /**
   * Parse NDJSON stream
   *
   * Async generator that yields parsed objects from the stream.
   * Buffers incomplete lines until a newline is received.
   *
   * @param stream - Async iterable of raw bytes
   * @yields Parsed JSON objects of type T
   */
  async *parse(stream: AsyncIterable<Uint8Array>): AsyncGenerator<T, void, unknown> {
    try {
      // Process each chunk from the stream
      for await (const chunk of stream) {
        // Decode bytes to string using UTF-8
        const text = this.decoder.decode(chunk, { stream: true });

        // Add to buffer
        this.buffer += text;

        // Process all complete lines in buffer
        yield* this.processBuffer(false);
      }

      // Flush decoder and process any remaining data
      const finalText = this.decoder.decode();
      if (finalText) {
        this.buffer += finalText;
      }

      // Process remaining buffer content (final chunk)
      yield* this.processBuffer(true);
    } finally {
      // Reset buffer for next use
      this.buffer = '';
    }
  }

  /**
   * Process buffered data and yield parsed objects
   *
   * @param isFinal - Whether this is the final processing (no more data coming)
   * @yields Parsed JSON objects
   */
  private *processBuffer(isFinal: boolean): Generator<T, void, unknown> {
    while (true) {
      // Find next newline
      const newlineIndex = this.buffer.indexOf('\n');

      // No complete line found
      if (newlineIndex === -1) {
        // If this is the final chunk and we have data, try to parse it
        if (isFinal && this.buffer.trim().length > 0) {
          const line = this.buffer.trim();
          this.buffer = '';

          try {
            const parsed = JSON.parse(line) as T;
            yield parsed;
          } catch {
            // Ignore parse errors on final incomplete line
          }
        }
        break;
      }

      // Extract complete line (excluding newline)
      const line = this.buffer.slice(0, newlineIndex);
      // Remove line from buffer (including newline)
      this.buffer = this.buffer.slice(newlineIndex + 1);

      // Skip empty lines
      if (line.trim().length === 0) {
        continue;
      }

      // Parse JSON
      try {
        const parsed = JSON.parse(line) as T;
        yield parsed;
      } catch (error) {
        // In production, you might want to throw an error here
        // For now, we'll skip invalid JSON lines
        console.warn('Failed to parse JSON line:', line, error);
      }
    }
  }
}

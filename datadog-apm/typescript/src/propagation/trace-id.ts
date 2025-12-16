/**
 * TraceIdConverter - Convert between W3C 128-bit and Datadog 64-bit trace IDs
 */

/**
 * TraceIdConverter handles conversion between different trace ID formats
 */
export class TraceIdConverter {
  /**
   * Check if 128-bit trace ID mode is enabled
   */
  private static is128BitEnabled(): boolean {
    return process.env.DD_TRACE_128_BIT_TRACEID_GENERATION_ENABLED === 'true';
  }

  /**
   * Convert W3C 128-bit trace ID to Datadog format
   * Takes the lower 64 bits unless 128-bit mode is enabled
   */
  static toDatadog(w3cTraceId: string): string {
    if (!w3cTraceId) {
      return '';
    }

    // W3C trace IDs are 32 hex characters (128 bits)
    if (w3cTraceId.length === 32) {
      if (this.is128BitEnabled()) {
        // Keep full 128-bit ID
        return w3cTraceId;
      } else {
        // Take lower 64 bits (last 16 hex characters)
        return w3cTraceId.substring(16);
      }
    }

    // Already 64-bit or other format, return as-is
    return w3cTraceId;
  }

  /**
   * Convert Datadog trace ID to W3C 128-bit format
   * Pads with zeros if needed
   */
  static toW3C(ddTraceId: string): string {
    if (!ddTraceId) {
      return '';
    }

    // W3C trace IDs must be 32 hex characters (128 bits)
    if (ddTraceId.length === 16) {
      // 64-bit Datadog ID - pad with zeros on the left
      return '0000000000000000' + ddTraceId;
    } else if (ddTraceId.length === 32) {
      // Already 128-bit
      return ddTraceId;
    } else if (ddTraceId.length < 32) {
      // Shorter than expected, pad to 32
      return ddTraceId.padStart(32, '0');
    }

    // Longer than expected or invalid, truncate to 32
    return ddTraceId.substring(0, 32);
  }

  /**
   * Validate trace ID format
   */
  static isValid(traceId: string): boolean {
    if (!traceId) {
      return false;
    }

    // Must be hex string of 16 or 32 characters
    const validLengths = [16, 32];
    const isValidLength = validLengths.includes(traceId.length);
    const isHex = /^[0-9a-f]+$/i.test(traceId);

    return isValidLength && isHex;
  }

  /**
   * Generate a new trace ID
   */
  static generate(): string {
    const length = this.is128BitEnabled() ? 32 : 16;
    let traceId = '';

    for (let i = 0; i < length; i++) {
      traceId += Math.floor(Math.random() * 16).toString(16);
    }

    return traceId;
  }
}

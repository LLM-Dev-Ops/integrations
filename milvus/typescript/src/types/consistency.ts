/**
 * Milvus consistency levels for controlling read freshness vs performance trade-offs.
 */
export enum ConsistencyLevel {
  /** Wait for all writes to be visible (slowest, freshest) */
  Strong = 'Strong',
  /** See your own writes within the session (recommended) */
  Session = 'Session',
  /** Data may be up to N seconds stale */
  Bounded = 'Bounded',
  /** No freshness guarantee (fastest) */
  Eventually = 'Eventually',
}

/**
 * Convert consistency level to Milvus protocol value.
 */
export function consistencyLevelToProto(level: ConsistencyLevel): number {
  switch (level) {
    case ConsistencyLevel.Strong:
      return 0;
    case ConsistencyLevel.Session:
      return 1;
    case ConsistencyLevel.Bounded:
      return 2;
    case ConsistencyLevel.Eventually:
      return 3;
    default:
      return 1; // Default to Session
  }
}

/**
 * Get guarantee timestamp for a consistency level.
 */
export function getGuaranteeTimestamp(
  level: ConsistencyLevel,
  sessionTimestamp: bigint = 0n,
  boundedMs: number = 5000
): bigint {
  switch (level) {
    case ConsistencyLevel.Strong:
      // Use max timestamp - forces sync
      return BigInt(Number.MAX_SAFE_INTEGER);
    case ConsistencyLevel.Session:
      // Use session's last write timestamp
      return sessionTimestamp;
    case ConsistencyLevel.Bounded:
      // Use current time minus bounded staleness
      return BigInt(Date.now() - boundedMs);
    case ConsistencyLevel.Eventually:
      // Use 0 - no guarantee
      return 0n;
    default:
      return sessionTimestamp;
  }
}

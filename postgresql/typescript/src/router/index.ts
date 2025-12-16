/**
 * PostgreSQL Read/Write Router
 *
 * Provides intelligent query routing between primary and replica databases
 * following the SPARC specification.
 *
 * Features:
 * - Automatic query classification (read vs write)
 * - Multiple routing policies (RoundRobin, LeastConnections, Random, etc.)
 * - Replica lag awareness
 * - Transaction support
 * - Health monitoring
 *
 * @module router
 */

/**
 * Routing policy for query distribution.
 */
export enum RoutingPolicy {
  /** Always route to primary */
  Primary = 'Primary',
  /** Prefer replicas, fallback to primary */
  Replica = 'Replica',
  /** Round-robin across replicas */
  RoundRobin = 'RoundRobin',
  /** Route to replica with least active connections */
  LeastConnections = 'LeastConnections',
  /** Random replica selection */
  Random = 'Random',
}

/**
 * Configuration for query routing.
 */
export interface RoutingConfig {
  /** Routing policy for read queries */
  policy: RoutingPolicy;
  /** Maximum acceptable replica lag in bytes (default: 10MB) */
  maxReplicaLag: number;
  /** Whether to route read-only transactions to replicas */
  readOnlyTransactionToReplica: boolean;
  /** List of SQL keywords that force writes to primary */
  forceWriteToPrimary: string[];
}

/**
 * Options for individual route decisions.
 */
export interface RouteOptions {
  /** Force routing to a specific target */
  forceTarget?: 'primary' | 'replica';
  /** Whether query is part of a transaction */
  inTransaction?: boolean;
  /** Whether transaction is read-only */
  readOnly?: boolean;
}

/**
 * Result of a routing decision.
 */
export interface RoutingDecision {
  /** Target database type */
  target: 'primary' | 'replica';
  /** Index of replica if target is replica */
  replicaIndex?: number;
  /** Reason for routing decision */
  reason: string;
}

/**
 * Health status of a replica.
 */
export interface ReplicaHealth {
  /** Replica index */
  index: number;
  /** Replication lag in bytes */
  lagBytes: number;
  /** Number of active connections */
  activeConnections: number;
  /** Whether replica is healthy (lag within threshold) */
  healthy: boolean;
  /** Last health check timestamp */
  lastCheck: Date;
}

/**
 * Connection pool interface (minimal definition for routing).
 */
export interface ConnectionPool {
  /** Number of replicas in the pool */
  getReplicaCount(): number;
  /** Get active connection count for a replica */
  getReplicaConnections(index: number): number;
}

/**
 * Default routing configuration.
 */
export const DEFAULT_ROUTING_CONFIG: RoutingConfig = {
  policy: RoutingPolicy.RoundRobin,
  maxReplicaLag: 10 * 1024 * 1024, // 10MB
  readOnlyTransactionToReplica: true,
  forceWriteToPrimary: [
    'INSERT',
    'UPDATE',
    'DELETE',
    'CREATE',
    'DROP',
    'ALTER',
    'TRUNCATE',
    'GRANT',
    'REVOKE',
    'EXECUTE',
    'CALL',
  ],
};

/**
 * SQL keywords that indicate write operations.
 */
const WRITE_KEYWORDS = [
  'INSERT',
  'UPDATE',
  'DELETE',
  'CREATE',
  'DROP',
  'ALTER',
  'TRUNCATE',
  'GRANT',
  'REVOKE',
  'EXECUTE',
  'CALL',
];

/**
 * SQL keywords that indicate read operations requiring locks.
 */
const LOCKING_READ_KEYWORDS = ['FOR UPDATE', 'FOR SHARE', 'FOR KEY SHARE', 'FOR NO KEY UPDATE'];

/**
 * Transaction control keywords.
 */
const TRANSACTION_KEYWORDS = ['BEGIN', 'START TRANSACTION', 'COMMIT', 'ROLLBACK', 'SAVEPOINT'];

/**
 * QueryRouter class
 *
 * Intelligent routing layer that directs queries to primary or replica databases
 * based on query type, routing policy, and replica health.
 *
 * @example
 * ```typescript
 * const router = new QueryRouter(pool, {
 *   policy: RoutingPolicy.LeastConnections,
 *   maxReplicaLag: 5 * 1024 * 1024, // 5MB
 *   readOnlyTransactionToReplica: true,
 *   forceWriteToPrimary: ['INSERT', 'UPDATE', 'DELETE'],
 * });
 *
 * const decision = router.route('SELECT * FROM users WHERE id = $1');
 * console.log(decision); // { target: 'replica', replicaIndex: 0, reason: 'Read query' }
 * ```
 */
export class QueryRouter {
  private readonly pool: ConnectionPool;
  private readonly config: RoutingConfig;
  private readonly replicaHealth: Map<number, ReplicaHealth>;
  private roundRobinIndex: number;

  /**
   * Creates a new QueryRouter instance.
   *
   * @param pool - Connection pool instance
   * @param config - Routing configuration (optional, uses defaults if not provided)
   */
  constructor(pool: ConnectionPool, config?: Partial<RoutingConfig>) {
    this.pool = pool;
    this.config = { ...DEFAULT_ROUTING_CONFIG, ...config };
    this.replicaHealth = new Map();
    this.roundRobinIndex = 0;

    // Initialize replica health tracking
    this.initializeReplicaHealth();
  }

  /**
   * Routes a query to the appropriate database target.
   *
   * Decision process:
   * 1. Check for forced target in options
   * 2. Classify query as read or write
   * 3. Apply routing policy for reads
   * 4. Consider transaction state
   * 5. Check replica health and lag
   *
   * @param query - SQL query string
   * @param options - Routing options
   * @returns Routing decision with target and reason
   *
   * @example
   * ```typescript
   * // Write query - always goes to primary
   * router.route('INSERT INTO users (name) VALUES ($1)');
   * // { target: 'primary', reason: 'Write query detected' }
   *
   * // Read query - routed based on policy
   * router.route('SELECT * FROM users');
   * // { target: 'replica', replicaIndex: 0, reason: 'Read query' }
   *
   * // Force to primary
   * router.route('SELECT * FROM users', { forceTarget: 'primary' });
   * // { target: 'primary', reason: 'Forced to primary' }
   * ```
   */
  route(query: string, options?: RouteOptions): RoutingDecision {
    // Check for forced target
    if (options?.forceTarget) {
      if (options.forceTarget === 'primary') {
        return {
          target: 'primary',
          reason: 'Forced to primary',
        };
      }

      // Forced to replica
      const replicaIndex = this.selectReplica(this.config.policy);
      return {
        target: 'replica',
        replicaIndex,
        reason: 'Forced to replica',
      };
    }

    // Normalize query for analysis
    const normalizedQuery = this.normalizeQuery(query);

    // Check for transaction control statements
    if (this.isTransactionControl(normalizedQuery)) {
      return {
        target: 'primary',
        reason: 'Transaction control statement',
      };
    }

    // Check for write operations
    if (this.isWriteQuery(normalizedQuery)) {
      return {
        target: 'primary',
        reason: 'Write query detected',
      };
    }

    // Check for locking reads (SELECT FOR UPDATE, etc.)
    if (this.isLockingRead(normalizedQuery)) {
      return {
        target: 'primary',
        reason: 'Locking read query',
      };
    }

    // Handle transaction context
    if (options?.inTransaction) {
      if (options.readOnly && this.config.readOnlyTransactionToReplica) {
        const replicaIndex = this.selectReplica(this.config.policy);
        return {
          target: 'replica',
          replicaIndex,
          reason: 'Read-only transaction',
        };
      }

      // Non-read-only transaction must go to primary
      return {
        target: 'primary',
        reason: 'Active transaction',
      };
    }

    // Read query - apply routing policy
    if (this.config.policy === RoutingPolicy.Primary) {
      return {
        target: 'primary',
        reason: 'Policy: always use primary',
      };
    }

    // Check if we have healthy replicas
    if (!this.hasHealthyReplicas()) {
      return {
        target: 'primary',
        reason: 'No healthy replicas available',
      };
    }

    // Route to replica based on policy
    const replicaIndex = this.selectReplica(this.config.policy);
    return {
      target: 'replica',
      replicaIndex,
      reason: 'Read query',
    };
  }

  /**
   * Selects a replica based on the routing policy.
   *
   * Policies:
   * - RoundRobin: Cycles through replicas sequentially
   * - LeastConnections: Selects replica with fewest active connections
   * - Random: Randomly selects a replica
   * - Replica/Primary: Uses round-robin as fallback
   *
   * Only considers replicas that are healthy (lag within threshold).
   *
   * @param policy - Routing policy to apply
   * @returns Index of selected replica
   *
   * @example
   * ```typescript
   * const index = router.selectReplica(RoutingPolicy.LeastConnections);
   * console.log(index); // 2 (replica with fewest connections)
   * ```
   */
  selectReplica(policy: RoutingPolicy): number {
    const healthyReplicas = this.getHealthyReplicaIndices();

    if (healthyReplicas.length === 0) {
      // Fallback to first replica if none are healthy
      return 0;
    }

    if (healthyReplicas.length === 1) {
      return healthyReplicas[0]!;
    }

    switch (policy) {
      case RoutingPolicy.RoundRobin:
      case RoutingPolicy.Replica:
        return this.selectRoundRobin(healthyReplicas);

      case RoutingPolicy.LeastConnections:
        return this.selectLeastConnections(healthyReplicas);

      case RoutingPolicy.Random:
        return this.selectRandom(healthyReplicas);

      case RoutingPolicy.Primary:
        // Shouldn't reach here, but fallback to round-robin
        return this.selectRoundRobin(healthyReplicas);

      default:
        return this.selectRoundRobin(healthyReplicas);
    }
  }

  /**
   * Updates the replication lag for a specific replica.
   *
   * Marks replica as unhealthy if lag exceeds configured threshold.
   * This should be called periodically from monitoring queries.
   *
   * @param replicaIndex - Index of the replica
   * @param lagBytes - Current replication lag in bytes
   *
   * @example
   * ```typescript
   * // Update lag from pg_stat_replication
   * router.updateReplicaLag(0, 1024 * 1024); // 1MB lag
   * router.updateReplicaLag(1, 50 * 1024 * 1024); // 50MB lag - unhealthy
   * ```
   */
  updateReplicaLag(replicaIndex: number, lagBytes: number): void {
    const health = this.replicaHealth.get(replicaIndex);
    if (!health) {
      return;
    }

    health.lagBytes = lagBytes;
    health.healthy = lagBytes <= this.config.maxReplicaLag;
    health.lastCheck = new Date();
  }

  /**
   * Gets health status for all replicas.
   *
   * Returns array of ReplicaHealth objects containing:
   * - Replication lag in bytes
   * - Active connection count
   * - Health status
   * - Last check timestamp
   *
   * @returns Array of replica health statuses
   *
   * @example
   * ```typescript
   * const health = router.getReplicaHealth();
   * health.forEach(h => {
   *   console.log(`Replica ${h.index}: ${h.healthy ? 'healthy' : 'unhealthy'}`);
   *   console.log(`  Lag: ${h.lagBytes} bytes`);
   *   console.log(`  Connections: ${h.activeConnections}`);
   * });
   * ```
   */
  getReplicaHealth(): ReplicaHealth[] {
    const health: ReplicaHealth[] = [];

    for (const [index, replicaHealth] of Array.from(this.replicaHealth.entries())) {
      // Update active connections from pool
      const activeConnections = this.pool.getReplicaConnections(index);

      health.push({
        index,
        lagBytes: replicaHealth.lagBytes,
        activeConnections,
        healthy: replicaHealth.healthy,
        lastCheck: replicaHealth.lastCheck,
      });
    }

    return health;
  }

  /**
   * Gets the current routing configuration.
   *
   * @returns Current routing config
   */
  getConfig(): Readonly<RoutingConfig> {
    return { ...this.config };
  }

  /**
   * Updates routing configuration.
   *
   * @param config - Partial config to merge with current config
   *
   * @example
   * ```typescript
   * router.updateConfig({
   *   policy: RoutingPolicy.LeastConnections,
   *   maxReplicaLag: 5 * 1024 * 1024, // 5MB
   * });
   * ```
   */
  updateConfig(config: Partial<RoutingConfig>): void {
    Object.assign(this.config, config);
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Initializes replica health tracking for all replicas in pool.
   */
  private initializeReplicaHealth(): void {
    const replicaCount = this.pool.getReplicaCount();

    for (let i = 0; i < replicaCount; i++) {
      this.replicaHealth.set(i, {
        index: i,
        lagBytes: 0,
        activeConnections: 0,
        healthy: true,
        lastCheck: new Date(),
      });
    }
  }

  /**
   * Normalizes a query for analysis by trimming and converting to uppercase.
   */
  private normalizeQuery(query: string): string {
    return query.trim().toUpperCase();
  }

  /**
   * Checks if query is a write operation.
   */
  private isWriteQuery(normalizedQuery: string): boolean {
    // Check against configured write keywords
    for (const keyword of this.config.forceWriteToPrimary) {
      if (normalizedQuery.startsWith(keyword)) {
        return true;
      }
    }

    // Also check default write keywords
    for (const keyword of WRITE_KEYWORDS) {
      if (normalizedQuery.startsWith(keyword)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Checks if query is a locking read (SELECT FOR UPDATE, etc.).
   */
  private isLockingRead(normalizedQuery: string): boolean {
    for (const keyword of LOCKING_READ_KEYWORDS) {
      if (normalizedQuery.includes(keyword)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Checks if query is a transaction control statement.
   */
  private isTransactionControl(normalizedQuery: string): boolean {
    for (const keyword of TRANSACTION_KEYWORDS) {
      if (normalizedQuery.startsWith(keyword)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Checks if there are any healthy replicas available.
   */
  private hasHealthyReplicas(): boolean {
    for (const health of Array.from(this.replicaHealth.values())) {
      if (health.healthy) {
        return true;
      }
    }
    return false;
  }

  /**
   * Gets indices of all healthy replicas.
   */
  private getHealthyReplicaIndices(): number[] {
    const indices: number[] = [];

    for (const health of Array.from(this.replicaHealth.values())) {
      if (health.healthy) {
        indices.push(health.index);
      }
    }

    return indices;
  }

  /**
   * Selects replica using round-robin strategy.
   */
  private selectRoundRobin(healthyReplicas: number[]): number {
    const selectedIndex = healthyReplicas[this.roundRobinIndex % healthyReplicas.length];
    this.roundRobinIndex++;
    return selectedIndex!;
  }

  /**
   * Selects replica with least active connections.
   */
  private selectLeastConnections(healthyReplicas: number[]): number {
    let minConnections = Infinity;
    let selectedIndex = healthyReplicas[0]!;

    for (const index of healthyReplicas) {
      const connections = this.pool.getReplicaConnections(index);
      if (connections < minConnections) {
        minConnections = connections;
        selectedIndex = index;
      }
    }

    return selectedIndex;
  }

  /**
   * Selects replica randomly.
   */
  private selectRandom(healthyReplicas: number[]): number {
    const randomIndex = Math.floor(Math.random() * healthyReplicas.length);
    return healthyReplicas[randomIndex]!;
  }
}

/**
 * Creates a QueryRouter with default configuration.
 *
 * @param pool - Connection pool instance
 * @returns Configured QueryRouter instance
 *
 * @example
 * ```typescript
 * const router = createDefaultRouter(pool);
 * const decision = router.route('SELECT * FROM users');
 * ```
 */
export function createDefaultRouter(pool: ConnectionPool): QueryRouter {
  return new QueryRouter(pool, DEFAULT_ROUTING_CONFIG);
}

/**
 * Creates a QueryRouter configured to prefer replicas.
 *
 * @param pool - Connection pool instance
 * @param maxReplicaLag - Maximum acceptable lag in bytes (default: 10MB)
 * @returns Configured QueryRouter instance
 *
 * @example
 * ```typescript
 * const router = createReplicaPreferringRouter(pool, 5 * 1024 * 1024);
 * const decision = router.route('SELECT * FROM users');
 * // Will route to replica if healthy
 * ```
 */
export function createReplicaPreferringRouter(
  pool: ConnectionPool,
  maxReplicaLag: number = 10 * 1024 * 1024
): QueryRouter {
  return new QueryRouter(pool, {
    policy: RoutingPolicy.Replica,
    maxReplicaLag,
    readOnlyTransactionToReplica: true,
    forceWriteToPrimary: WRITE_KEYWORDS,
  });
}

/**
 * Creates a QueryRouter configured for least-connections routing.
 *
 * @param pool - Connection pool instance
 * @param maxReplicaLag - Maximum acceptable lag in bytes (default: 10MB)
 * @returns Configured QueryRouter instance
 *
 * @example
 * ```typescript
 * const router = createLeastConnectionsRouter(pool);
 * const decision = router.route('SELECT * FROM products');
 * // Routes to replica with fewest active connections
 * ```
 */
export function createLeastConnectionsRouter(
  pool: ConnectionPool,
  maxReplicaLag: number = 10 * 1024 * 1024
): QueryRouter {
  return new QueryRouter(pool, {
    policy: RoutingPolicy.LeastConnections,
    maxReplicaLag,
    readOnlyTransactionToReplica: true,
    forceWriteToPrimary: WRITE_KEYWORDS,
  });
}

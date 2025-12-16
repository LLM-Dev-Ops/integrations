/**
 * MySQL Query Routing Module
 *
 * Implements intelligent query routing for MySQL read/write splitting:
 * - QueryRouter: Determines whether queries should go to primary or replica
 * - LoadBalancer: Selects optimal replica using various strategies
 * - StatementParser: Analyzes SQL statements to detect operation types
 *
 * Routing Rules:
 * - Write Operations → Primary: INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, LOCK, TRUNCATE, SET
 * - Read Operations → Replica (if available): SELECT (outside transaction), SHOW, DESCRIBE, EXPLAIN
 * - Transactions → Always Primary
 * - SELECT FOR UPDATE → Primary
 * - /*+ PRIMARY *\/ hint → Primary
 *
 * @module routing
 */

// ============================================================================
// Statement Types
// ============================================================================

/**
 * SQL statement type classification.
 */
export enum StatementType {
  /** SELECT query */
  SELECT = 'SELECT',
  /** INSERT statement */
  INSERT = 'INSERT',
  /** UPDATE statement */
  UPDATE = 'UPDATE',
  /** DELETE statement */
  DELETE = 'DELETE',
  /** CREATE DDL */
  CREATE = 'CREATE',
  /** ALTER DDL */
  ALTER = 'ALTER',
  /** DROP DDL */
  DROP = 'DROP',
  /** TRUNCATE statement */
  TRUNCATE = 'TRUNCATE',
  /** LOCK statement */
  LOCK = 'LOCK',
  /** SET statement */
  SET = 'SET',
  /** SHOW statement */
  SHOW = 'SHOW',
  /** DESCRIBE/DESC statement */
  DESCRIBE = 'DESCRIBE',
  /** EXPLAIN statement */
  EXPLAIN = 'EXPLAIN',
  /** BEGIN/START TRANSACTION */
  BEGIN = 'BEGIN',
  /** COMMIT transaction */
  COMMIT = 'COMMIT',
  /** ROLLBACK transaction */
  ROLLBACK = 'ROLLBACK',
  /** Unknown or unsupported statement */
  UNKNOWN = 'UNKNOWN',
}

/**
 * Routing configuration for query routing decisions.
 */
export interface RoutingConfig {
  /** Whether to automatically route read queries to replicas */
  autoRouteReads: boolean;
  /** Maximum acceptable replica lag in milliseconds */
  maxReplicaLagMs: number;
  /** Whether replicas are available */
  hasReplicas: boolean;
}

/**
 * Replica information for load balancing.
 */
export interface ReplicaInfo {
  /** Replica identifier (e.g., endpoint) */
  id: string;
  /** Weight for weighted load balancing (default: 1) */
  weight: number;
  /** Number of active connections */
  activeConnections: number;
  /** Whether the replica is healthy */
  healthy: boolean;
  /** Current replication lag in milliseconds */
  lagMs?: number;
}

// ============================================================================
// Statement Parser
// ============================================================================

/**
 * SQL statement parser for detecting operation types.
 *
 * Analyzes SQL queries to determine their type and characteristics,
 * enabling intelligent routing decisions.
 */
export class StatementParser {
  /**
   * Regular expressions for statement type detection.
   * Optimized for performance with anchored patterns.
   */
  private static readonly PATTERNS = {
    SELECT: /^\s*(?:\/\*.*?\*\/\s*)*(SELECT|WITH)\s+/i,
    INSERT: /^\s*(?:\/\*.*?\*\/\s*)*(INSERT|REPLACE)\s+/i,
    UPDATE: /^\s*(?:\/\*.*?\*\/\s*)*UPDATE\s+/i,
    DELETE: /^\s*(?:\/\*.*?\*\/\s*)*DELETE\s+/i,
    CREATE: /^\s*(?:\/\*.*?\*\/\s*)*CREATE\s+/i,
    ALTER: /^\s*(?:\/\*.*?\*\/\s*)*ALTER\s+/i,
    DROP: /^\s*(?:\/\*.*?\*\/\s*)*DROP\s+/i,
    TRUNCATE: /^\s*(?:\/\*.*?\*\/\s*)*TRUNCATE\s+/i,
    LOCK: /^\s*(?:\/\*.*?\*\/\s*)*LOCK\s+/i,
    SET: /^\s*(?:\/\*.*?\*\/\s*)*SET\s+/i,
    SHOW: /^\s*(?:\/\*.*?\*\/\s*)*SHOW\s+/i,
    DESCRIBE: /^\s*(?:\/\*.*?\*\/\s*)*(DESCRIBE|DESC)\s+/i,
    EXPLAIN: /^\s*(?:\/\*.*?\*\/\s*)*EXPLAIN\s+/i,
    BEGIN: /^\s*(?:\/\*.*?\*\/\s*)*(BEGIN|START\s+TRANSACTION)\s*/i,
    COMMIT: /^\s*(?:\/\*.*?\*\/\s*)*COMMIT\s*/i,
    ROLLBACK: /^\s*(?:\/\*.*?\*\/\s*)*ROLLBACK\s*/i,
  };

  /**
   * FOR UPDATE pattern for detecting SELECT FOR UPDATE.
   */
  private static readonly FOR_UPDATE_PATTERN = /\bFOR\s+UPDATE\b/i;

  /**
   * FOR SHARE/LOCK IN SHARE MODE patterns.
   */
  private static readonly FOR_SHARE_PATTERN = /\bFOR\s+SHARE\b|\bLOCK\s+IN\s+SHARE\s+MODE\b/i;

  /**
   * PRIMARY hint pattern for forcing primary routing.
   */
  private static readonly PRIMARY_HINT_PATTERN = /\/\*\+\s*PRIMARY\s*\*\//i;

  /**
   * REPLICA hint pattern for forcing replica routing.
   */
  private static readonly REPLICA_HINT_PATTERN = /\/\*\+\s*REPLICA\s*\*\//i;

  /**
   * Parses SQL statement to detect its type.
   *
   * @param sql - SQL query string
   * @returns Statement type
   *
   * @example
   * ```typescript
   * const parser = new StatementParser();
   * parser.parseStatementType('SELECT * FROM users'); // StatementType.SELECT
   * parser.parseStatementType('INSERT INTO users VALUES (...)'); // StatementType.INSERT
   * ```
   */
  parseStatementType(sql: string): StatementType {
    if (!sql || sql.trim().length === 0) {
      return StatementType.UNKNOWN;
    }

    // Check each pattern in order of likelihood (most common first)
    if (StatementParser.PATTERNS.SELECT.test(sql)) return StatementType.SELECT;
    if (StatementParser.PATTERNS.INSERT.test(sql)) return StatementType.INSERT;
    if (StatementParser.PATTERNS.UPDATE.test(sql)) return StatementType.UPDATE;
    if (StatementParser.PATTERNS.DELETE.test(sql)) return StatementType.DELETE;
    if (StatementParser.PATTERNS.SHOW.test(sql)) return StatementType.SHOW;
    if (StatementParser.PATTERNS.DESCRIBE.test(sql)) return StatementType.DESCRIBE;
    if (StatementParser.PATTERNS.EXPLAIN.test(sql)) return StatementType.EXPLAIN;
    if (StatementParser.PATTERNS.BEGIN.test(sql)) return StatementType.BEGIN;
    if (StatementParser.PATTERNS.COMMIT.test(sql)) return StatementType.COMMIT;
    if (StatementParser.PATTERNS.ROLLBACK.test(sql)) return StatementType.ROLLBACK;
    if (StatementParser.PATTERNS.CREATE.test(sql)) return StatementType.CREATE;
    if (StatementParser.PATTERNS.ALTER.test(sql)) return StatementType.ALTER;
    if (StatementParser.PATTERNS.DROP.test(sql)) return StatementType.DROP;
    if (StatementParser.PATTERNS.TRUNCATE.test(sql)) return StatementType.TRUNCATE;
    if (StatementParser.PATTERNS.LOCK.test(sql)) return StatementType.LOCK;
    if (StatementParser.PATTERNS.SET.test(sql)) return StatementType.SET;

    return StatementType.UNKNOWN;
  }

  /**
   * Determines if a SQL statement is a write operation.
   *
   * @param sql - SQL query string
   * @returns True if the statement modifies data
   *
   * @example
   * ```typescript
   * parser.isWriteOperation('UPDATE users SET name = ?'); // true
   * parser.isWriteOperation('SELECT * FROM users'); // false
   * ```
   */
  isWriteOperation(sql: string): boolean {
    const type = this.parseStatementType(sql);

    return [
      StatementType.INSERT,
      StatementType.UPDATE,
      StatementType.DELETE,
      StatementType.CREATE,
      StatementType.ALTER,
      StatementType.DROP,
      StatementType.TRUNCATE,
      StatementType.LOCK,
      StatementType.SET,
    ].includes(type);
  }

  /**
   * Determines if a SQL statement is a read operation.
   *
   * @param sql - SQL query string
   * @returns True if the statement only reads data
   *
   * @example
   * ```typescript
   * parser.isReadOperation('SELECT * FROM users'); // true
   * parser.isReadOperation('SHOW TABLES'); // true
   * parser.isReadOperation('INSERT INTO users ...'); // false
   * ```
   */
  isReadOperation(sql: string): boolean {
    const type = this.parseStatementType(sql);

    return [
      StatementType.SELECT,
      StatementType.SHOW,
      StatementType.DESCRIBE,
      StatementType.EXPLAIN,
    ].includes(type);
  }

  /**
   * Checks if a SELECT statement includes FOR UPDATE clause.
   *
   * SELECT FOR UPDATE acquires locks and must be routed to primary.
   *
   * @param sql - SQL query string
   * @returns True if FOR UPDATE is present
   *
   * @example
   * ```typescript
   * parser.hasForUpdate('SELECT * FROM users FOR UPDATE'); // true
   * parser.hasForUpdate('SELECT * FROM users'); // false
   * ```
   */
  hasForUpdate(sql: string): boolean {
    return StatementParser.FOR_UPDATE_PATTERN.test(sql);
  }

  /**
   * Checks if a SELECT statement includes FOR SHARE or LOCK IN SHARE MODE.
   *
   * @param sql - SQL query string
   * @returns True if FOR SHARE or LOCK IN SHARE MODE is present
   *
   * @example
   * ```typescript
   * parser.hasForShare('SELECT * FROM users FOR SHARE'); // true
   * parser.hasForShare('SELECT * FROM users LOCK IN SHARE MODE'); // true
   * ```
   */
  hasForShare(sql: string): boolean {
    return StatementParser.FOR_SHARE_PATTERN.test(sql);
  }

  /**
   * Checks if query contains /*+ PRIMARY *\/ hint.
   *
   * The PRIMARY hint forces routing to the primary database.
   *
   * @param sql - SQL query string
   * @returns True if PRIMARY hint is present
   *
   * @example
   * ```typescript
   * parser.hasPrimaryHint('/*+ PRIMARY *\/ SELECT * FROM users'); // true
   * parser.hasPrimaryHint('SELECT * FROM users'); // false
   * ```
   */
  hasPrimaryHint(sql: string): boolean {
    return StatementParser.PRIMARY_HINT_PATTERN.test(sql);
  }

  /**
   * Checks if query contains /*+ REPLICA *\/ hint.
   *
   * The REPLICA hint suggests routing to a replica (if available and safe).
   *
   * @param sql - SQL query string
   * @returns True if REPLICA hint is present
   *
   * @example
   * ```typescript
   * parser.hasReplicaHint('/*+ REPLICA *\/ SELECT * FROM users'); // true
   * ```
   */
  hasReplicaHint(sql: string): boolean {
    return StatementParser.REPLICA_HINT_PATTERN.test(sql);
  }
}

// ============================================================================
// Query Router
// ============================================================================

/**
 * Query router for determining primary vs replica routing.
 *
 * Implements intelligent routing logic based on:
 * - Statement type (read vs write)
 * - Transaction state
 * - Query hints
 * - Configuration settings
 */
export class QueryRouter {
  private readonly parser: StatementParser;

  /**
   * Creates a new QueryRouter instance.
   */
  constructor() {
    this.parser = new StatementParser();
  }

  /**
   * Determines if a query should be routed to a replica.
   *
   * Routing Decision Logic:
   * 1. If auto-routing disabled → Primary
   * 2. If no replicas available → Primary
   * 3. If in transaction → Primary
   * 4. If PRIMARY hint present → Primary
   * 5. If write operation → Primary
   * 6. If SELECT FOR UPDATE/SHARE → Primary
   * 7. If transaction control (BEGIN/COMMIT/ROLLBACK) → Primary
   * 8. If read operation AND not in transaction → Replica
   *
   * @param sql - SQL query to analyze
   * @param inTransaction - Whether currently in a transaction
   * @param config - Routing configuration
   * @returns True if query should go to replica, false for primary
   *
   * @example
   * ```typescript
   * const router = new QueryRouter();
   * const config = { autoRouteReads: true, maxReplicaLagMs: 1000, hasReplicas: true };
   *
   * router.shouldRouteToReplica('SELECT * FROM users', false, config); // true
   * router.shouldRouteToReplica('INSERT INTO users ...', false, config); // false
   * router.shouldRouteToReplica('SELECT * FROM users', true, config); // false (in tx)
   * router.shouldRouteToReplica('SELECT * FOR UPDATE', false, config); // false (locks)
   * ```
   */
  shouldRouteToReplica(sql: string, inTransaction: boolean, config: RoutingConfig): boolean {
    // Rule 1: Auto-routing must be enabled
    if (!config.autoRouteReads) {
      return false;
    }

    // Rule 2: Replicas must be available
    if (!config.hasReplicas) {
      return false;
    }

    // Rule 3: Transactions always go to primary (consistency)
    if (inTransaction) {
      return false;
    }

    // Rule 4: Respect PRIMARY hint
    if (this.parser.hasPrimaryHint(sql)) {
      return false;
    }

    const statementType = this.parser.parseStatementType(sql);

    // Rule 5: Write operations always go to primary
    if (this.parser.isWriteOperation(sql)) {
      return false;
    }

    // Rule 6: Transaction control always goes to primary
    if ([StatementType.BEGIN, StatementType.COMMIT, StatementType.ROLLBACK].includes(statementType)) {
      return false;
    }

    // Rule 7: SELECT FOR UPDATE/SHARE goes to primary (acquires locks)
    if (statementType === StatementType.SELECT) {
      if (this.parser.hasForUpdate(sql) || this.parser.hasForShare(sql)) {
        return false;
      }
    }

    // Rule 8: Read operations can go to replica
    if (this.parser.isReadOperation(sql)) {
      return true;
    }

    // Default: Unknown statements go to primary (safe choice)
    return false;
  }

  /**
   * Gets the statement parser instance.
   *
   * @returns StatementParser instance
   */
  getParser(): StatementParser {
    return this.parser;
  }

  /**
   * Convenience method: Parse statement type from SQL.
   *
   * @param sql - SQL query string
   * @returns Statement type
   */
  parseStatementType(sql: string): StatementType {
    return this.parser.parseStatementType(sql);
  }
}

// ============================================================================
// Load Balancer
// ============================================================================

/**
 * Load balancing strategy enumeration.
 */
export enum LoadBalancingStrategy {
  /** Round-robin: cycle through replicas sequentially */
  ROUND_ROBIN = 'ROUND_ROBIN',
  /** Random: select replica randomly */
  RANDOM = 'RANDOM',
  /** Least connections: select replica with fewest active connections */
  LEAST_CONNECTIONS = 'LEAST_CONNECTIONS',
  /** Weighted round-robin: weighted selection based on replica weights */
  WEIGHTED_ROUND_ROBIN = 'WEIGHTED_ROUND_ROBIN',
}

/**
 * Load balancer for selecting optimal replica.
 *
 * Supports multiple load balancing strategies:
 * - Round Robin: Simple sequential rotation
 * - Random: Random selection
 * - Least Connections: Choose replica with fewest active connections
 * - Weighted Round Robin: Weighted distribution based on replica capacity
 */
export class LoadBalancer {
  private readonly strategy: LoadBalancingStrategy;
  private roundRobinIndex: number = 0;
  private weightedSequence: string[] = [];
  private weightedIndex: number = 0;

  /**
   * Creates a new LoadBalancer instance.
   *
   * @param strategy - Load balancing strategy to use
   */
  constructor(strategy: LoadBalancingStrategy = LoadBalancingStrategy.ROUND_ROBIN) {
    this.strategy = strategy;
  }

  /**
   * Selects a replica from the available pool.
   *
   * @param replicas - Array of available replicas
   * @returns Selected replica, or undefined if no replicas available
   *
   * @example
   * ```typescript
   * const lb = new LoadBalancer(LoadBalancingStrategy.ROUND_ROBIN);
   * const replicas = [
   *   { id: 'replica1', weight: 1, activeConnections: 5, healthy: true },
   *   { id: 'replica2', weight: 1, activeConnections: 3, healthy: true },
   * ];
   * const selected = lb.select(replicas); // Returns one of the replicas
   * ```
   */
  select(replicas: ReplicaInfo[]): ReplicaInfo | undefined {
    if (replicas.length === 0) {
      return undefined;
    }

    // Filter out unhealthy replicas
    const healthyReplicas = replicas.filter(r => r.healthy);
    if (healthyReplicas.length === 0) {
      return undefined;
    }

    switch (this.strategy) {
      case LoadBalancingStrategy.ROUND_ROBIN:
        return this.selectRoundRobin(healthyReplicas);

      case LoadBalancingStrategy.RANDOM:
        return this.selectRandom(healthyReplicas);

      case LoadBalancingStrategy.LEAST_CONNECTIONS:
        return this.selectLeastConnections(healthyReplicas);

      case LoadBalancingStrategy.WEIGHTED_ROUND_ROBIN:
        return this.selectWeightedRoundRobin(healthyReplicas);

      default:
        return this.selectRoundRobin(healthyReplicas);
    }
  }

  /**
   * Round-robin selection: cycles through replicas sequentially.
   *
   * @param replicas - Healthy replicas
   * @returns Selected replica
   */
  private selectRoundRobin(replicas: ReplicaInfo[]): ReplicaInfo {
    const index = this.roundRobinIndex % replicas.length;
    this.roundRobinIndex = (this.roundRobinIndex + 1) % replicas.length;
    return replicas[index];
  }

  /**
   * Random selection: selects a replica randomly.
   *
   * @param replicas - Healthy replicas
   * @returns Selected replica
   */
  private selectRandom(replicas: ReplicaInfo[]): ReplicaInfo {
    const index = Math.floor(Math.random() * replicas.length);
    return replicas[index];
  }

  /**
   * Least connections selection: chooses replica with fewest active connections.
   *
   * @param replicas - Healthy replicas
   * @returns Selected replica with minimum active connections
   */
  private selectLeastConnections(replicas: ReplicaInfo[]): ReplicaInfo {
    return replicas.reduce((min, current) =>
      current.activeConnections < min.activeConnections ? current : min
    );
  }

  /**
   * Weighted round-robin selection: distributes load based on replica weights.
   *
   * Builds a sequence where each replica appears proportionally to its weight.
   * For example, weights [3, 2, 1] create sequence: [0,0,0,1,1,2]
   *
   * @param replicas - Healthy replicas
   * @returns Selected replica
   */
  private selectWeightedRoundRobin(replicas: ReplicaInfo[]): ReplicaInfo {
    // Rebuild sequence if replicas changed
    if (this.weightedSequence.length === 0 || this.shouldRebuildWeightedSequence(replicas)) {
      this.weightedSequence = this.buildWeightedSequence(replicas);
      this.weightedIndex = 0;
    }

    if (this.weightedSequence.length === 0) {
      // Fallback to round-robin if no weights
      return this.selectRoundRobin(replicas);
    }

    const replicaId = this.weightedSequence[this.weightedIndex];
    this.weightedIndex = (this.weightedIndex + 1) % this.weightedSequence.length;

    const replica = replicas.find(r => r.id === replicaId);
    return replica || replicas[0]; // Fallback to first if not found
  }

  /**
   * Builds weighted sequence based on replica weights.
   *
   * @param replicas - Replicas with weights
   * @returns Array of replica IDs repeated according to weights
   */
  private buildWeightedSequence(replicas: ReplicaInfo[]): string[] {
    const sequence: string[] = [];

    for (const replica of replicas) {
      const weight = Math.max(1, Math.floor(replica.weight));
      for (let i = 0; i < weight; i++) {
        sequence.push(replica.id);
      }
    }

    return sequence;
  }

  /**
   * Determines if weighted sequence needs to be rebuilt.
   *
   * @param replicas - Current replicas
   * @returns True if sequence should be rebuilt
   */
  private shouldRebuildWeightedSequence(replicas: ReplicaInfo[]): boolean {
    // Check if replica count matches
    const uniqueIds = new Set(this.weightedSequence);
    if (uniqueIds.size !== replicas.length) {
      return true;
    }

    // Check if all replica IDs are still present
    const currentIds = new Set(replicas.map(r => r.id));
    const uniqueIdsArray = Array.from(uniqueIds);
    for (const id of uniqueIdsArray) {
      if (!currentIds.has(id)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Gets the current load balancing strategy.
   *
   * @returns Current strategy
   */
  getStrategy(): LoadBalancingStrategy {
    return this.strategy;
  }

  /**
   * Resets the load balancer state.
   *
   * Useful when replica configuration changes.
   */
  reset(): void {
    this.roundRobinIndex = 0;
    this.weightedSequence = [];
    this.weightedIndex = 0;
  }
}

// ============================================================================
// Exports
// ============================================================================

// Classes are already exported above with 'export class' declarations
// Re-exporting here for explicit module interface documentation
// All types and enums are also exported inline

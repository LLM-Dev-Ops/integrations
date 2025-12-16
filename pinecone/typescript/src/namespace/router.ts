/**
 * Namespace routing for multi-tenant and environment-based isolation.
 *
 * This module provides automatic namespace resolution based on context like
 * tenant ID, environment, and workload type. It enables clean multi-tenancy
 * and environment separation in Pinecone indexes.
 *
 * @module namespace/router
 */

/**
 * Context information for determining the appropriate namespace.
 */
export interface OperationContext {
  /**
   * Tenant identifier for multi-tenant isolation
   */
  tenantId?: string;

  /**
   * Environment (e.g., 'dev', 'staging', 'prod')
   */
  environment?: string;

  /**
   * Workload type (e.g., 'rag', 'search', 'embeddings')
   */
  workload?: string;

  /**
   * Explicitly specified namespace (takes precedence over generated)
   */
  explicitNamespace?: string;
}

/**
 * Configuration for namespace routing behavior.
 */
export interface NamespaceRoutingConfig {
  /**
   * Default namespace to use when no context is provided
   */
  defaultNamespace?: string;

  /**
   * Separator character for namespace components (default: '-')
   */
  separator?: string;
}

/**
 * Handles namespace routing and resolution for Pinecone operations.
 *
 * The NamespaceRouter generates namespaces from context information,
 * enabling clean separation of data across tenants, environments, and workloads.
 *
 * @example
 * ```typescript
 * const router = new NamespaceRouter({ defaultNamespace: 'default' });
 *
 * // Generates: 'acme-prod-rag'
 * const ns = router.resolveNamespace({
 *   tenantId: 'acme',
 *   environment: 'prod',
 *   workload: 'rag'
 * });
 *
 * // Explicit namespace takes precedence: 'custom'
 * const ns2 = router.resolveNamespace({
 *   tenantId: 'acme',
 *   explicitNamespace: 'custom'
 * });
 *
 * // Fluent interface
 * const ns3 = router
 *   .withTenantPrefix('acme')
 *   .withEnvironment('prod')
 *   .resolveNamespace({ workload: 'rag' });
 * ```
 */
export class NamespaceRouter {
  private readonly config: Required<NamespaceRoutingConfig>;
  private contextPrefix: string[] = [];

  /**
   * Creates a new NamespaceRouter.
   *
   * @param config - Configuration for namespace routing
   */
  constructor(config?: NamespaceRoutingConfig) {
    this.config = {
      defaultNamespace: config?.defaultNamespace ?? '',
      separator: config?.separator ?? '-',
    };
  }

  /**
   * Resolves a namespace from the given operation context.
   *
   * Resolution follows this priority:
   * 1. Explicit namespace in context
   * 2. Generated from context components (tenantId, environment, workload)
   * 3. Default namespace from config
   *
   * @param context - Operation context containing namespace information
   * @returns Resolved namespace string
   *
   * @example
   * ```typescript
   * const router = new NamespaceRouter();
   *
   * // Returns: 'acme-prod-rag'
   * router.resolveNamespace({
   *   tenantId: 'acme',
   *   environment: 'prod',
   *   workload: 'rag'
   * });
   *
   * // Returns: 'custom' (explicit takes precedence)
   * router.resolveNamespace({
   *   tenantId: 'acme',
   *   explicitNamespace: 'custom'
   * });
   * ```
   */
  resolveNamespace(context: OperationContext): string {
    // Explicit namespace takes highest precedence
    if (context.explicitNamespace) {
      return context.explicitNamespace;
    }

    // Build namespace from context components
    const components: string[] = [...this.contextPrefix];

    if (context.tenantId) {
      components.push(context.tenantId);
    }

    if (context.environment) {
      components.push(context.environment);
    }

    if (context.workload) {
      components.push(context.workload);
    }

    // If we have components, join them with separator
    if (components.length > 0) {
      return components.join(this.config.separator);
    }

    // Fall back to default namespace
    return this.config.defaultNamespace;
  }

  /**
   * Returns a new router with a tenant prefix applied to all resolutions.
   *
   * This is useful for creating tenant-scoped routers that automatically
   * prefix all namespaces with the tenant ID.
   *
   * @param tenantId - Tenant identifier to prefix
   * @returns A new NamespaceRouter with the tenant prefix
   *
   * @example
   * ```typescript
   * const router = new NamespaceRouter();
   * const tenantRouter = router.withTenantPrefix('acme');
   *
   * // Returns: 'acme-prod'
   * tenantRouter.resolveNamespace({ environment: 'prod' });
   * ```
   */
  withTenantPrefix(tenantId: string): this {
    const newRouter = new NamespaceRouter(this.config) as this;
    newRouter.contextPrefix = [...this.contextPrefix, tenantId];
    return newRouter;
  }

  /**
   * Returns a new router with an environment prefix applied to all resolutions.
   *
   * This is useful for creating environment-scoped routers that automatically
   * include the environment in all namespaces.
   *
   * @param env - Environment identifier to include
   * @returns A new NamespaceRouter with the environment prefix
   *
   * @example
   * ```typescript
   * const router = new NamespaceRouter();
   * const envRouter = router.withEnvironment('prod');
   *
   * // Returns: 'prod-rag'
   * envRouter.resolveNamespace({ workload: 'rag' });
   *
   * // Can be chained
   * const ns = router
   *   .withTenantPrefix('acme')
   *   .withEnvironment('prod')
   *   .resolveNamespace({ workload: 'rag' });
   * // Returns: 'acme-prod-rag'
   * ```
   */
  withEnvironment(env: string): this {
    const newRouter = new NamespaceRouter(this.config) as this;
    newRouter.contextPrefix = [...this.contextPrefix, env];
    return newRouter;
  }
}

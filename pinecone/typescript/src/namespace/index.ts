/**
 * Namespace routing and access control for Pinecone operations.
 *
 * This module provides utilities for:
 * - Automatic namespace resolution based on tenant, environment, and workload
 * - Pattern-based access control for namespace operations
 * - Multi-tenant and environment isolation
 *
 * @module namespace
 */

export {
  NamespaceRouter,
  type OperationContext,
  type NamespaceRoutingConfig,
} from './router.js';

export {
  NamespaceAccessControl,
  type Operation,
  type AccessControlConfig,
} from './access.js';

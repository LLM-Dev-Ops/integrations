/**
 * AWS IAM Common Types
 *
 * This module contains common type definitions shared across AWS IAM operations.
 */

/**
 * IAM Role information
 */
export interface RoleInfo {
  /** The ARN of the role */
  arn: string;
  /** The name of the role */
  roleName: string;
  /** The ID of the role */
  roleId: string;
  /** The path to the role */
  path?: string;
  /** When the role was created */
  createDate?: Date;
  /** The role's trust policy document */
  assumeRolePolicyDocument?: string;
  /** Description of the role */
  description?: string;
  /** Maximum session duration in seconds */
  maxSessionDuration?: number;
  /** The ARN of the permissions boundary */
  permissionsBoundary?: string;
  /** Tags associated with the role */
  tags?: Array<{ key: string; value: string }>;
}

/**
 * IAM Policy Document
 */
export interface PolicyDocument {
  /** Policy document version */
  version: string;
  /** Policy statements */
  statement: Statement[];
  /** Policy ID (optional) */
  id?: string;
}

/**
 * IAM Policy Statement
 */
export interface Statement {
  /** Statement ID (optional) */
  sid?: string;
  /** Effect of the statement (Allow or Deny) */
  effect: 'Allow' | 'Deny';
  /** Principal that the statement applies to */
  principal?: string | string[] | Record<string, string | string[]>;
  /** Action or actions allowed/denied */
  action: string | string[];
  /** Resource or resources the statement applies to */
  resource?: string | string[];
  /** Conditions for the statement */
  condition?: Record<string, Record<string, string | string[]>>;
}

/**
 * Context entry for policy evaluation
 */
export interface ContextEntry {
  /** The key name of the context entry */
  key: string;
  /** The value of the context entry */
  value: string | string[];
  /** The type of the context value */
  type: 'string' | 'stringList' | 'numeric' | 'numericList' | 'boolean' | 'booleanList' | 'ip' | 'ipList' | 'binary' | 'binaryList' | 'date' | 'dateList';
}

/**
 * Permission check for batch operations
 */
export interface PermissionCheck {
  /** The principal ARN */
  principal: string;
  /** The action to check */
  action: string;
  /** The resource to check access against */
  resource: string;
  /** Optional context entries */
  contextEntries?: ContextEntry[];
}

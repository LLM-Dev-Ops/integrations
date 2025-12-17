/**
 * HubSpot Association Types
 * Type definitions for managing relationships between CRM objects
 */

import type { ObjectType } from './objects.js';

/**
 * Association between two objects
 */
export interface Association {
  /** Target object ID */
  toObjectId: string;

  /** Target object type */
  toObjectType: ObjectType;

  /** Association type identifiers */
  associationTypes: AssociationType[];

  /** Association labels */
  labels?: string[];
}

/**
 * Association type definition
 */
export interface AssociationType {
  /** Association category */
  category: AssociationCategory;

  /** Numeric type ID */
  typeId: number;

  /** Human-readable label */
  label?: string;
}

/**
 * Association category
 */
export type AssociationCategory =
  | 'HUBSPOT_DEFINED' // Standard HubSpot associations
  | 'USER_DEFINED' // Custom associations created by users
  | 'INTEGRATOR_DEFINED'; // Associations created by integrations

/**
 * Standard HubSpot-defined association type IDs
 */
export enum StandardAssociationTypeId {
  // Contact associations
  CONTACT_TO_COMPANY = 1,
  COMPANY_TO_CONTACT = 2,
  CONTACT_TO_DEAL = 3,
  DEAL_TO_CONTACT = 4,
  CONTACT_TO_TICKET = 15,
  TICKET_TO_CONTACT = 16,
  CONTACT_TO_ENGAGEMENT = 81,
  ENGAGEMENT_TO_CONTACT = 82,

  // Company associations
  COMPANY_TO_DEAL = 5,
  DEAL_TO_COMPANY = 6,
  COMPANY_TO_ENGAGEMENT = 83,
  ENGAGEMENT_TO_COMPANY = 84,
  COMPANY_TO_TICKET = 25,
  TICKET_TO_COMPANY = 26,

  // Deal associations
  DEAL_TO_LINE_ITEM = 19,
  LINE_ITEM_TO_DEAL = 20,
  DEAL_TO_ENGAGEMENT = 85,
  ENGAGEMENT_TO_DEAL = 86,
  DEAL_TO_TICKET = 27,
  TICKET_TO_DEAL = 28,

  // Ticket associations
  TICKET_TO_ENGAGEMENT = 87,
  ENGAGEMENT_TO_TICKET = 88,

  // Quote associations
  QUOTE_TO_LINE_ITEM = 67,
  LINE_ITEM_TO_QUOTE = 68,
  QUOTE_TO_DEAL = 63,
  DEAL_TO_QUOTE = 64,
  QUOTE_TO_CONTACT = 69,
  CONTACT_TO_QUOTE = 70,
  QUOTE_TO_COMPANY = 71,
  COMPANY_TO_QUOTE = 72,

  // Parent/Child relationships
  PARENT_COMPANY = 13,
  CHILD_COMPANY = 14,
  PARENT_ACCOUNT = 273,
  CHILD_ACCOUNT = 274,
}

/**
 * Input for creating an association
 */
export interface AssociationInput {
  /** Source object ID */
  fromId: string;

  /** Target object ID */
  toId: string;

  /** Association type ID or name */
  associationType: string | number;

  /** Association category (default: HUBSPOT_DEFINED) */
  associationCategory?: AssociationCategory;

  /** Numeric type ID (alternative to associationType) */
  typeId?: number;
}

/**
 * Batch association input
 */
export interface BatchAssociationInput {
  /** Source object reference */
  from: AssociationObjectRef;

  /** Target object reference */
  to: AssociationObjectRef;

  /** Association type specification */
  type: AssociationTypeSpec;
}

/**
 * Object reference for associations
 */
export interface AssociationObjectRef {
  /** Object ID */
  id: string;
}

/**
 * Association type specification
 */
export interface AssociationTypeSpec {
  /** Association category */
  associationCategory: AssociationCategory;

  /** Association type ID */
  associationTypeId: number;
}

/**
 * Association label
 */
export interface AssociationLabel {
  /** Label ID */
  id: string;

  /** Label name */
  label: string;

  /** Category */
  category: AssociationCategory;

  /** Type ID */
  typeId: number;
}

/**
 * Request to create associations in batch
 */
export interface BatchCreateAssociationsRequest {
  /** Array of associations to create */
  inputs: BatchAssociationInput[];
}

/**
 * Request to delete associations in batch
 */
export interface BatchDeleteAssociationsRequest {
  /** Array of associations to delete */
  inputs: BatchAssociationInput[];
}

/**
 * Result from batch association operations
 */
export interface BatchAssociationResult {
  /** Successfully processed associations */
  results: AssociationResult[];

  /** Errors encountered */
  errors?: AssociationError[];

  /** Overall status */
  status: 'COMPLETE' | 'PARTIAL' | 'FAILED';

  /** Timestamp */
  completedAt: Date;
}

/**
 * Individual association result
 */
export interface AssociationResult {
  /** Source object ID */
  fromObjectId: string;

  /** Target object ID */
  toObjectId: string;

  /** Association type */
  associationType: AssociationType;
}

/**
 * Association operation error
 */
export interface AssociationError {
  /** Error message */
  message: string;

  /** Error category */
  category: string;

  /** Source object ID (if available) */
  fromObjectId?: string;

  /** Target object ID (if available) */
  toObjectId?: string;

  /** HTTP status */
  status?: string;
}

/**
 * Association schema definition
 */
export interface AssociationSchema {
  /** From object type */
  fromObjectType: ObjectType;

  /** To object type */
  toObjectType: ObjectType;

  /** Available association types */
  associationTypes: AssociationType[];
}

/**
 * Get associations options
 */
export interface GetAssociationsOptions {
  /** Limit number of results */
  limit?: number;

  /** Pagination cursor */
  after?: string;
}

/**
 * Association list result
 */
export interface AssociationList {
  /** List of associations */
  results: Association[];

  /** Pagination info */
  paging?: {
    next?: {
      after: string;
      link?: string;
    };
  };
}

/**
 * Association definition for creating objects with associations
 */
export interface ObjectAssociationDefinition {
  /** Target object */
  to: {
    id: string;
  };

  /** Association types to create */
  types: AssociationTypeSpec[];
}

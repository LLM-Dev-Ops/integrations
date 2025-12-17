/**
 * HubSpot CRM Object Types
 * Type definitions for CRM objects (Contacts, Companies, Deals, Tickets, etc.)
 */

/**
 * Standard HubSpot CRM object types
 */
export type ObjectType =
  | 'contacts'
  | 'companies'
  | 'deals'
  | 'tickets'
  | 'products'
  | 'line_items'
  | 'quotes'
  | 'notes'
  | 'emails'
  | 'calls'
  | 'meetings'
  | 'tasks'
  | string; // Allow custom object types

/**
 * Base CRM object structure
 */
export interface CrmObject {
  /** Unique object ID */
  id: string;

  /** Object type */
  type: ObjectType;

  /** Object properties (key-value pairs) */
  properties: Properties;

  /** Creation timestamp */
  createdAt: Date;

  /** Last update timestamp */
  updatedAt: Date;

  /** Whether the object is archived */
  archived: boolean;

  /** Associated objects (if requested) */
  associations?: Record<ObjectType, Association[]>;
}

/**
 * Object properties as key-value pairs
 * Note: undefined is included to allow optional properties in extending interfaces
 */
export type Properties = Record<string, string | number | boolean | null | undefined>;

/**
 * Options for retrieving objects
 */
export interface GetOptions {
  /** Specific properties to return */
  properties?: string[];

  /** Associated object types to include */
  associations?: ObjectType[];

  /** Whether to include archived objects */
  archived?: boolean;

  /** Whether to include property history */
  propertiesWithHistory?: string[];
}

/**
 * Object reference (type + ID)
 */
export interface ObjectRef {
  /** Object type */
  type: ObjectType;

  /** Object ID */
  id: string;
}

/**
 * Input for creating a new object
 */
export interface CreateInput {
  /** Properties for the new object */
  properties: Properties;

  /** Optional associations to create */
  associations?: AssociationInput[];
}

/**
 * Input for updating an existing object
 */
export interface UpdateInput {
  /** Object ID to update */
  id: string;

  /** Properties to update */
  properties: Properties;
}

/**
 * Association input for creating associations
 */
export interface AssociationInput {
  /** Source object ID */
  fromId?: string;

  /** Target object ID */
  toId: string;

  /** Association type ID or name */
  associationType: string;

  /** Association category (default: "HUBSPOT_DEFINED") */
  associationCategory?: 'HUBSPOT_DEFINED' | 'USER_DEFINED' | 'INTEGRATOR_DEFINED';

  /** Numeric association type ID */
  typeId?: number;
}

/**
 * Association between objects
 */
export interface Association {
  /** Target object ID */
  toObjectId: string;

  /** Target object type */
  toObjectType: ObjectType;

  /** Association type identifiers */
  associationTypes: string[];

  /** Association labels */
  labels?: string[];
}

/**
 * Standard contact properties
 */
export interface ContactProperties extends Properties {
  email?: string;
  firstname?: string;
  lastname?: string;
  phone?: string;
  company?: string;
  website?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  lifecyclestage?: string;
  hs_lead_status?: string;
  jobtitle?: string;
}

/**
 * Standard company properties
 */
export interface CompanyProperties extends Properties {
  name?: string;
  domain?: string;
  industry?: string;
  phone?: string;
  city?: string;
  state?: string;
  country?: string;
  numberofemployees?: number | string;
  annualrevenue?: number | string;
  description?: string;
  type?: string;
  website?: string;
  linkedin_company_page?: string;
}

/**
 * Standard deal properties
 */
export interface DealProperties extends Properties {
  dealname?: string;
  amount?: number | string;
  closedate?: string;
  pipeline?: string;
  dealstage?: string;
  dealtype?: string;
  description?: string;
  hubspot_owner_id?: string;
  hs_priority?: string;
  hs_forecast_probability?: number | string;
  hs_forecast_amount?: number | string;
}

/**
 * Standard ticket properties
 */
export interface TicketProperties extends Properties {
  subject?: string;
  content?: string;
  hs_pipeline?: string;
  hs_pipeline_stage?: string;
  hs_ticket_priority?: 'LOW' | 'MEDIUM' | 'HIGH';
  hs_ticket_category?: string;
  hubspot_owner_id?: string;
  source_type?: string;
  createdate?: string;
  hs_resolution?: string;
}

/**
 * Product properties
 */
export interface ProductProperties extends Properties {
  name?: string;
  description?: string;
  price?: number | string;
  hs_sku?: string;
  hs_cost_of_goods_sold?: number | string;
  hs_recurring_billing_period?: string;
  hs_product_type?: string;
}

/**
 * Line item properties
 */
export interface LineItemProperties extends Properties {
  name?: string;
  hs_product_id?: string;
  quantity?: number | string;
  price?: number | string;
  amount?: number | string;
  discount?: number | string;
  tax?: number | string;
  description?: string;
}

/**
 * Quote properties
 */
export interface QuoteProperties extends Properties {
  hs_title?: string;
  hs_expiration_date?: string;
  hs_status?: string;
  hs_public_url_key?: string;
  hs_domain?: string;
  hs_quote_amount?: number | string;
}

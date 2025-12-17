/**
 * HubSpot Pipeline and Stage Types
 * Type definitions for deal and ticket pipelines and their stages
 */

/**
 * Pipeline object type
 */
export type PipelineObjectType = 'deals' | 'tickets';

/**
 * Pipeline definition
 */
export interface Pipeline {
  /** Unique pipeline ID */
  id: string;

  /** Pipeline label/name */
  label: string;

  /** Display order */
  displayOrder: number;

  /** Pipeline stages */
  stages: PipelineStage[];

  /** Whether this is archived */
  archived?: boolean;

  /** Created timestamp */
  createdAt?: Date;

  /** Updated timestamp */
  updatedAt?: Date;
}

/**
 * Pipeline stage definition
 */
export interface PipelineStage {
  /** Unique stage ID */
  id: string;

  /** Stage label/name */
  label: string;

  /** Display order within pipeline */
  displayOrder: number;

  /** Stage metadata */
  metadata: StageMetadata;

  /** Whether this is archived */
  archived?: boolean;

  /** Created timestamp */
  createdAt?: Date;

  /** Updated timestamp */
  updatedAt?: Date;

  /** Stage probability (for deals, 0-1) */
  probability?: number;

  /** Whether this is a closed/won stage */
  isClosed?: boolean;
}

/**
 * Stage metadata with additional configuration
 */
export interface StageMetadata {
  /** Probability of closing (0-1) */
  probability?: string;

  /** Whether this is a closed stage */
  isClosed?: string;

  /** Ticket state (for ticket pipelines) */
  ticketState?: TicketState;

  /** Custom metadata fields */
  [key: string]: string | undefined;
}

/**
 * Ticket state for ticket pipeline stages
 */
export type TicketState = 'OPEN' | 'CLOSED' | 'WAITING';

/**
 * Deal pipeline stages (standard)
 */
export enum DealStage {
  APPOINTMENT_SCHEDULED = 'appointmentscheduled',
  QUALIFIED_TO_BUY = 'qualifiedtobuy',
  PRESENTATION_SCHEDULED = 'presentationscheduled',
  DECISION_MAKER_BOUGHT_IN = 'decisionmakerboughtin',
  CONTRACT_SENT = 'contractsent',
  CLOSED_WON = 'closedwon',
  CLOSED_LOST = 'closedlost',
}

/**
 * Ticket pipeline stages (standard)
 */
export enum TicketStage {
  NEW = 'new',
  WAITING_ON_CONTACT = 'waitingoncontact',
  WAITING_ON_US = 'waitingonus',
  CLOSED = 'closed',
}

/**
 * Input for creating a pipeline
 */
export interface CreatePipelineInput {
  /** Pipeline label */
  label: string;

  /** Display order */
  displayOrder?: number;

  /** Initial stages */
  stages: CreateStageInput[];
}

/**
 * Input for creating a stage
 */
export interface CreateStageInput {
  /** Stage label */
  label: string;

  /** Display order */
  displayOrder: number;

  /** Stage metadata */
  metadata: StageMetadata;
}

/**
 * Input for updating a pipeline
 */
export interface UpdatePipelineInput {
  /** Updated label */
  label?: string;

  /** Updated display order */
  displayOrder?: number;

  /** Whether to archive */
  archived?: boolean;
}

/**
 * Input for updating a stage
 */
export interface UpdateStageInput {
  /** Updated label */
  label?: string;

  /** Updated display order */
  displayOrder?: number;

  /** Updated metadata */
  metadata?: Partial<StageMetadata>;

  /** Whether to archive */
  archived?: boolean;
}

/**
 * Pipeline audit information
 */
export interface PipelineAudit {
  /** Portal ID */
  portalId: number;

  /** User ID who made the change */
  userId: number;

  /** Timestamp of change */
  timestamp: Date;

  /** Type of change */
  changeType: 'CREATED' | 'UPDATED' | 'DELETED' | 'ARCHIVED' | 'RESTORED';

  /** Changed fields */
  changes?: Record<string, { from: unknown; to: unknown }>;
}

/**
 * Pipeline settings
 */
export interface PipelineSettings {
  /** Object type for this pipeline */
  objectType: PipelineObjectType;

  /** Default pipeline ID */
  defaultPipelineId?: string;

  /** Whether multiple pipelines are enabled */
  multiplePipelinesEnabled: boolean;

  /** Pipeline visibility settings */
  visibility?: PipelineVisibility;
}

/**
 * Pipeline visibility configuration
 */
export interface PipelineVisibility {
  /** Whether visible to all users */
  visibleToAll: boolean;

  /** User IDs with access (if not visible to all) */
  userIds?: number[];

  /** Team IDs with access */
  teamIds?: number[];
}

/**
 * Pipeline statistics
 */
export interface PipelineStatistics {
  /** Pipeline ID */
  pipelineId: string;

  /** Total objects in pipeline */
  totalObjects: number;

  /** Total value (for deals) */
  totalValue?: number;

  /** Stage breakdown */
  stageBreakdown: StageStatistics[];

  /** Average time in pipeline (days) */
  averageTimeInPipeline?: number;

  /** Win rate (for deals, 0-1) */
  winRate?: number;
}

/**
 * Stage-level statistics
 */
export interface StageStatistics {
  /** Stage ID */
  stageId: string;

  /** Number of objects in stage */
  count: number;

  /** Total value in stage (for deals) */
  value?: number;

  /** Average time in stage (days) */
  averageTimeInStage?: number;

  /** Conversion rate to next stage (0-1) */
  conversionRate?: number;
}

/**
 * Pipeline move operation
 */
export interface PipelineMove {
  /** Object ID being moved */
  objectId: string;

  /** Source pipeline ID */
  fromPipelineId?: string;

  /** Source stage ID */
  fromStageId?: string;

  /** Target pipeline ID */
  toPipelineId: string;

  /** Target stage ID */
  toStageId: string;

  /** Timestamp of move */
  movedAt?: Date;
}

/**
 * CloudWatch Logs Services
 *
 * Service layer implementations for CloudWatch Logs operations.
 *
 * @module services
 */

// Base service
export { BaseService } from './base.js';

// Log Events Service
export {
  LogEventsService,
  LogEventsServiceImpl,
  createLogEventsService,
} from './logEvents.js';

// Insights Service
export {
  InsightsService,
  InsightsServiceImpl,
  InsightsApiClient,
} from './insights.js';

// Log Groups Service
export type { LogGroupsService } from './logGroups.js';
export { DefaultLogGroupsService } from './logGroups.js';

// Log Streams Service
export type { LogStreamsService } from './logStreams.js';
export { DefaultLogStreamsService } from './logStreams.js';

// Retention Service
export type { RetentionService } from './retention.js';
export {
  DefaultRetentionService,
  validateRetentionDays,
  getValidRetentionDays,
} from './retention.js';

// Re-export types for convenience
export type {
  PutLogEventsRequest,
  PutLogEventsResponse,
  GetLogEventsRequest,
  GetLogEventsResponse,
  FilterLogEventsRequest,
  FilterLogEventsResponse,
  StructuredLogEvent,
  FilteredLogEvent,
} from '../types/index.js';

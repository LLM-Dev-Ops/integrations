/**
 * Operations Index
 *
 * Export all CRM operations
 */

// Object operations
export {
  createObject,
  getObject,
  updateObject,
  deleteObject,
  isValidObjectType,
  parseObjectResponse,
} from './objects.js';
export type { RequestExecutor, RequestOptions } from './objects.js';

// Batch operations
export {
  batchCreate,
  batchRead,
  batchUpdate,
  batchArchive,
  splitIntoChunks,
  parseBatchResponse,
} from './batch.js';

// Search operations
export {
  searchObjects,
  searchAll,
  searchByProperty,
  searchByEmail,
  searchByDomain,
  buildSearchBody,
  parseSearchResponse,
  MAX_SEARCH_LIMIT,
} from './search.js';

// Association operations
export {
  createAssociation,
  getAssociations,
  deleteAssociation,
  batchAssociate,
  batchDisassociate,
  getAllAssociations,
  ASSOCIATION_TYPES,
} from './associations.js';

// Pipeline operations
export {
  getPipelines,
  getPipeline,
  getPipelineStages,
  moveToPipelineStage,
  getCurrentPipelineStage,
  validatePipelineStage,
} from './pipelines.js';
export type { PipelineObjectType } from './pipelines.js';

// Engagement operations
export {
  createEngagement,
  getEngagement,
  updateEngagement,
  deleteEngagement,
  createNote,
  createTask,
  logCall,
} from './engagements.js';

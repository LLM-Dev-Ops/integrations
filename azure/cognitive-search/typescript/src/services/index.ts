/**
 * Azure Cognitive Search Services
 *
 * Re-exports all service implementations.
 */

export { SearchService, createSearchService } from './search.js';
export { DocumentService, createDocumentService, hasFailures, getFailedKeys, throwIfPartialFailure } from './documents.js';
export { IndexService, createIndexService } from './indexes.js';

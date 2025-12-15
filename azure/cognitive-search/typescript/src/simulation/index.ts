/**
 * Azure Cognitive Search Simulation
 *
 * Re-exports all simulation components.
 */

export type {
  SerializedRequest,
  SerializedResponse,
  RecordedInteraction,
  SimulationFile,
  MatchingMode,
  SimulationConfig,
} from './types.js';

export type { SearchPattern } from './mock.js';

export {
  MockAcsClient,
  MockSearchService,
  MockDocumentService,
  MockResponseBuilder,
  createMockClient,
  mockSearchResult,
  mockSearchResults,
} from './mock.js';

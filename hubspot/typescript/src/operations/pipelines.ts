/**
 * Pipeline Operations
 *
 * Read pipelines and stages, move deals/tickets through stages
 */

import type { ObjectType } from '../types/objects.js';
import type { Pipeline, PipelineStage } from '../types/pipelines.js';
import type { RequestExecutor } from './objects.js';
import { updateObject } from './objects.js';

/**
 * Object types that support pipelines
 */
export type PipelineObjectType = 'deals' | 'tickets';

/**
 * API response for listing pipelines
 */
interface PipelinesApiResponse {
  results: Array<{
    id: string;
    label: string;
    displayOrder: number;
    stages: Array<{
      id: string;
      label: string;
      displayOrder: number;
      metadata?: Record<string, unknown>;
    }>;
  }>;
}

/**
 * Get all pipelines for a given object type
 */
export async function getPipelines(
  executor: RequestExecutor,
  apiVersion: string,
  objectType: PipelineObjectType
): Promise<Pipeline[]> {
  const endpoint = `/crm/${apiVersion}/pipelines/${objectType}`;

  const response = await executor.executeRequest<PipelinesApiResponse>({
    method: 'GET',
    endpoint,
    operation: 'getPipelines',
  });

  return response.results.map((p) => ({
    id: p.id,
    label: p.label,
    displayOrder: p.displayOrder,
    stages: p.stages.map((s) => ({
      id: s.id,
      label: s.label,
      displayOrder: s.displayOrder,
      metadata: s.metadata ?? {},
    })),
  }));
}

/**
 * Get a specific pipeline by ID
 */
export async function getPipeline(
  executor: RequestExecutor,
  apiVersion: string,
  objectType: PipelineObjectType,
  pipelineId: string
): Promise<Pipeline | null> {
  const endpoint = `/crm/${apiVersion}/pipelines/${objectType}/${pipelineId}`;

  try {
    const response = await executor.executeRequest<{
      id: string;
      label: string;
      displayOrder: number;
      stages: Array<{
        id: string;
        label: string;
        displayOrder: number;
        metadata?: Record<string, unknown>;
      }>;
    }>({
      method: 'GET',
      endpoint,
      operation: 'getPipeline',
    });

    return {
      id: response.id,
      label: response.label,
      displayOrder: response.displayOrder,
      stages: response.stages.map((s) => ({
        id: s.id,
        label: s.label,
        displayOrder: s.displayOrder,
        metadata: s.metadata ?? {},
      })),
    };
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Get stages for a specific pipeline
 */
export async function getPipelineStages(
  executor: RequestExecutor,
  apiVersion: string,
  objectType: PipelineObjectType,
  pipelineId: string
): Promise<PipelineStage[]> {
  const pipeline = await getPipeline(executor, apiVersion, objectType, pipelineId);

  if (!pipeline) {
    throw new Error(`Pipeline not found: ${pipelineId}`);
  }

  return pipeline.stages;
}

/**
 * Move a deal or ticket to a specific pipeline stage
 */
export async function moveToPipelineStage(
  executor: RequestExecutor,
  apiVersion: string,
  objectType: PipelineObjectType,
  objectId: string,
  pipelineId: string,
  stageId: string
): Promise<void> {
  // Different property names for deals vs tickets
  const properties =
    objectType === 'deals'
      ? { pipeline: pipelineId, dealstage: stageId }
      : { hs_pipeline: pipelineId, hs_pipeline_stage: stageId };

  await updateObject(executor, apiVersion, objectType, objectId, properties);
}

/**
 * Get the current pipeline stage for a deal or ticket
 */
export async function getCurrentPipelineStage(
  executor: RequestExecutor,
  apiVersion: string,
  objectType: PipelineObjectType,
  objectId: string
): Promise<{ pipelineId: string; stageId: string } | null> {
  const endpoint = `/crm/${apiVersion}/objects/${objectType}/${objectId}`;

  const properties =
    objectType === 'deals'
      ? 'pipeline,dealstage'
      : 'hs_pipeline,hs_pipeline_stage';

  try {
    const response = await executor.executeRequest<{
      properties: Record<string, string>;
    }>({
      method: 'GET',
      endpoint,
      params: { properties },
      operation: 'getCurrentPipelineStage',
    });

    const pipelineId =
      objectType === 'deals'
        ? response.properties.pipeline
        : response.properties.hs_pipeline;

    const stageId =
      objectType === 'deals'
        ? response.properties.dealstage
        : response.properties.hs_pipeline_stage;

    if (!pipelineId || !stageId) {
      return null;
    }

    return { pipelineId, stageId };
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Validate that a stage exists in a pipeline
 */
export async function validatePipelineStage(
  executor: RequestExecutor,
  apiVersion: string,
  objectType: PipelineObjectType,
  pipelineId: string,
  stageId: string
): Promise<boolean> {
  const stages = await getPipelineStages(executor, apiVersion, objectType, pipelineId);
  return stages.some((s) => s.id === stageId);
}

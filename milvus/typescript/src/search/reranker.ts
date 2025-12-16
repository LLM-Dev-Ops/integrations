import { SearchHits, iterateSearchHits, RerankStrategy } from '../types/search.js';
import { FieldValue } from '../types/entity.js';

/**
 * Rerank search results using the specified strategy.
 */
export function rerankResults(
  results: SearchHits[],
  strategy: RerankStrategy,
  topK: number
): SearchHits {
  switch (strategy.type) {
    case 'rrf':
      return rrfFusion(results, strategy.k, topK);
    case 'weightedSum':
      return weightedFusion(results, strategy.weights, topK);
    case 'maxScore':
      return maxScoreFusion(results, topK);
    default:
      throw new Error(`Unknown rerank strategy: ${(strategy as RerankStrategy).type}`);
  }
}

/**
 * Reciprocal Rank Fusion (RRF) reranking.
 * Combines results using: score = sum(1 / (k + rank)) for each result set
 */
export function rrfFusion(
  results: SearchHits[],
  k: number = 60,
  topK: number = 10
): SearchHits {
  const scores = new Map<string, number>();
  const fieldsMap = new Map<string, Record<string, FieldValue>>();

  for (const result of results) {
    let rank = 0;
    for (const hit of iterateSearchHits(result)) {
      const idStr = hit.id.toString();
      const rrfScore = 1.0 / (k + rank + 1);

      const existingScore = scores.get(idStr) ?? 0;
      scores.set(idStr, existingScore + rrfScore);

      // Store fields if not already stored
      if (!fieldsMap.has(idStr) && hit.fields) {
        fieldsMap.set(idStr, hit.fields);
      }

      rank++;
    }
  }

  return buildSortedResults(scores, fieldsMap, topK);
}

/**
 * Weighted sum fusion reranking.
 * Combines results using weighted sum of normalized scores.
 */
export function weightedFusion(
  results: SearchHits[],
  weights: number[],
  topK: number = 10
): SearchHits {
  if (weights.length !== results.length) {
    throw new Error('Number of weights must match number of results');
  }

  const scores = new Map<string, number>();
  const fieldsMap = new Map<string, Record<string, FieldValue>>();

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const weight = weights[i];

    if (!result || weight === undefined) continue;

    for (const hit of iterateSearchHits(result)) {
      const idStr = hit.id.toString();
      const weightedScore = hit.score * weight;

      const existingScore = scores.get(idStr) ?? 0;
      scores.set(idStr, existingScore + weightedScore);

      if (!fieldsMap.has(idStr) && hit.fields) {
        fieldsMap.set(idStr, hit.fields);
      }
    }
  }

  return buildSortedResults(scores, fieldsMap, topK);
}

/**
 * Max score fusion reranking.
 * Uses the maximum score from any result set for each document.
 */
export function maxScoreFusion(
  results: SearchHits[],
  topK: number = 10
): SearchHits {
  const scores = new Map<string, number>();
  const fieldsMap = new Map<string, Record<string, FieldValue>>();

  for (const result of results) {
    for (const hit of iterateSearchHits(result)) {
      const idStr = hit.id.toString();
      const existingScore = scores.get(idStr) ?? 0;
      scores.set(idStr, Math.max(existingScore, hit.score));

      if (!fieldsMap.has(idStr) && hit.fields) {
        fieldsMap.set(idStr, hit.fields);
      }
    }
  }

  return buildSortedResults(scores, fieldsMap, topK);
}

/**
 * Build sorted results from score and fields maps.
 */
function buildSortedResults(
  scores: Map<string, number>,
  fieldsMap: Map<string, Record<string, FieldValue>>,
  topK: number
): SearchHits {
  // Sort by score descending
  const sorted = Array.from(scores.entries()).sort((a, b) => b[1] - a[1]);

  // Take top K
  const topResults = sorted.slice(0, topK);

  // Build result
  const ids: bigint[] = [];
  const resultScores: number[] = [];
  const fields: Record<string, FieldValue>[] = [];

  for (const [idStr, score] of topResults) {
    ids.push(BigInt(idStr));
    resultScores.push(score);
    fields.push(fieldsMap.get(idStr) ?? {});
  }

  return { ids, scores: resultScores, fields };
}

/**
 * Normalize scores to [0, 1] range using min-max normalization.
 */
export function normalizeScores(hits: SearchHits): SearchHits {
  if (hits.scores.length === 0) {
    return hits;
  }

  const minScore = Math.min(...hits.scores);
  const maxScore = Math.max(...hits.scores);
  const range = maxScore - minScore;

  if (range === 0) {
    // All scores are the same, normalize to 1
    return {
      ...hits,
      scores: hits.scores.map(() => 1),
    };
  }

  return {
    ...hits,
    scores: hits.scores.map((score) => (score - minScore) / range),
  };
}

/**
 * Filter results by minimum score threshold.
 */
export function filterByScore(hits: SearchHits, minScore: number): SearchHits {
  const ids: bigint[] = [];
  const scores: number[] = [];
  const fields: Record<string, FieldValue>[] = [];

  for (let i = 0; i < hits.ids.length; i++) {
    const score = hits.scores[i];
    if (score !== undefined && score >= minScore) {
      const id = hits.ids[i];
      if (id !== undefined) {
        ids.push(id);
        scores.push(score);
        fields.push(hits.fields[i] ?? {});
      }
    }
  }

  return { ids, scores, fields };
}

/**
 * Truncate results to specified count.
 */
export function truncateResults(hits: SearchHits, count: number): SearchHits {
  return {
    ids: hits.ids.slice(0, count),
    scores: hits.scores.slice(0, count),
    fields: hits.fields.slice(0, count),
  };
}

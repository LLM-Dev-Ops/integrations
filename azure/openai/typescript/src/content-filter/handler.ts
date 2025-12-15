/**
 * Content Filter Handler
 *
 * Extracts and processes Azure AI Content Safety filter results.
 */

import type {
  ContentFilterResults,
  ContentFilterSeverity,
  PromptFilterResult,
} from '../types/index.js';

/** Content filter status summary */
export interface ContentFilterStatus {
  /** Whether any content was filtered */
  filtered: boolean;
  /** Categories that triggered filtering */
  filteredCategories: string[];
  /** Highest severity detected */
  highestSeverity: ContentFilterSeverity | null;
  /** Whether jailbreak attempt was detected */
  jailbreakDetected: boolean;
  /** Whether protected material was detected */
  protectedMaterialDetected: boolean;
}

/**
 * Severity order for comparison
 */
const SEVERITY_ORDER: Record<ContentFilterSeverity, number> = {
  safe: 0,
  low: 1,
  medium: 2,
  high: 3,
};

/**
 * Extracts content filter results from a chat response
 */
export function extractContentFilterResults(response: unknown): ContentFilterResults | undefined {
  if (!response || typeof response !== 'object') {
    return undefined;
  }

  const resp = response as Record<string, unknown>;

  // Check choices for content_filter_results
  if (Array.isArray(resp.choices) && resp.choices.length > 0) {
    const choice = resp.choices[0] as Record<string, unknown>;
    if (choice.content_filter_results) {
      return normalizeContentFilterResults(choice.content_filter_results);
    }
  }

  return undefined;
}

/**
 * Extracts prompt filter results from a response
 */
export function extractPromptFilterResults(response: unknown): PromptFilterResult[] | undefined {
  if (!response || typeof response !== 'object') {
    return undefined;
  }

  const resp = response as Record<string, unknown>;

  if (Array.isArray(resp.prompt_filter_results)) {
    return resp.prompt_filter_results.map((result: Record<string, unknown>) => ({
      promptIndex: result.prompt_index as number,
      contentFilterResults: normalizeContentFilterResults(result.content_filter_results),
    }));
  }

  return undefined;
}

/**
 * Normalizes content filter results from API format to internal format
 */
function normalizeContentFilterResults(raw: unknown): ContentFilterResults {
  if (!raw || typeof raw !== 'object') {
    return {};
  }

  const data = raw as Record<string, unknown>;
  const results: ContentFilterResults = {};

  // Standard categories - process each explicitly to avoid type issues
  const parseCategory = (categoryData: unknown): { filtered: boolean; severity: ContentFilterSeverity } | undefined => {
    if (categoryData && typeof categoryData === 'object') {
      const cat = categoryData as Record<string, unknown>;
      return {
        filtered: cat.filtered === true,
        severity: (cat.severity as ContentFilterSeverity) ?? 'safe',
      };
    }
    return undefined;
  };

  const hate = parseCategory(data.hate);
  if (hate) results.hate = hate;

  const selfHarm = parseCategory(data.self_harm);
  if (selfHarm) results.selfHarm = selfHarm;

  const sexual = parseCategory(data.sexual);
  if (sexual) results.sexual = sexual;

  const violence = parseCategory(data.violence);
  if (violence) results.violence = violence;

  const profanity = parseCategory(data.profanity);
  if (profanity) results.profanity = profanity;

  // Jailbreak detection
  if (data.jailbreak && typeof data.jailbreak === 'object') {
    const jb = data.jailbreak as Record<string, unknown>;
    results.jailbreak = {
      filtered: jb.filtered === true,
      detected: jb.detected === true,
    };
  }

  // Protected material - text
  if (data.protected_material_text && typeof data.protected_material_text === 'object') {
    const pmt = data.protected_material_text as Record<string, unknown>;
    results.protectedMaterialText = {
      filtered: pmt.filtered === true,
      detected: pmt.detected === true,
    };
  }

  // Protected material - code
  if (data.protected_material_code && typeof data.protected_material_code === 'object') {
    const pmc = data.protected_material_code as Record<string, unknown>;
    results.protectedMaterialCode = {
      filtered: pmc.filtered === true,
      detected: pmc.detected === true,
      citation: pmc.citation as { url?: string; license?: string } | undefined,
    };
  }

  return results;
}

/**
 * Analyzes content filter results and returns a summary
 */
export function analyzeContentFilterResults(results: ContentFilterResults): ContentFilterStatus {
  const status: ContentFilterStatus = {
    filtered: false,
    filteredCategories: [],
    highestSeverity: null,
    jailbreakDetected: false,
    protectedMaterialDetected: false,
  };

  // Check standard categories
  const categoryKeys = ['hate', 'selfHarm', 'sexual', 'violence', 'profanity'] as const;

  for (const key of categoryKeys) {
    const category = results[key];
    if (category) {
      if (category.filtered) {
        status.filtered = true;
        status.filteredCategories.push(key);
      }

      if (status.highestSeverity === null ||
          SEVERITY_ORDER[category.severity] > SEVERITY_ORDER[status.highestSeverity]) {
        status.highestSeverity = category.severity;
      }
    }
  }

  // Check jailbreak
  if (results.jailbreak) {
    status.jailbreakDetected = results.jailbreak.detected;
    if (results.jailbreak.filtered) {
      status.filtered = true;
      status.filteredCategories.push('jailbreak');
    }
  }

  // Check protected material
  if (results.protectedMaterialText?.detected || results.protectedMaterialCode?.detected) {
    status.protectedMaterialDetected = true;
  }
  if (results.protectedMaterialText?.filtered) {
    status.filtered = true;
    status.filteredCategories.push('protectedMaterialText');
  }
  if (results.protectedMaterialCode?.filtered) {
    status.filtered = true;
    status.filteredCategories.push('protectedMaterialCode');
  }

  return status;
}

/**
 * Checks if content filter results indicate blocking
 */
export function isContentBlocked(results: ContentFilterResults): boolean {
  return analyzeContentFilterResults(results).filtered;
}

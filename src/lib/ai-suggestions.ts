/**
 * Client-safe contract for President Step 2 / Step 3 AI draft suggestions.
 *
 * AI is advisory only. It never writes to an input field, never saves, and
 * never submits. Every suggestion is derived exclusively from the evidence of
 * the current evaluation (factor ratings A–J, supervisor remarks, calculated
 * score) — never from other employees, other cycles or outside knowledge.
 */

/** Which A–J factors feed a given Step 2 / Step 3 field. */
export type FactorSelection = "ALL" | "STRENGTHS" | "WEAKNESSES";

export type AiFieldMapping = {
  /** Human description of the mapping, shown in the evidence panel. */
  purpose: string;
  factors: FactorSelection;
};

/**
 * Explicit field mapping keyed by the immutable `president_step_items.code`.
 * A field that is not listed here has no AI mapping and must not offer an AI
 * suggestion button.
 */
export const AI_FIELD_MAPPINGS: Record<string, AiFieldMapping> = {
  S2_STRENGTHS: {
    purpose: "Summarize the employee's principal strengths from the highest-rated factors.",
    factors: "STRENGTHS",
  },
  S2_WEAKNESSES: {
    purpose: "Summarize the employee's principal weaknesses from the lowest-rated factors.",
    factors: "WEAKNESSES",
  },
  S2_EFFECTIVENESS: {
    purpose: "Suggest what the employee should do to be more effective, based on the lowest-rated factors.",
    factors: "WEAKNESSES",
  },
  S2_GROWTH_SUGGESTIONS: {
    purpose: "Suggest ways to accelerate growth and development, based on the lowest-rated factors.",
    factors: "WEAKNESSES",
  },
  S2_OVERALL_EXPLANATION: {
    purpose: "Explain the overall rating using the recorded factor ratings.",
    factors: "ALL",
  },
  S2_OTHER_COMMENTS: {
    purpose: "Draft additional advisory comments from the recorded evaluation evidence.",
    factors: "ALL",
  },
  S3_REVIEW_COMMENTS: {
    purpose: "Draft reviewing-supervisor comments from the recorded evaluation evidence.",
    factors: "ALL",
  },
};

export function hasAiMapping(code: string): boolean {
  return Object.prototype.hasOwnProperty.call(AI_FIELD_MAPPINGS, code);
}

export type AiEvidenceFactor = {
  letter: string;
  title: string;
  employeeRating: number | null;
  supervisorRating: number | null;
  presidentRating: number | null;
};

export type AiSuggestionEvidence = {
  employeeName: string;
  cycle: string;
  purpose: string;
  factors: AiEvidenceFactor[];
  supervisorRemarks: string;
  finalScore: number | null;
  finalRatingLabel: string | null;
};

export type AiSuggestionResult = {
  itemId: string;
  step: 2 | 3;
  suggestion: string;
  evidence: AiSuggestionEvidence;
  /** Present when employee and supervisor ratings disagree materially. */
  disagreementWarning: string | null;
  generatedAt: string;
  model: string;
};

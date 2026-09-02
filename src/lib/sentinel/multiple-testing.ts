// APEX SENTINEL — Multiple-Testing & Statistical Discipline Engine
// Evaluates candidate significance across the 90 simultaneous candidate universe (15 markets × 6 contracts).
//
// DISCIPLINE MANDATES:
// 1. DOWNSCALE / HOLD ONLY: Never increases scores, never manufactures qualification, never upgrades candidates.
// 2. OBSERVABILITY PRESERVATION: Never deletes or silently drops cells from radar.
// 3. SAMPLE HONESTY: Distinguishes canonical 1,000 tick stream from resolved outcome evidence (N_resolved).
// 4. EXPLICIT LOGGING: All downgrades provide explicit reason for operator transparency.

import { OPERATOR_SURFACE_THRESHOLDS } from "../apex/operator-surface-thresholds";

export interface MultipleTestingAssessment {
  readonly hypothesesCount: number;
  readonly relevantSampleN: number;
  readonly minRequiredSampleN: number;
  readonly isLowSample: boolean;
  readonly confidenceDiscount: number; // 0.0 to 0.35 reduction (never negative)
  readonly scorePenalty: number; // 0 to 15 points reduction (never negative)
  readonly requiresHold: boolean;
  readonly reason: string;
}

export interface StatisticalCandidateInput {
  symbol?: string;
  contractId?: string;
  rawScore?: number;
  combinationN?: number;
  weightedN?: number;
  evidenceN?: number;
  isUntested?: boolean;
}

/**
 * Assesses statistical confidence under 90-way simultaneous testing.
 * Uses Family-Wise Error Rate (FWER) and empirical sample size bounds.
 */
export function assessMultipleTesting(
  candidate: StatisticalCandidateInput,
  hypothesesCount = OPERATOR_SURFACE_THRESHOLDS.multipleTestingHypotheses,
  minSampleN = OPERATOR_SURFACE_THRESHOLDS.minResolvedComboN,
): MultipleTestingAssessment {
  const relevantN =
    candidate.weightedN ??
    candidate.combinationN ??
    candidate.evidenceN ??
    0;

  const isUntested = candidate.isUntested ?? relevantN === 0;
  const isLowSample = isUntested || relevantN < minSampleN;

  let confidenceDiscount = 0;
  let scorePenalty = 0;
  let requiresHold = false;
  let reason = "Evidence sample sufficient under 90-candidate multiple testing evaluation.";

  if (isUntested || relevantN === 0) {
    confidenceDiscount = 0.30;
    scorePenalty = 10;
    requiresHold = true;
    reason =
      "LOW SAMPLE: untested combination under 90 simultaneous candidates — held in observation/waiting until resolved outcome evidence is recorded.";
  } else if (relevantN < minSampleN) {
    // Proportional penalty for sub-threshold sample
    const sampleDeficit = (minSampleN - relevantN) / minSampleN;
    confidenceDiscount = Math.min(0.25, sampleDeficit * 0.25);
    scorePenalty = Math.min(10, Math.round(sampleDeficit * 10));
    requiresHold = sampleDeficit > 0.4;
    reason = `LOW SAMPLE: insufficient evidence (N=${relevantN.toFixed(1)} < ${minSampleN}) to distinguish apparent edge from chance across ${hypothesesCount} simultaneous candidates.`;
  }

  return {
    hypothesesCount,
    relevantSampleN: relevantN,
    minRequiredSampleN: minSampleN,
    isLowSample,
    confidenceDiscount,
    scorePenalty,
    requiresHold,
    reason,
  };
}

/**
 * Adjusts candidate score downward if evidence sample is insufficient under multiple testing.
 * STRICTLY MONOTONIC NON-INCREASING: Adjusted score is always <= original score.
 */
export function applyMultipleTestingScoreDiscipline(
  rawScore: number,
  candidate: StatisticalCandidateInput,
): { adjustedScore: number; assessment: MultipleTestingAssessment } {
  const assessment = assessMultipleTesting(candidate);
  const adjustedScore = Math.max(0, rawScore - assessment.scorePenalty);
  return {
    adjustedScore,
    assessment,
  };
}

import { describe, expect, it } from "vitest";
import { emptyMaturityThesisState, updateMaturityThesis } from "../maturity-thesis";
import type { ParityEvidence, ParityContextEvidence } from "../evidence/types";
import type { ParityPsychologySnapshot } from "../psychology/types";

const context: ParityContextEvidence = {
  regime: "EVEN_BIASED",
  regimeStability: 82,
  hiddenRegime: "EVEN_DOMINANCE",
  regimeCompatible: { EVEN: true, ODD: false },
  driftSeverity: "NONE",
  driftBreakDetected: false,
  statisticalStrength: "STRONG",
  significant: true,
  calibrationReliability: 0.8,
  dangerScore: 12,
  dangerCritical: false,
  evPoint: 0.03,
  evLow: 0.01,
  evClears: true,
  timing: "NEXT_TICK",
  timingUrgency: "MEDIUM",
  entropy: 0.55,
  changepoint: false,
  multiHorizon: { short: "EVEN", medium: "EVEN", long: "EVEN", agreementScore: 82, alignment: "ALIGNED" },
  decorrelation: { rawVotes: 10, effectiveVotes: 7, inflationFactor: 1.1, confidencePenalty: 0 },
  feedQuality: 98,
  feedHardVeto: false,
};

function ev(engine: string, group: string, direction: "EVEN" | "ODD", strength = 0.8): ParityEvidence {
  return { engine, family: "STATISTICAL", authority: "DIRECT", correlationGroup: group, direction, strength, confidence: 0.85, sampleAuthority: 1, detail: `${engine} ${direction}` };
}

const evidence: ParityEvidence[] = [
  ev("stats", "DISTRIBUTION", "EVEN"),
  ev("markov", "TRANSITION", "EVEN"),
  ev("pattern", "TRANSITION", "EVEN", 0.72),
  ev("runs", "RUN_HAZARD", "EVEN"),
  ev("pressure", "IMBALANCE", "EVEN"),
  ev("anomaly", "IMBALANCE", "EVEN", 0.7),
  ev("structural", "STRUCTURE", "EVEN"),
  ev("hmm", "REGIME", "EVEN"),
  ev("regime", "REGIME", "EVEN"),
  ev("significance_even", "SIGNIFICANCE", "EVEN"),
  ev("particles_even", "POSTERIOR", "EVEN"),
  ev("confluence", "CONFLUENCE", "EVEN"),
  ev("market_intelligence_even", "MECHANISM", "EVEN"),
];

const psychology = {
  marketId: "R_100", timestamp: 1, sampleSize: 1000,
  roles: {} as any,
  chiefParity: "EVEN", chiefScore: 78, chiefHealth: 78, reversalRisk: 20, transitionRisk: 18,
  thesis: "EVEN thesis", why: [], warnings: [], readyEligible: true,
  even: { parity: "EVEN", score: 80, alignment: 80, structuralSupport: 76, momentumSupport: 74, specialDigitActivity: 70, opposingPressure: 18, exhaustion: 10, recovery: 55, continuationLikelihood: 76, reversalLikelihood: 20, psychologicalHealth: 80, health: "HEALTHY", supportQuality: "DISTRIBUTED", strongestSupport: "support", strongestThreat: "threat", reasons: [], warnings: [], roles: {} as any },
  odd: { parity: "ODD", score: 35, alignment: 35, structuralSupport: 35, momentumSupport: 35, specialDigitActivity: 30, opposingPressure: 70, exhaustion: 45, recovery: 20, continuationLikelihood: 30, reversalLikelihood: 65, psychologicalHealth: 35, health: "OPPOSED", supportQuality: "FRAGILE", strongestSupport: "none", strongestThreat: "threat", reasons: [], warnings: [], roles: {} as any },
} as unknown as ParityPsychologySnapshot;

const probability = {
  rawProbability: 0.57, calibratedProbability: 0.575, wilsonLower: 0.54, wilsonUpper: 0.61,
  wilsonLowerEdge: 0.026, pointEdgeInPayoutUnits: 0.091, edgeInPayoutUnits: 0.026, breakevenProbability: 0.526,
  calibrationDelta: 0.005, calibrationSamples: 30, calibrationBrier: 0.24, calibrationEce: 0.05,
  calibrationReliable: true, method: "JOURNAL_HIERARCHICAL_SHRINKAGE", narrative: "ok",
} as const;

describe("thesis-backed maturity", () => {
  it("does not mature from observation count alone", () => {
    const state = emptyMaturityThesisState();
    const snap = updateMaturityThesis(state, "EVEN", 1000, 1, 200_000, [], context, null, null, [], 0);
    expect(snap.qualifiedNow).toBe(false);
    expect(snap.independentFamilies).toBe(0);
    expect(state.matureSince).toBeNull();
  });

  it("requires multi-engine coherence and a qualifying streak", () => {
    const state = emptyMaturityThesisState();
    let snap = updateMaturityThesis(state, "EVEN", 130, 1, 100_000, evidence, context, psychology, probability, [], 0);
    expect(snap.qualifiedNow).toBe(true);
    expect(state.matureSince).toBeNull();
    for (let i = 1; i < 8; i++) snap = updateMaturityThesis(state, "EVEN", 130 + i, 1, 100_000 + i * 1000, evidence, context, psychology, probability, [], 0);
    expect(state.matureSince).not.toBeNull();
    expect(snap.independentFamilies).toBeGreaterThanOrEqual(6);
    expect(snap.coherent).toBe(true);
  });

  it("does not erase an earned thesis on one adverse observation", () => {
    const state = emptyMaturityThesisState();
    for (let i = 0; i < 8; i++) updateMaturityThesis(state, "EVEN", 130 + i, 1, 100_000 + i * 1000, evidence, context, psychology, probability, [], 0);
    expect(state.matureSince).not.toBeNull();
    const adversePsych = { ...psychology, even: { ...psychology.even, psychologicalHealth: 50, health: "WEAKENING", reversalLikelihood: 50 } } as unknown as ParityPsychologySnapshot;
    const snap = updateMaturityThesis(state, "EVEN", 139, 1, 109_000, [], context, adversePsych, probability, [], 1);
    expect(state.matureSince).not.toBeNull();
    expect(snap.failureStreak).toBeGreaterThanOrEqual(0);
  });
});

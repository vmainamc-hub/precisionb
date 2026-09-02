/**
 * Precision Parity — Thesis-backed maturity authority.
 *
 * Maturity is NOT a sample counter. Observation count only tells us whether
 * the cell has enough history for the council to make a serious assessment.
 * This module requires a coherent multi-engine thesis, tracks that thesis
 * through time, and only decays an earned thesis after sustained failure.
 */
import type { Parity, Parity30CellSnapshot } from "./types";
import type { ParityEvidence, ParityContextEvidence } from "./evidence/types";
import type { ParityPsychologySnapshot } from "./psychology/types";
import type { ParityProbabilityReport } from "./probability";

export type MaturityThesisDimensionName =
  | "STATISTICAL"
  | "SEQUENCE"
  | "PRESSURE"
  | "STRUCTURE"
  | "REGIME"
  | "PSYCHOLOGY"
  | "VALIDATION"
  | "RISK";

export interface MaturityThesisDimension {
  readonly name: MaturityThesisDimensionName;
  readonly score: number;
  readonly support: number;
  readonly oppose: number;
  readonly available: boolean;
  readonly reason: string;
}

export interface MaturityThesisSnapshot {
  readonly score: number;
  readonly coherent: boolean;
  readonly qualifiedNow: boolean;
  readonly independentFamilies: number;
  readonly dimensions: readonly MaturityThesisDimension[];
  readonly coherence: number;
  readonly persistence: number;
  readonly contradiction: number;
  readonly psychologyHealth: number;
  readonly statisticalConfidence: number;
  readonly thesisAgeMs: number;
  readonly qualifyingStreak: number;
  readonly failureStreak: number;
  readonly lastQualifiedAt: number | null;
  readonly reasons: readonly string[];
  readonly warnings: readonly string[];
}

export interface MutableMaturityThesisState {
  score: number;
  qualifyingStreak: number;
  failureStreak: number;
  lastQualifiedAt: number | null;
  matureSince: number | null;
  history: Array<{ at: number; score: number; qualified: boolean }>;
}

export function emptyMaturityThesisState(): MutableMaturityThesisState {
  return {
    score: 0,
    qualifyingStreak: 0,
    failureStreak: 0,
    lastQualifiedAt: null,
    matureSince: null,
    history: [],
  };
}

const clamp = (n: number, a = 0, b = 100) => Math.max(a, Math.min(b, Number.isFinite(n) ? n : 0));
const clamp01 = (n: number) => clamp(n, 0, 1);

type DimensionEvidence = { support: number; oppose: number; available: boolean };

function evidenceDimension(
  evidence: readonly ParityEvidence[],
  parity: Parity,
  engines: readonly string[],
): DimensionEvidence {
  const selected = evidence.filter((e) => engines.includes(e.engine) && (e.authority === "DIRECT" || e.authority === "META"));
  let support = 0;
  let oppose = 0;
  for (const e of selected) {
    const weight = clamp01(e.strength) * clamp01(e.confidence) * Math.max(0.25, clamp01(e.sampleAuthority));
    if (e.direction === parity) support += weight;
    else if (e.direction !== "NEUTRAL") oppose += weight;
  }
  return { support, oppose, available: selected.length > 0 };
}

function directionalScore(x: DimensionEvidence): number {
  if (!x.available) return 0;
  const total = x.support + x.oppose;
  if (total <= 0) return 42;
  return clamp(50 + ((x.support - x.oppose) / total) * 50);
}

function dimension(
  name: MaturityThesisDimensionName,
  x: DimensionEvidence,
  reason: string,
): MaturityThesisDimension {
  return Object.freeze({ name, score: directionalScore(x), support: x.support, oppose: x.oppose, available: x.available, reason });
}

function psychologyDimension(parity: Parity, psychology: ParityPsychologySnapshot | null): MaturityThesisDimension {
  const side = psychology?.[parity === "EVEN" ? "even" : "odd"];
  if (!side) return dimension("PSYCHOLOGY", { support: 0, oppose: 0, available: false }, "Psychology unavailable.");
  const score = clamp(
    side.psychologicalHealth * 0.30 +
    side.alignment * 0.18 +
    side.structuralSupport * 0.16 +
    side.momentumSupport * 0.14 +
    side.continuationLikelihood * 0.12 +
    side.specialDigitActivity * 0.05 +
    side.recovery * 0.05 -
    side.opposingPressure * 0.12 -
    side.exhaustion * 0.08 -
    side.reversalLikelihood * 0.10,
  );
  return Object.freeze({
    name: "PSYCHOLOGY",
    score,
    support: side.psychologicalHealth / 100,
    oppose: (side.opposingPressure + side.reversalLikelihood + side.exhaustion) / 300,
    available: true,
    reason: `${parity} psychology health ${side.psychologicalHealth}/100, continuation ${side.continuationLikelihood}%, reversal ${side.reversalLikelihood}%, opposition ${side.opposingPressure}%.`,
  });
}

function regimeDimension(parity: Parity, context: ParityContextEvidence): MaturityThesisDimension {
  const compatible = context.regimeCompatible[parity];
  const horizon = context.multiHorizon.agreementScore;
  const stability = context.regimeStability;
  const driftPenalty = context.driftSeverity === "MAJOR" ? 35 : context.driftSeverity === "MINOR" ? 10 : 0;
  const score = clamp(
    (compatible ? 55 : 25) +
    stability * 0.22 +
    horizon * 0.18 -
    driftPenalty,
  );
  return Object.freeze({
    name: "REGIME",
    score,
    support: score / 100,
    oppose: (100 - score) / 100,
    available: true,
    reason: `${compatible ? "Compatible" : "incompatible"} regime; stability ${stability}/100; multi-horizon agreement ${horizon}/100; drift ${context.driftSeverity}.`,
  });
}

function riskDimension(context: ParityContextEvidence): MaturityThesisDimension {
  const score = clamp(
    context.feedQuality * 0.55 +
    (context.dangerCritical ? 0 : Math.max(0, 100 - context.dangerScore)) * 0.35 +
    (context.feedHardVeto ? 0 : 10),
  );
  return Object.freeze({
    name: "RISK",
    score,
    support: score / 100,
    oppose: (100 - score) / 100,
    available: true,
    reason: `Feed quality ${context.feedQuality}/100; danger ${context.dangerScore}/100${context.dangerCritical ? " (critical)" : ""}.`,
  });
}

function validationDimension(
  parity: Parity,
  evidence: readonly ParityEvidence[],
  probability: ParityProbabilityReport | null,
): MaturityThesisDimension {
  const significance = evidenceDimension(evidence, parity, [`significance_${parity.toLowerCase()}`, `particles_${parity.toLowerCase()}`]);
  const scoreBase = directionalScore(significance);
  const calibration = probability ? (probability.calibrationReliable ? 75 : 45) : 40;
  const score = clamp(scoreBase * 0.55 + calibration * 0.25 + (probability ? clamp(probability.calibrationSamples / 300) * 20 : 0));
  return Object.freeze({
    name: "VALIDATION",
    score,
    support: significance.support + (probability?.calibratedProbability ?? 0.5),
    oppose: significance.oppose + (1 - (probability?.calibratedProbability ?? 0.5)),
    available: significance.available || Boolean(probability),
    reason: probability
      ? `Calibrated probability ${(probability.calibratedProbability * 100).toFixed(1)}%; Wilson lower edge ${(probability.wilsonLowerEdge * 100).toFixed(2)}%; calibration ${probability.calibrationReliable ? "reliable" : "unreliable"}.`
      : "Statistical validation is available but calibrated probability is not yet available.",
  });
}

function computeDimensions(
  parity: Parity,
  evidence: readonly ParityEvidence[],
  context: ParityContextEvidence,
  psychology: ParityPsychologySnapshot | null,
  probability: ParityProbabilityReport | null,
): MaturityThesisDimension[] {
  return [
    dimension("STATISTICAL", evidenceDimension(evidence, parity, ["stats"]), "Independent distribution/Wilson statistics."),
    dimension("SEQUENCE", evidenceDimension(evidence, parity, ["markov", "pattern", "runs"]), "Transition, motif and run/hazard structure."),
    dimension("PRESSURE", evidenceDimension(evidence, parity, ["pressure", "anomaly"]), "Imbalance, momentum and recent anomaly pressure."),
    dimension("STRUCTURE", evidenceDimension(evidence, parity, ["structural", `market_intelligence_${parity.toLowerCase()}`]), "Digit structure, mechanism and redistribution."),
    regimeDimension(parity, context),
    psychologyDimension(parity, psychology),
    validationDimension(parity, evidence, probability),
    riskDimension(context),
  ];
}

function thesisScore(dimensions: readonly MaturityThesisDimension[]): number {
  const weights: Record<MaturityThesisDimensionName, number> = {
    STATISTICAL: 0.16,
    SEQUENCE: 0.13,
    PRESSURE: 0.13,
    STRUCTURE: 0.13,
    REGIME: 0.13,
    PSYCHOLOGY: 0.17,
    VALIDATION: 0.07,
    RISK: 0.08,
  };
  return clamp(dimensions.reduce((sum, d) => sum + d.score * weights[d.name], 0));
}

export function updateMaturityThesis(
  state: MutableMaturityThesisState,
  parity: Parity,
  observations: number,
  firstSeen: number,
  now: number,
  evidence: readonly ParityEvidence[],
  context: ParityContextEvidence,
  psychology: ParityPsychologySnapshot | null,
  probability: ParityProbabilityReport | null,
  hardBlocks: readonly string[],
  contradictionStreak: number,
): MaturityThesisSnapshot {
  const dimensions = computeDimensions(parity, evidence, context, psychology, probability);
  const score = thesisScore(dimensions);
  const strong = dimensions.filter((d) => d.available && d.score >= 60);
  const weak = dimensions.filter((d) => d.available && d.score < 45);
  const independentFamilies = strong.length;
  const averageStrong = strong.length ? strong.reduce((a, b) => a + b.score, 0) / strong.length : 0;
  const coherence = clamp(100 - weak.length * 14 - Math.max(0, 60 - averageStrong) * 0.6 - contradictionStreak * 4);
  const psych = dimensions.find((d) => d.name === "PSYCHOLOGY");
  const stat = dimensions.find((d) => d.name === "STATISTICAL");

  // Observation count and age are eligibility floors only. They cannot create
  // maturity without a coherent multi-engine thesis.
  const enoughHistory = observations >= 120 && firstSeen > 0 && now - firstSeen >= 90_000;
  const noCriticalFailure = hardBlocks.length === 0 && !context.feedHardVeto && !context.dangerCritical;
  const requiredCore = dimensions
    .filter((d) => ["STATISTICAL", "SEQUENCE", "PRESSURE", "STRUCTURE", "REGIME", "PSYCHOLOGY"].includes(d.name))
    .every((d) => d.available && d.score >= 55);
  const qualifiedNow =
    enoughHistory &&
    noCriticalFailure &&
    requiredCore &&
    independentFamilies >= 6 &&
    score >= 62 &&
    coherence >= 65 &&
    (psych?.score ?? 0) >= 60 &&
    (stat?.score ?? 0) >= 55 &&
    contradictionStreak < 3;

  // Thesis evidence has inertia, but not blind inertia. Sustained qualifying
  // observations build it; sustained failure erodes it.
  const alpha = state.matureSince !== null ? 0.10 : 0.16;
  state.score = clamp(state.score * (1 - alpha) + score * alpha);
  if (qualifiedNow) {
    state.qualifyingStreak += 1;
    state.failureStreak = 0;
    state.lastQualifiedAt = now;
    if (state.matureSince === null && state.qualifyingStreak >= 8) state.matureSince = now;
  } else {
    state.qualifyingStreak = Math.max(0, state.qualifyingStreak - 1);
    const materiallyBad =
      hardBlocks.length > 0 ||
      context.driftSeverity === "MAJOR" ||
      context.driftBreakDetected ||
      contradictionStreak >= 3 ||
      score < 48 ||
      independentFamilies < 4 ||
      (psych?.score ?? 0) < 45;
    if (materiallyBad) state.failureStreak += 1;
    else state.failureStreak = Math.max(0, state.failureStreak - 1);
  }

  state.history.push({ at: now, score, qualified: qualifiedNow });
  if (state.history.length > 120) state.history.shift();

  const thesisAgeMs = state.matureSince !== null ? Math.max(0, now - state.matureSince) : 0;
  const earnedMature = state.matureSince !== null;
  const shouldDecay = earnedMature && state.failureStreak >= 12;
  if (shouldDecay) state.matureSince = null;

  const reasons: string[] = [
    `${independentFamilies}/8 evidence dimensions are currently strong; thesis score ${score.toFixed(0)}/100.`,
    `Core coherence ${coherence.toFixed(0)}/100; statistical ${stat?.score.toFixed(0) ?? "—"}; psychology ${psych?.score.toFixed(0) ?? "—"}.`,
    `Qualifying thesis streak ${state.qualifyingStreak}; sustained failure streak ${state.failureStreak}.`,
  ];
  const warnings: string[] = [];
  if (!enoughHistory) warnings.push("History floor not met: observations/age are eligibility only, never maturity by themselves.");
  if (weak.length) warnings.push(`Weak thesis dimensions: ${weak.map((d) => d.name).join(", ")}.`);
  if (context.driftSeverity !== "NONE") warnings.push(`Regime drift is ${context.driftSeverity}; maturity cannot be freshly earned while major structural change is unresolved.`);
  if (shouldDecay) warnings.push("Earned thesis has sustained materially adverse evidence and is decaying; it is not being erased by a single tick.");

  return Object.freeze({
    score: state.score,
    coherent: coherence >= 65 && independentFamilies >= 5,
    qualifiedNow,
    independentFamilies,
    dimensions: Object.freeze(dimensions),
    coherence,
    persistence: clamp(state.qualifyingStreak / 12 * 100),
    contradiction: clamp(contradictionStreak / 6 * 100),
    psychologyHealth: psychology?.[parity === "EVEN" ? "even" : "odd"].psychologicalHealth ?? 0,
    statisticalConfidence: stat?.score ?? 0,
    thesisAgeMs,
    qualifyingStreak: state.qualifyingStreak,
    failureStreak: state.failureStreak,
    lastQualifiedAt: state.lastQualifiedAt,
    reasons: Object.freeze(reasons),
    warnings: Object.freeze(warnings),
  });
}

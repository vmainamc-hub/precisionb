/**
 * Precision Parity — calibrated probability + payout-aware edge.
 *
 * This is a downstream honesty layer. It does not create a directional thesis;
 * Psychology and the evidence council create the thesis first. It converts
 * the already-measured parity probability into a regime-aware calibrated
 * estimate using the existing Parity journal, then computes Wilson uncertainty
 * and payout-aware edge.
 */
import { calibrateParityConfidence } from "./engine-library/calibration";
import type { MarketRegime, HiddenRegime } from "./engine-library/types";
import { listParityJournal } from "./engine-library/journal";

export interface ParityProbabilityReport {
  readonly rawProbability: number;
  readonly calibratedProbability: number;
  readonly wilsonLower: number;
  readonly wilsonUpper: number;
  readonly wilsonLowerEdge: number;
  readonly pointEdgeInPayoutUnits: number;
  readonly edgeInPayoutUnits: number;
  readonly breakevenProbability: number;
  readonly calibrationDelta: number;
  readonly calibrationSamples: number;
  readonly calibrationBrier: number | null;
  readonly calibrationEce: number | null;
  readonly calibrationReliable: boolean;
  readonly method: "JOURNAL_HIERARCHICAL_SHRINKAGE";
  readonly narrative: string;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));

function wilson(count: number, n: number, z = 1.959963984540054): [number, number] {
  if (n <= 0) return [0.5, 0.5];
  const p = count / n;
  const denom = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
  return [
    clamp01((centre - margin) / denom),
    clamp01((centre + margin) / denom),
  ];
}

export function computeParityProbability(args: {
  market: string;
  parity: "EVEN" | "ODD";
  digits: readonly number[];
  rawProbability: number;
  rawWilsonLower?: number;
  rawWilsonUpper?: number;
  regime?: MarketRegime | string;
  hiddenRegime?: HiddenRegime | string;
  payoutRate?: number;
}): ParityProbabilityReport {
  const digits = args.digits.slice(-1000);
  const n = digits.length;
  const wins = digits.filter((d) => (d % 2 === 0) === (args.parity === "EVEN")).length;
  const [observedLower, observedUpper] = wilson(wins, n);
  const rawLower = Number.isFinite(args.rawWilsonLower) ? args.rawWilsonLower! : observedLower;
  const rawUpper = Number.isFinite(args.rawWilsonUpper) ? args.rawWilsonUpper! : observedUpper;

  const calibration = calibrateParityConfidence(
    clamp01(args.rawProbability) * 100,
    args.market,
    (args.regime as MarketRegime) ?? "STABLE",
    (args.hiddenRegime as HiddenRegime) ?? "BALANCED",
    listParityJournal(),
  );
  const delta = calibration.result.delta / 100;
  const calibrated = clamp01(args.rawProbability + delta);

  // Calibration is an empirical correction, not a replacement for sampling
  // uncertainty. Apply the same conservative correction to the observed Wilson
  // bounds and clamp them to the calibrated point.
  const lower = clamp01(Math.min(calibrated, rawLower + delta));
  const upper = clamp01(Math.max(calibrated, rawUpper + delta));

  const payout = Math.max(0, Number.isFinite(args.payoutRate) ? args.payoutRate! : 0.95);
  const breakeven = payout > 0 ? 1 / (1 + payout) : 1;
  const pointEdge = calibrated * (1 + payout) - 1;
  const lowerEdge = lower * (1 + payout) - 1;
  const reliable = calibration.result.sampleSize >= 15;

  const narrative =
    `P(${args.parity}) raw ${(args.rawProbability * 100).toFixed(1)}% → calibrated ${(calibrated * 100).toFixed(1)}%; ` +
    `Wilson 95% ${(lower * 100).toFixed(1)}–${(upper * 100).toFixed(1)}%; ` +
    `payout breakeven ${(breakeven * 100).toFixed(2)}%; lower-bound edge ${(lowerEdge * 100).toFixed(2)}% per unit.` +
    (reliable ? "" : " Calibration is provisional because the journal sample is still thin.");

  return Object.freeze({
    rawProbability: clamp01(args.rawProbability),
    calibratedProbability: calibrated,
    wilsonLower: lower,
    wilsonUpper: upper,
    wilsonLowerEdge: lowerEdge,
    pointEdgeInPayoutUnits: pointEdge,
    edgeInPayoutUnits: lowerEdge,
    breakevenProbability: breakeven,
    calibrationDelta: delta,
    calibrationSamples: calibration.result.sampleSize,
    calibrationBrier: calibration.result.brier,
    calibrationEce: calibration.result.ece,
    calibrationReliable: reliable,
    method: "JOURNAL_HIERARCHICAL_SHRINKAGE",
    narrative,
  });
}

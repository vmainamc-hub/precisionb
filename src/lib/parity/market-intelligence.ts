/**
 * Precision Parity — Market Intelligence Layer
 *
 * This is deliberately NOT a tick counter. It decomposes the digit market into
 * individual digit behaviour, structural-bar movement, parity balance,
 * upper/lower (over/under-style) bands, match/differ transitions, lacunas and
 * redistribution. The 30 cells consume this as a market thesis.
 */
import type { Parity } from "./types";
import type { StructuralReport } from "./engine-library/structural";
import type { ParityEvidence } from "./evidence/types";
import type { Tick } from "@/lib/analytics";
import { digitIntelligence, type DigitIntel } from "@/lib/apex/digit-intel";

export interface DigitIntelligence {
  digit: number;
  parity: Parity;
  shares: { w20: number; w50: number; w100: number; w500: number };
  velocity: number;
  acceleration: number;
  activityTrend: "RISING" | "FALLING" | "STABLE";
  persistence: number;
  suppression: number;
  recurrence: number;
  transitionIn: number;
  transitionOut: number;
  hiddenMovement: number;
}

export interface BandAnalysis {
  threshold: number;
  overShare: number;
  underShare: number;
  overEven: number;
  overOdd: number;
  underEven: number;
  underOdd: number;
  parityImbalance: number;
}

export interface MatchDifferAnalysis {
  matchRate: number;
  differRate: number;
  matchEvenRate: number;
  matchOddRate: number;
  differEvenRate: number;
  differOddRate: number;
  currentMode: "MATCH" | "DIFFER" | "BALANCED";
}

export interface Lacuna {
  digit: number;
  deficit: number;
  recovering: boolean;
  recoveryVelocity: number;
  interpretation: string;
}

export interface RedistributionAnalysis {
  highDigitsFalling: number;
  lowDigitsRising: number;
  concentrationChange: number;
  balancing: boolean;
  mechanism: "REDISTRIBUTION" | "CONCENTRATION" | "ROTATION" | "STABLE";
}

export interface MarketIntelligence {
  /** Canonical Apex per-digit intelligence: 10 digits × multi-window momentum/pressure state. */
  readonly canonicalDigitIntel?: DigitIntel;
  sampleSize: number;
  parity: {
    evenShare: number;
    oddShare: number;
    shortEvenShare: number;
    mediumEvenShare: number;
    longEvenShare: number;
    direction: Parity | "BALANCED";
    persistence: number;
    acceleration: number;
  };
  digits: readonly DigitIntelligence[];
  structural: {
    red: DigitIntelligence | null;
    green: DigitIntelligence | null;
    yellow: DigitIntelligence | null;
    lightRed: DigitIntelligence | null;
    purple: DigitIntelligence | null;
    hypothesis: StructuralReport["hypothesis"];
    reversalProbability: number;
    rotationRate: number;
    narrative: readonly string[];
  };
  bands: readonly BandAnalysis[];
  matchDiffer: MatchDifferAnalysis;
  lacunas: readonly Lacuna[];
  redistribution: RedistributionAnalysis;
  engineContext: {
    supportEven: number;
    supportOdd: number;
    oppositionEven: number;
    oppositionOdd: number;
    agreement: number;
  };
  mechanism: string;
  why: readonly string[];
  warnings: readonly string[];
  quality: number;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
const pct = (n: number, d: number) => n / Math.max(1, d);

function digitAt(t: Tick): number {
  return Math.abs(Math.round(t.price * 100)) % 10;
}

function freq(ds: readonly number[], d: number) {
  return ds.filter((x) => x === d).length / Math.max(1, ds.length);
}

function mean(xs: number[]) { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; }

function slope(values: number[]): number {
  if (values.length < 2) return 0;
  const n = values.length;
  const mx = (n - 1) / 2;
  const my = mean(values);
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (i - mx) * (values[i] - my); den += (i - mx) ** 2; }
  return den ? num / den : 0;
}

function transitionProfile(ds: readonly number[], digit: number) {
  let incoming = 0, outgoing = 0, matches = 0;
  for (let i = 1; i < ds.length; i++) {
    if (ds[i] === digit) { incoming += 1; if (ds[i - 1] === digit) matches += 1; }
    if (ds[i - 1] === digit) outgoing += 1;
  }
  return {
    incoming: incoming / Math.max(1, ds.length - 1),
    outgoing: outgoing / Math.max(1, ds.length - 1),
    recurrence: matches / Math.max(1, incoming),
  };
}

function intelligenceForDigit(ds: readonly number[], digit: number): DigitIntelligence {
  const windows = [20, 50, 100, 500].map(n => ds.slice(-n));
  const shares = windows.map(w => freq(w, digit));
  const velocity = shares[2] - shares[3];
  const shortVelocity = shares[0] - shares[1];
  const acceleration = shortVelocity - velocity;
  const persistence = clamp01(Math.max(0, velocity) * 10 + Math.max(0, shortVelocity) * 6);
  const suppression = clamp01((0.1 - shares[2]) * 8);
  const transition = transitionProfile(ds, digit);
  const hiddenMovement = clamp01(Math.abs(velocity) * 8 + Math.abs(acceleration) * 12 + transition.recurrence * 0.15);
  return {
    digit,
    parity: digit % 2 === 0 ? "EVEN" : "ODD",
    shares: { w20: shares[0], w50: shares[1], w100: shares[2], w500: shares[3] },
    velocity,
    acceleration,
    activityTrend: velocity > 0.006 ? "RISING" : velocity < -0.006 ? "FALLING" : "STABLE",
    persistence,
    suppression,
    recurrence: transition.recurrence,
    transitionIn: transition.incoming,
    transitionOut: transition.outgoing,
    hiddenMovement,
  };
}

function analyseBands(ds: readonly number[]): BandAnalysis[] {
  const out: BandAnalysis[] = [];
  for (let threshold = 0; threshold <= 8; threshold++) {
    const over = ds.filter(d => d > threshold);
    const under = ds.filter(d => d <= threshold);
    const overEven = pct(over.filter(d => d % 2 === 0).length, over.length);
    const underEven = pct(under.filter(d => d % 2 === 0).length, under.length);
    out.push({
      threshold,
      overShare: over.length / Math.max(1, ds.length),
      underShare: under.length / Math.max(1, ds.length),
      overEven,
      overOdd: 1 - overEven,
      underEven,
      underOdd: 1 - underEven,
      parityImbalance: Math.abs(overEven - underEven),
    });
  }
  return out;
}

function analyseMatchDiffer(ds: readonly number[]): MatchDifferAnalysis {
  let match = 0, matchEven = 0, matchOdd = 0, differEven = 0, differOdd = 0;
  for (let i = 1; i < ds.length; i++) {
    if (ds[i] === ds[i - 1]) {
      match++; if (ds[i] % 2 === 0) matchEven++; else matchOdd++;
    } else {
      if (ds[i] % 2 === 0) differEven++; else differOdd++;
    }
  }
  const total = Math.max(1, ds.length - 1);
  const matchRate = match / total;
  const differRate = 1 - matchRate;
  const matchEvenRate = match ? matchEven / match : 0.5;
  const differCount = Math.max(1, total - match);
  const differEvenRate = differEven / differCount;
  return {
    matchRate,
    differRate,
    matchEvenRate,
    matchOddRate: 1 - matchEvenRate,
    differEvenRate,
    differOddRate: 1 - differEvenRate,
    currentMode: matchRate > 0.12 ? "MATCH" : differRate > 0.92 ? "DIFFER" : "BALANCED",
  };
}

export function analyseMarketIntelligence(
  digits: readonly number[],
  structural: StructuralReport,
  evidence: readonly ParityEvidence[],
): MarketIntelligence {
  const ds = digits.slice(-500);
  // Use Apex's canonical per-digit intelligence as the authoritative
  // individual-digit signal. The local fields below remain derived market
  // summaries, not a competing digit engine.
  const canonicalDigitIntel = digitIntelligence([...digits]);
  const infos = canonicalDigitIntel.profiles.map((p) => ({
    digit: p.digit,
    parity: p.digit % 2 === 0 ? "EVEN" as const : "ODD" as const,
    shares: {
      w20: p.windowShare[1] ?? 0,
      w50: p.windowShare[2] ?? 0,
      w100: p.windowShare[3] ?? 0,
      w500: p.windowShare[7] ?? 0,
    },
    velocity: p.frequencyVelocity,
    acceleration: p.frequencyAcceleration,
    activityTrend: p.momentum > 4 ? "RISING" as const : p.momentum < -4 ? "FALLING" as const : "STABLE" as const,
    persistence: clamp01(Math.max(0, p.clusterDensity - 1) * 0.6 + Math.max(0, p.momentum) / 100 * 0.4),
    suppression: clamp01(Math.max(0, 0.1 - p.fast) * 8),
    recurrence: p.recurrenceInterval > 0 ? clamp01(10 / p.recurrenceInterval) : 0,
    transitionIn: p.transitionInflow >= 0 ? p.transitionInflow : 0,
    transitionOut: p.recurrenceInterval > 0 ? clamp01(10 / p.recurrenceInterval) : 0,
    hiddenMovement: clamp01(Math.abs(p.momentum) / 100),
  } satisfies DigitIntelligence));
  const even = ds.filter(d => d % 2 === 0).length / Math.max(1, ds.length);
  const e20 = ds.slice(-20).filter(d => d % 2 === 0).length / Math.max(1, Math.min(20, ds.length));
  const e100 = ds.slice(-100).filter(d => d % 2 === 0).length / Math.max(1, Math.min(100, ds.length));
  const e500 = even;
  const eSlope = slope(ds.map(d => d % 2 === 0 ? 1 : 0));
  const persistence = clamp01((Math.abs(e100 - 0.5) * 2) * (1 - Math.abs(e20 - e100)));

  const bands = analyseBands(ds);
  const matchDiffer = analyseMatchDiffer(ds);
  const lacunas = infos
    .map(i => ({
      digit: i.digit,
      deficit: clamp01(0.1 - i.shares.w100),
      recovering: i.activityTrend === "RISING" && i.shares.w100 < 0.1,
      recoveryVelocity: i.velocity,
      interpretation: i.activityTrend === "RISING" && i.shares.w100 < 0.1
        ? `d${i.digit} is suppressed but recovering (${(i.velocity * 100).toFixed(2)}pp/window).`
        : i.shares.w100 < 0.07
          ? `d${i.digit} is materially under-represented.`
          : `d${i.digit} is within normal activity range.`,
    }))
    .filter(x => x.deficit > 0.01)
    .sort((a, b) => (b.deficit + Math.max(0, b.recoveryVelocity) * 2) - (a.deficit + Math.max(0, a.recoveryVelocity) * 2))
    .slice(0, 5);

  const high = infos.filter(i => i.shares.w100 > 0.115);
  const low = infos.filter(i => i.shares.w100 < 0.085);
  const highFalling = high.filter(i => i.velocity < -0.004).length / Math.max(1, high.length);
  const lowRising = low.filter(i => i.velocity > 0.004).length / Math.max(1, low.length);
  const concentration = mean(infos.map(i => i.shares.w100 ** 2));
  const oldConcentration = mean(infos.map(i => i.shares.w500 ** 2));
  const concentrationChange = concentration - oldConcentration;
  const balancing = highFalling > 0.45 && lowRising > 0.35;
  const redistribution: RedistributionAnalysis = {
    highDigitsFalling: highFalling,
    lowDigitsRising: lowRising,
    concentrationChange,
    balancing,
    mechanism: balancing ? "REDISTRIBUTION" : concentrationChange > 0.006 ? "CONCENTRATION" : structural.rotationRate >= 0.4 ? "ROTATION" : "STABLE",
  };

  const supportEven = mean(evidence.filter(e => e.direction === "EVEN").map(e => e.strength * e.confidence));
  const supportOdd = mean(evidence.filter(e => e.direction === "ODD").map(e => e.strength * e.confidence));
  const oppositionEven = supportOdd;
  const oppositionOdd = supportEven;
  const agreement = 1 - Math.min(1, Math.abs(supportEven - supportOdd));

  const topBand = [...bands].sort((a, b) => b.parityImbalance - a.parityImbalance)[0];
  const red = infos[structural.bars.RED.digit] ?? null;
  const green = infos[structural.bars.GREEN.digit] ?? null;
  const yellow = infos[structural.bars.YELLOW.digit] ?? null;
  const lightRed = infos[structural.bars.LIGHT_RED.digit] ?? null;
  const purple = infos[structural.bars.PURPLE.digit] ?? null;

  const mechanismParts: string[] = [];
  if (redistribution.mechanism === "REDISTRIBUTION") mechanismParts.push("activity is redistributing from crowded digits toward suppressed digits");
  if (structural.hypothesis !== "UNCERTAIN") mechanismParts.push(`structural regime resembles ${structural.hypothesis.toLowerCase()}`);
  if (red && green) mechanismParts.push(`red d${red.digit} is ${red.activityTrend.toLowerCase()} while green d${green.digit} is ${green.activityTrend.toLowerCase()}`);
  if (topBand && topBand.parityImbalance > 0.08) mechanismParts.push(`upper/lower digit bands show a ${(topBand.parityImbalance * 100).toFixed(1)}pp parity separation at threshold ${topBand.threshold}`);
  if (matchDiffer.currentMode !== "BALANCED") mechanismParts.push(`${matchDiffer.currentMode.toLowerCase()} transitions are influencing the current parity mix`);
  const mechanism = mechanismParts.length ? mechanismParts.join("; ") + "." : "No single market mechanism dominates; evidence remains mixed.";

  const why: string[] = [
    `Parity composition: EVEN ${(even * 100).toFixed(1)}% / ODD ${((1 - even) * 100).toFixed(1)}%; short-window EVEN ${(e20 * 100).toFixed(1)}% vs 500-tick ${(e500 * 100).toFixed(1)}%.`,
    `Digit activity: ${infos.filter(i => i.activityTrend === "RISING").map(i => `d${i.digit}`).join(", ") || "no clear risers"} rising; ${infos.filter(i => i.activityTrend === "FALLING").map(i => `d${i.digit}`).join(", ") || "no clear fallers"} falling.`,
    `Structural bars: RED d${structural.bars.RED.digit}, GREEN d${structural.bars.GREEN.digit}, YELLOW d${structural.bars.YELLOW.digit}, LIGHT-RED d${structural.bars.LIGHT_RED.digit}, PURPLE d${structural.bars.PURPLE.digit}.`,
    redistribution.balancing ? `Redistribution signal: ${Math.round(highFalling * 100)}% of crowded digits are falling while ${Math.round(lowRising * 100)}% of suppressed digits are rising.` : `Redistribution is not yet dominant (${redistribution.mechanism.toLowerCase()}).`,
    `Match/differ: ${(matchDiffer.matchRate * 100).toFixed(1)}% matches; ${(matchDiffer.differRate * 100).toFixed(1)}% differs; current mode ${matchDiffer.currentMode}.`,
    `Strongest upper/lower parity separation is threshold ${topBand?.threshold ?? "—"}, where OVER-style and UNDER-style digit groups differ by ${((topBand?.parityImbalance ?? 0) * 100).toFixed(1)}pp in EVEN share.`,
  ];
  if (lacunas.length) why.push(`Lacunas: ${lacunas.slice(0, 3).map(l => `d${l.digit}${l.recovering ? " recovering" : " suppressed"}`).join(", ")}.`);
  if (structural.narrative.length) why.push(...structural.narrative.slice(0, 3));

  const warnings: string[] = [];
  if (structural.reversalProbability > 0.55) warnings.push(`Structural reversal probability ${(structural.reversalProbability * 100).toFixed(0)}% is elevated.`);
  if (structural.entropyLevel === "VERY_HIGH") warnings.push("Digit distribution is near-random/high entropy; directional claims are fragile.");
  if (agreement < 0.45) warnings.push("Engine evidence is internally divided; the cell should not treat raw parity imbalance as sufficient.");
  if (Math.abs(e20 - e500) > 0.12) warnings.push("Short-term parity has moved materially away from the longer distribution; possible regime transition.");

  const volatilityQuality = structural.volatilityRegime === "STABLE" ? 1 : structural.volatilityRegime === "RECOVERING" ? 0.8 : structural.volatilityRegime === "CONTRACTING" ? 0.7 : 0.35;
  const quality = clamp01(
    0.20 * Math.min(1, ds.length / 300) +
    0.20 * (1 - structural.reversalProbability) +
    0.20 * volatilityQuality +
    0.20 * (1 - structural.crowding) +
    0.20 * agreement,
  );

  return Object.freeze({
    canonicalDigitIntel,
    sampleSize: ds.length,
    parity: { evenShare: even, oddShare: 1 - even, shortEvenShare: e20, mediumEvenShare: e100, longEvenShare: e500, direction: (even > 0.53 ? "EVEN" : even < 0.47 ? "ODD" : "BALANCED") as "EVEN" | "ODD" | "BALANCED", persistence, acceleration: eSlope },
    digits: Object.freeze(infos),
    structural: { red, green, yellow, lightRed, purple, hypothesis: structural.hypothesis, reversalProbability: structural.reversalProbability, rotationRate: structural.rotationRate, narrative: Object.freeze([...structural.narrative]) },
    bands: Object.freeze(bands),
    matchDiffer,
    lacunas: Object.freeze(lacunas),
    redistribution,
    engineContext: { supportEven, supportOdd, oppositionEven, oppositionOdd, agreement },
    mechanism,
    why: Object.freeze(why),
    warnings: Object.freeze(warnings),
    quality,
  });
}

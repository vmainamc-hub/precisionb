/**
 * Precision Parity — Chief Number Psychology Analyst
 *
 * This module is deliberately side-neutral: EVEN and ODD are evaluated
 * independently from the same market observation. It does not count a raw
 * parity percentage and declare a winner. It interprets the individual
 * digits, structural roles, movement, activity, opposition, exhaustion and
 * redistribution as a psychological market thesis.
 *
 * Wiring contract:
 *   canonical digits -> MarketIntelligence -> evaluateParityPsychology()
 *
 * The engine is stateful only through the caller-supplied cell state. It never
 * mutates Sentinel or any other analysis owner.
 */
import type { Parity } from "../types";
import type { MarketIntelligence, DigitIntelligence } from "../market-intelligence";
import type {
  MutableParityPsychologyState,
  ParityPsychologyRoles,
  ParityPsychologySide,
  ParityPsychologySnapshot,
  PsychologyDigitRole,
  PsychologyHealth,
  PsychologySupportQuality,
  PsychologyUpdate,
} from "./types";

const clamp01 = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const opposite = (p: Parity): Parity => p === "EVEN" ? "ODD" : "EVEN";

function activity(i: DigitIntelligence): number {
  // Activity is deliberately broader than raw frequency: current presence,
  // momentum, acceleration, cluster persistence and transition inflow matter.
  const share = clamp01(i.shares.w20 * 8);
  const velocity = clamp01(0.5 + i.velocity * 30);
  const acceleration = clamp01(0.5 + i.acceleration * 35);
  const recurrence = clamp01(i.recurrence);
  const persistence = clamp01(i.persistence);
  const transition = clamp01(i.transitionIn * 20);
  return clamp01(
    share * 0.22 +
    velocity * 0.24 +
    acceleration * 0.16 +
    recurrence * 0.10 +
    persistence * 0.10 +
    transition * 0.08 +
    clamp01(Math.abs(i.hiddenMovement)) * 0.10,
  );
}

function roleFromCanonical(i: import("@/lib/apex/digit-intel").DigitProfile): PsychologyDigitRole {
  return Object.freeze({
    digit: i.digit,
    parity: i.digit % 2 === 0 ? "EVEN" : "ODD",
    share: i.baseline,
    velocity: i.frequencyVelocity,
    acceleration: i.frequencyAcceleration,
    activity: clamp01(
      0.22 * (i.fast * 8) +
      0.24 * (0.5 + i.frequencyVelocity * 30) +
      0.16 * (0.5 + i.frequencyAcceleration * 35) +
      0.10 * i.clusterDensity / 2 +
      0.10 * Math.max(0, i.momentum) / 100 +
      0.08 * Math.max(0, i.transitionInflow),
      ),
  });
}

function role(i: DigitIntelligence): PsychologyDigitRole {
  return Object.freeze({
    digit: i.digit,
    parity: i.parity,
    share: i.shares.w100,
    velocity: i.velocity,
    acceleration: i.acceleration,
    activity: activity(i),
  });
}

function roles(intel: MarketIntelligence): ParityPsychologyRoles {
  const canonical = intel.canonicalDigitIntel;
  if (canonical) {
    const profiles = canonical.profiles;
    const byCanonicalShare = [...profiles].sort((a, b) =>
      (b.windowShare[9] ?? b.baseline) - (a.windowShare[9] ?? a.baseline) || a.digit - b.digit,
    );
    const byIncreasing = [...profiles].sort((a, b) =>
      b.momentum - a.momentum || b.pressureAcceleration - a.pressureAcceleration || a.digit - b.digit,
    );
    const byDecreasing = [...profiles].sort((a, b) =>
      a.momentum - b.momentum || a.pressureAcceleration - b.pressureAcceleration || a.digit - b.digit,
    );
    const green = byCanonicalShare[0]!;
    const secondGreen = byCanonicalShare[1] ?? green;
    const red = byCanonicalShare[9] ?? green;
    const secondRed = byCanonicalShare[8] ?? red;
    const mostIncreasing = canonical.increasing[0] != null
      ? profiles[canonical.increasing[0]] ?? byIncreasing[0]
      : byIncreasing[0] ?? green;
    const mostDecreasing = canonical.decreasing[0] != null
      ? profiles[canonical.decreasing[0]] ?? byDecreasing[0]
      : byDecreasing[0] ?? red;
    return Object.freeze({
      green: roleFromCanonical(green),
      secondGreen: roleFromCanonical(secondGreen),
      red: roleFromCanonical(red),
      secondRed: roleFromCanonical(secondRed),
      mostIncreasing: roleFromCanonical(mostIncreasing),
      mostDecreasing: roleFromCanonical(mostDecreasing),
    });
  }

  // Backward-compatible adapter for isolated fixtures: when the canonical
  // Apex digit-intelligence object is unavailable, preserve the same Sentinel
  // role semantics from the MarketIntelligence digit profiles.
  const all = [...intel.digits].sort((a, b) => b.shares.w100 - a.shares.w100 || a.digit - b.digit);
  const byIncreasing = [...intel.digits].sort((a, b) => b.velocity - a.velocity || a.digit - b.digit);
  const byDecreasing = [...intel.digits].sort((a, b) => a.velocity - b.velocity || a.digit - b.digit);
  return Object.freeze({
    green: role(all[0]!),
    secondGreen: role(all[1] ?? all[0]!),
    red: role(all[all.length - 1]!),
    secondRed: role(all[all.length - 2] ?? all[all.length - 1]!),
    mostIncreasing: role(byIncreasing[0]!),
    mostDecreasing: role(byDecreasing[0]!),
  });
}

function parityMean(intel: MarketIntelligence, parity: Parity, key: "w20" | "w100" | "w500"): number {
  const xs = intel.digits.filter(d => d.parity === parity).map(d => d.shares[key]);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0.5;
}

function parityVelocity(intel: MarketIntelligence, parity: Parity): number {
  const xs = intel.digits.filter(d => d.parity === parity).map(d => d.velocity);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function parityAcceleration(intel: MarketIntelligence, parity: Parity): number {
  const xs = intel.digits.filter(d => d.parity === parity).map(d => d.acceleration);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function sideActivity(intel: MarketIntelligence, parity: Parity): number {
  const xs = intel.digits.filter(d => d.parity === parity).map(activity);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function structuralAlignment(p: Parity, r: ParityPsychologyRoles): number {
  let points = 0;
  // RED #1, RED #2 and MOST INCREASING are the core structural psychology.
  if (r.red.parity === p) points += 0.22;
  if (r.secondRed.parity === p) points += 0.22;
  if (r.mostIncreasing.parity === p) points += 0.20;

  // MOST DECREASING on the opposing side is confirmation.
  if (r.mostDecreasing.parity === opposite(p)) points += 0.12;

  // GREEN/2ND GREEN are advantages, not hard requirements.
  if (r.green.parity === p) points += 0.07;
  if (r.secondGreen.parity === p) points += 0.07;
  return clamp01(points / 0.90);
}

function specialActivity(intel: MarketIntelligence, p: Parity): number {
  const wanted = p === "EVEN" ? [0, 8] : [1, 9];
  const found = wanted.map(d => intel.digits[d]).filter(Boolean) as DigitIntelligence[];
  if (!found.length) return 0;
  return found.reduce((sum, d) => sum + activity(d), 0) / found.length;
}

function exhaustionForSide(intel: MarketIntelligence, p: Parity): number {
  const side = intel.digits.filter(d => d.parity === p);
  if (!side.length) return 0;
  // Crowded/high-share digits that are losing velocity are exhausted.
  return clamp01(
    side.reduce((sum, d) =>
      sum + clamp01((d.shares.w100 - 0.10) * 8) * clamp01(0.5 - d.velocity * 25),
    0) / side.length * 2.5,
  );
}

function recoveryForSide(intel: MarketIntelligence, p: Parity): number {
  const side = intel.digits.filter(d => d.parity === p);
  if (!side.length) return 0;
  return clamp01(
    side.reduce((sum, d) =>
      sum + clamp01((0.10 - d.shares.w100) * 8) * clamp01(0.5 + d.velocity * 30),
    0) / side.length * 2.5,
  );
}

function supportQuality(
  p: Parity,
  intel: MarketIntelligence,
  r: ParityPsychologyRoles,
  exhaustion: number,
  recovery: number,
): PsychologySupportQuality {
  const side = intel.digits.filter(d => d.parity === p);
  const active = side.filter(d => activity(d) > 0.55).length;
  const total = Math.max(1, side.length);
  const concentrated = Math.max(...side.map(d => d.shares.w100), 0) > 0.145;
  const distributed = active >= 2 && !concentrated;
  const transition = r.mostIncreasing.parity === p && r.mostDecreasing.parity === p;
  if (transition) return "TRANSITIONING";
  if (exhaustion > 0.60) return "EXHAUSTED";
  if (recovery > 0.45) return "RECOVERING";
  if (distributed) return "DISTRIBUTED";
  if (concentrated) return "CONCENTRATED";
  return "FRAGILE";
}

function healthLabel(
  health: number,
  reversal: number,
  exhaustion: number,
  transition: number,
): PsychologyHealth {
  if (reversal >= 0.75) return "REVERSING";
  if (transition >= 0.65) return "TRANSITIONING";
  if (exhaustion >= 0.65) return "EXHAUSTED";
  if (health < 0.30) return "OPPOSED";
  if (health >= 0.78) return "HEALTHY";
  if (health >= 0.62) return "REINFORCED";
  if (health >= 0.46) return "STABLE";
  return "WEAKENING";
}

function evaluateSide(
  p: Parity,
  intel: MarketIntelligence,
  r: ParityPsychologyRoles,
): ParityPsychologySide {
  const o = opposite(p);
  const short = parityMean(intel, p, "w20");
  const medium = parityMean(intel, p, "w100");
  const long = parityMean(intel, p, "w500");
  const shortOpp = parityMean(intel, o, "w20");
  const velocity = parityVelocity(intel, p);
  const oppVelocity = parityVelocity(intel, o);
  const acceleration = parityAcceleration(intel, p);
  const oppAcceleration = parityAcceleration(intel, o);

  const structure = structuralAlignment(p, r);
  const momentum = clamp01(
    0.55 * clamp01(0.5 + velocity * 28) +
    0.25 * clamp01(0.5 + acceleration * 32) +
    0.20 * clamp01(0.5 + (velocity - oppVelocity) * 22),
  );
  const special = specialActivity(intel, p);
  const exhaustion = exhaustionForSide(intel, p);
  const recovery = recoveryForSide(intel, p);

  // Opposing psychology is explicit: a side is not healthy merely because it
  // leads. Rising opposition and narrowing gaps are transition evidence.
  const gap = medium - (1 - medium);
  const shortGap = short - shortOpp;
  const opposingPressure = clamp01(
    0.45 * clamp01(0.5 + (-gap) * 2.5) +
    0.30 * clamp01(0.5 + (oppVelocity - velocity) * 25) +
    0.25 * clamp01(0.5 + (shortGap - gap) * 3),
  );

  const transition = clamp01(
    0.40 * clamp01(0.5 + (oppVelocity - velocity) * 25) +
    0.25 * clamp01(0.5 + (oppAcceleration - acceleration) * 30) +
    0.20 * intel.structural.rotationRate +
    0.15 * intel.structural.reversalProbability,
  );

  const reversal = clamp01(
    0.45 * opposingPressure +
    0.25 * exhaustion +
    0.20 * transition +
    0.10 * (intel.structural.reversalProbability),
  );

  const continuation = clamp01(
    0.35 * structure +
    0.25 * momentum +
    0.15 * special +
    0.10 * clamp01(0.5 + (medium - long) * 3) +
    0.10 * (1 - opposingPressure) +
    0.05 * recovery -
    0.25 * exhaustion,
  );

  const health = clamp01(
    0.34 * structure +
    0.22 * momentum +
    0.12 * special +
    0.12 * (1 - opposingPressure) +
    0.10 * continuation +
    0.05 * recovery +
    0.05 * (1 - exhaustion),
  );

  const alignment = clamp01(
    0.55 * structure +
    0.25 * momentum +
    0.10 * special +
    0.10 * (1 - opposingPressure),
  );

  const quality = supportQuality(p, intel, r, exhaustion, recovery);
  const state = healthLabel(health, reversal, exhaustion, transition);

  const reasons: string[] = [];
  const warnings: string[] = [];
  if (r.red.parity === p) reasons.push(`RED #1 is ${p} (d${r.red.digit}) — structural parity alignment.`);
  else warnings.push(`RED #1 is ${r.red.parity} (d${r.red.digit}) — structural opposition.`);
  if (r.secondRed.parity === p) reasons.push(`RED #2 is ${p} (d${r.secondRed.digit}) — second red reinforces the side.`);
  else warnings.push(`RED #2 is ${r.secondRed.parity} (d${r.secondRed.digit}) — second red opposes the side.`);
  if (r.mostIncreasing.parity === p) reasons.push(`MOST INCREASING is ${p} (d${r.mostIncreasing.digit}) — active psychological force is moving into ${p}.`);
  else warnings.push(`MOST INCREASING is ${r.mostIncreasing.parity} (d${r.mostIncreasing.digit}) — active force is moving against ${p}.`);
  if (r.mostDecreasing.parity === o) reasons.push(`MOST DECREASING is ${o} (d${r.mostDecreasing.digit}) — opposing parity is losing activity.`);
  if (r.green.parity === p) reasons.push(`GREEN d${r.green.digit} is ${p} — added structural advantage.`);
  if (r.secondGreen.parity === p) reasons.push(`2ND GREEN d${r.secondGreen.digit} is ${p} — added structural advantage.`);
  if (special >= 0.60) reasons.push(`Special parity digits are active: ${p === "EVEN" ? "0 and 8" : "1 and 9"}.`);
  else warnings.push(`Special parity digits ${p === "EVEN" ? "0/8" : "1/9"} are not yet sufficiently active.`);
  if (exhaustion >= 0.45) warnings.push(`${p} support shows exhaustion; high-share digits are losing force.`);
  if (opposingPressure >= 0.55) warnings.push(`${o} pressure is rising against ${p}.`);
  if (transition >= 0.55) warnings.push(`Psychological transition risk is elevated; the opposing side is gaining relative momentum.`);
  if (intel.redistribution.balancing) reasons.push("Redistribution is active: crowded digits are falling while suppressed digits recover.");

  const strongestSupport =
    r.mostIncreasing.parity === p ? `d${r.mostIncreasing.digit} is the strongest increasing digit.` :
    r.red.parity === p ? `RED #1 is aligned with ${p}.` :
    `${p} has partial structural support.`;
  const strongestThreat =
    r.mostIncreasing.parity === o ? `d${r.mostIncreasing.digit} is increasing on the opposing side.` :
    exhaustion >= 0.45 ? `${p} support is becoming exhausted.` :
    `Opposing pressure is ${pct(opposingPressure)}.`;

  return Object.freeze({
    parity: p,
    score: Math.round(alignment * 100),
    alignment: Math.round(alignment * 100),
    structuralSupport: Math.round(structure * 100),
    momentumSupport: Math.round(momentum * 100),
    specialDigitActivity: Math.round(special * 100),
    opposingPressure: Math.round(opposingPressure * 100),
    exhaustion: Math.round(exhaustion * 100),
    recovery: Math.round(recovery * 100),
    continuationLikelihood: Math.round(continuation * 100),
    reversalLikelihood: Math.round(reversal * 100),
    psychologicalHealth: Math.round(health * 100),
    health: state,
    supportQuality: quality,
    strongestSupport,
    strongestThreat,
    reasons: Object.freeze(reasons),
    warnings: Object.freeze(warnings),
    roles: r,
  });
}

function updateState(
  previous: MutableParityPsychologyState | undefined,
  trackedParity: Parity,
  health: number,
  reversal: number,
  continuation: number,
): MutableParityPsychologyState {
  const state = previous ?? {
    lastParity: trackedParity,
    stableTicks: 0,
    adverseTicks: 0,
    supportiveTicks: 0,
    matureScore: 0,
    lastHealth: 50,
    history: [],
  };

  const supportive = health >= 60 && reversal < 45 && continuation >= 55;
  const adverse = health < 48 || reversal >= 60;
  if (supportive) {
    state.stableTicks += 1;
    state.supportiveTicks += 1;
    state.adverseTicks = 0;
  } else if (adverse) {
    state.adverseTicks += 1;
    state.supportiveTicks = Math.max(0, state.supportiveTicks - 1);
    // Hysteresis: maturity is never erased by a single adverse observation.
    if (state.adverseTicks >= 3) state.stableTicks = Math.max(0, state.stableTicks - 1);
  } else {
    state.adverseTicks = Math.max(0, state.adverseTicks - 1);
  }

  state.lastParity = trackedParity;
  state.lastHealth = health;
  state.matureScore = clamp01(
    (state.matureScore / 100) * 0.94 +
    (health / 100) * 0.06 +
    Math.min(1, state.stableTicks / 30) * 0.02,
  ) * 100;
  state.history.push(health);
  if (state.history.length > 60) state.history.shift();
  return state;
}

export function evaluateParityPsychology(
  marketId: string,
  intel: MarketIntelligence,
  timestamp: number,
  previousState?: MutableParityPsychologyState,
  trackedParity?: Parity,
): PsychologyUpdate {
  const r = roles(intel);
  const even = evaluateSide("EVEN", intel, r);
  const odd = evaluateSide("ODD", intel, r);

  const delta = even.alignment - odd.alignment;
  const chiefParity: Parity | "BALANCED" = Math.abs(delta) < 8 ? "BALANCED" : delta > 0 ? "EVEN" : "ODD";
  const chiefSide = chiefParity === "EVEN" ? even : chiefParity === "ODD" ? odd : null;
  const chiefScore = chiefSide ? chiefSide.score : Math.max(even.score, odd.score);
  const chiefHealth = chiefSide ? chiefSide.psychologicalHealth : Math.round((even.psychologicalHealth + odd.psychologicalHealth) / 2);
  const reversalRisk = chiefSide ? chiefSide.reversalLikelihood : Math.max(even.reversalLikelihood, odd.reversalLikelihood);
  const transitionRisk = chiefSide
    ? Math.round((chiefSide.opposingPressure * 0.6 + chiefSide.reversalLikelihood * 0.4))
    : 50;

  const cellParity = trackedParity ?? (chiefParity === "BALANCED" ? "EVEN" : chiefParity);
  const cellSide = cellParity === "EVEN" ? even : odd;
  const state = updateState(
    previousState,
    cellParity,
    cellSide.psychologicalHealth,
    cellSide.reversalLikelihood,
    cellSide.continuationLikelihood,
  );

  const why: string[] = [
    `Chief psychological read: ${chiefParity} with ${chiefScore}/100 alignment.`,
    `RED structure: ${r.red.digit}/${r.secondRed.digit}; MOST INCREASING: d${r.mostIncreasing.digit}; MOST DECREASING: d${r.mostDecreasing.digit}.`,
    `EVEN health ${even.psychologicalHealth}/100, continuation ${even.continuationLikelihood}%, reversal ${even.reversalLikelihood}%; ODD health ${odd.psychologicalHealth}/100, continuation ${odd.continuationLikelihood}%, reversal ${odd.reversalLikelihood}%.`,
  ];
  if (intel.redistribution.balancing) why.push("The market is redistributing activity rather than simply repeating the current frequency hierarchy.");
  if (r.mostIncreasing.parity === opposite(r.mostDecreasing.parity)) {
    why.push(`Movement is directional: MOST INCREASING is ${r.mostIncreasing.parity} while MOST DECREASING is ${r.mostDecreasing.parity}.`);
  }

  const warnings: string[] = [
    ...even.warnings.slice(0, 2),
    ...odd.warnings.slice(0, 2),
  ];
  if (intel.structural.reversalProbability > 0.55) {
    warnings.push(`Structural reversal probability is ${(intel.structural.reversalProbability * 100).toFixed(0)}%.`);
  }

  const readyEligible =
    cellSide.psychologicalHealth >= 65 &&
    cellSide.continuationLikelihood >= 60 &&
    cellSide.reversalLikelihood < 45 &&
    cellSide.structuralSupport >= 55 &&
    cellSide.momentumSupport >= 55 &&
    cellSide.opposingPressure < 55;

  const thesis = chiefParity === "BALANCED"
    ? "Psychology is contested: neither parity has sufficient structural and momentum alignment to become the chief thesis."
    : `${chiefParity} is the chief psychological thesis because ${chiefSide!.strongestSupport.toLowerCase()} ${chiefSide!.strongestThreat.toLowerCase()}`;

  return Object.freeze({
    snapshot: Object.freeze({
      marketId,
      timestamp,
      sampleSize: intel.sampleSize,
      roles: r,
      even,
      odd,
      chiefParity,
      chiefScore,
      chiefHealth,
      reversalRisk,
      transitionRisk,
      thesis,
      why: Object.freeze(why),
      warnings: Object.freeze([...new Set(warnings)]),
      readyEligible,
    }),
    state,
  });
}

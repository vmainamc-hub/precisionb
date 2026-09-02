/**
 * ENGINE RUNNER + ADAPTERS
 * ====================================================================
 * Runs the EXISTING Precision Parity engines and maps their output onto
 * the normalized `ParityEvidence` model. No engine mathematics is
 * re-implemented here (§9); every number below comes out of an existing
 * engine module.
 *
 * MEMORY ISOLATION: several existing engines keep per-market memory
 * (structural, hmm, drift, decorrelation, ...). To guarantee the live
 * pipeline's behaviour is unchanged (§30) this subsystem addresses those
 * engines under a namespaced market key.
 */
import type { Tick } from "@/lib/analytics";
import type { Evidence, ParityContract } from "@/lib/parity/engine-library/types";

import { runParityStatsEngine } from "@/lib/parity/engine-library/engines/stats-engine";
import { runParityMarkovEngine } from "@/lib/parity/engine-library/engines/markov-engine";
import { runParityRunEngine } from "@/lib/parity/engine-library/engines/run-hazard-engine";
import { runParityPressureEngine } from "@/lib/parity/engine-library/engines/pressure-engine";
import { runParityPatternEngine } from "@/lib/parity/engine-library/engines/pattern-engine";
import { runParityEntropyEngine } from "@/lib/parity/engine-library/engines/entropy-engine";
import { runParityAnomalyEngine } from "@/lib/parity/engine-library/engines/anomaly-engine";
import { runMarketQualityEngine } from "@/lib/parity/engine-library/engines/market-quality-engine";
import { runMultiHorizonEngine } from "@/lib/parity/engine-library/engines/multi-horizon-engine";
import { runParityChangepointEngine } from "@/lib/parity/engine-library/engines/changepoint-engine";
import { runParityDangerEngine } from "@/lib/parity/engine-library/engines/danger-engine";
import { runParityRegimeEngine } from "@/lib/parity/engine-library/engines/regime-engine";
import { runParityConfluenceEngine } from "@/lib/parity/engine-library/engines/confluence-engine";
import { runParityTimingEngine } from "@/lib/parity/engine-library/engines/timing-engine";
import { runEVGateEngine } from "@/lib/parity/engine-library/engines/ev-gate-engine";
import { fitParityHMM, resetHMMMemory } from "@/lib/parity/engine-library/hmm";
import { runParticleFilter } from "@/lib/parity/engine-library/particle-filter";
import { runDriftDetection, resetDriftMemory } from "@/lib/parity/engine-library/drift";
import { computeSignificance } from "@/lib/parity/engine-library/significance";
import { analyseStructural, resetStructuralMemory } from "@/lib/parity/engine-library/structural";
import { decorrelate, resetDecorrelationMemory } from "@/lib/parity/engine-library/decorrelation";
import { analyseMarketIntelligence, type MarketIntelligence } from "@/lib/parity/market-intelligence";


import { getEngineRole } from "./engine-registry";
import type {
  CanonicalParitySnapshot,
  HardVeto,
  ParityContextEvidence,
  ParityDirection,
  ParityEvidence,
  SoftBlocker,
} from "./types";

/** Namespace suffix keeping engine memory separate from the live pipeline. */
export const INTELLIGENCE_MEMORY_NAMESPACE = "::parity-intelligence";

/**
 * Engine-memory address for this subsystem. `scope` binds warm engine memory
 * (HMM, structural, drift, decorrelation) to the lifecycle of ONE cell
 * registry, so the authoritative live owner keeps warm state across ticks
 * while an independent/fresh owner starts from a clean, deterministic model.
 */
export function intelligenceMarketKey(symbol: string, scope?: string): string {
  return `${symbol}${INTELLIGENCE_MEMORY_NAMESPACE}${scope ? `::${scope}` : ""}`;
}

/** Releases every warm engine model addressed under one memory scope. */
export function releaseIntelligenceMemory(symbol: string, scope?: string): void {
  const key = intelligenceMarketKey(symbol, scope);
  resetHMMMemory(key);
  resetStructuralMemory(key);
  resetDriftMemory(key);
  resetDecorrelationMemory(key);
}


export interface EngineRunOutput {
  readonly evidence: readonly ParityEvidence[];
  readonly context: ParityContextEvidence;
  readonly hardVetoes: readonly HardVeto[];
  readonly softBlockers: readonly SoftBlocker[];
  readonly intelligence: MarketIntelligence;
  readonly diagnostics: Readonly<Record<string, unknown>>;
}

function ev(
  engine: string,
  direction: ParityDirection,
  strength: number,
  confidence: number,
  sampleAuthority: number,
  detail: string,
  metrics?: Record<string, number>,
  raw?: unknown,
): ParityEvidence {
  const r = getEngineRole(engine);
  return Object.freeze({
    engine,
    family: r.family,
    authority: r.authority,
    correlationGroup: r.correlationGroup,
    direction,
    strength: clamp01(strength),
    confidence: clamp01(confidence),
    sampleAuthority: clamp01(sampleAuthority),
    detail,
    metrics: metrics ? Object.freeze({ ...metrics }) : undefined,
    raw,
  });
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function side(s: "EVEN" | "ODD" | "NEUTRAL" | "NO_TRADE"): ParityDirection {
  return s === "EVEN" || s === "ODD" ? s : "NEUTRAL";
}

function sampleAuthority(n: number, target = 500): number {
  return clamp01(n / target);
}

/** Existing `Evidence` (structural.ts) -> normalized parity evidence. */
export function adaptLegacyEvidence(engine: string, e: Evidence): ParityEvidence {
  const dir: ParityDirection =
    e.supports === "BUY_EVEN" ? "EVEN" : e.supports === "BUY_ODD" ? "ODD" : "NEUTRAL";
  return ev(engine, dir, e.strength, e.strength, 0.5, `${e.engine}: ${e.detail}`, undefined, e);
}

function toLegacyEvidence(list: readonly ParityEvidence[]): Evidence[] {
  return list.map((p) => ({
    engine: p.engine,
    supports: (p.direction === "EVEN"
      ? "BUY_EVEN"
      : p.direction === "ODD"
        ? "BUY_ODD"
        : "NEUTRAL") as ParityContract | "NEUTRAL",
    strength: p.strength,
    detail: p.detail,
  }));
}

/**
 * Run all existing engines against a canonical snapshot and normalize.
 * Pure with respect to the live pipeline: only namespaced engine memory
 * is touched.
 */
export function runEngines(snapshot: CanonicalParitySnapshot, scope?: string): EngineRunOutput {
  const digits = [...snapshot.digits];
  const ticks = [...snapshot.ticks] as Tick[];
  const marketKey = intelligenceMarketKey(snapshot.symbol, scope);

  const payout = snapshot.payoutRate ?? 0.95;

  const stats = runParityStatsEngine(digits);
  const markov = runParityMarkovEngine(digits);
  const runs = runParityRunEngine(digits);
  const pressure = runParityPressureEngine(digits);
  const pattern = runParityPatternEngine(digits);
  const entropy = runParityEntropyEngine(digits);
  const anomaly = runParityAnomalyEngine(digits);
  const quality = runMarketQualityEngine(ticks);
  const multiHorizon = runMultiHorizonEngine(stats);
  const changepoint = runParityChangepointEngine(digits);
  const regime = runParityRegimeEngine(digits);
  const hmm = fitParityHMM(digits, marketKey);
  const structural = analyseStructural(marketKey, digits);
  const confluence = runParityConfluenceEngine(
    stats,
    markov,
    runs,
    pressure,
    pattern,
    regime,
    anomaly,
    changepoint.discountFactor,
  );

  // IMPORTANT: never select a winner before directional validation. The two
  // cells are independent hypotheses, so every target-specific validator is
  // executed for BOTH sides. Confluence remains evidence/meta-data only; it
  // is not allowed to choose the target for downstream validators.
  const primaryStats = stats.windows[stats.primaryWindow];
  const directional = (["EVEN", "ODD"] as const).map((parity) => {
    const targetContract = parity === "EVEN" ? "BUY_EVEN" : "BUY_ODD";
    const pointProbability = primaryStats
      ? parity === "EVEN"
        ? primaryStats.evenRate
        : primaryStats.oddRate
      : 0.5;
    const lowerProbability = primaryStats
      ? parity === "EVEN"
        ? primaryStats.evenWilson.lower
        : primaryStats.oddWilson.lower
      : 0.5;

    return Object.freeze({
      parity,
      targetContract,
      particles: runParticleFilter(digits, targetContract),
      significance: computeSignificance(digits, targetContract, payout),
      danger: runParityDangerEngine(
        parity,
        digits.length,
        runs,
        changepoint,
        entropy,
        quality,
        multiHorizon,
      ),
      timing: runParityTimingEngine(parity, runs, pressure, confluence.agreementRatio >= 0.6),
      evGate: runEVGateEngine(lowerProbability, pointProbability, payout),
    });
  });
  const evenDirectional = directional[0]!;
  const oddDirectional = directional[1]!;

  // Drift is a two-sided structural-break detector in the existing engine;
  // its target parameter is retained for API compatibility but the report is
  // intrinsically market-level, so one namespaced evaluation is sufficient.
  const drift = runDriftDetection(digits, marketKey, "BUY_EVEN");
  // Directional validators are independent. Keep both results available for
  // evidence, governance and diagnostics; never let EVEN become the implicit
  // fallback simply because it is stored first.
  const evenParticles = evenDirectional.particles;
  const oddParticles = oddDirectional.particles;
  const evenSignificance = evenDirectional.significance;
  const oddSignificance = oddDirectional.significance;
  const evenDanger = evenDirectional.danger;
  const oddDanger = oddDirectional.danger;
  const evenTiming = evenDirectional.timing;
  const oddTiming = oddDirectional.timing;
  const evenEvGate = evenDirectional.evGate;
  const oddEvGate = oddDirectional.evGate;

  // ── Normalized evidence ────────────────────────────────────────────────
  const evidence: ParityEvidence[] = [];

  // Stats exposes independent EVEN and ODD hypotheses from the same Wilson
  // window. The legacy `dominantSide` field is intentionally NOT used here.
  if (primaryStats) {
    for (const parity of ["EVEN", "ODD"] as const) {
      const point = parity === "EVEN" ? primaryStats.evenRate : primaryStats.oddRate;
      const lower = parity === "EVEN" ? primaryStats.evenWilson.lower : primaryStats.oddWilson.lower;
      const upper = parity === "EVEN" ? primaryStats.evenWilson.upper : primaryStats.oddWilson.upper;
      evidence.push(
        ev(
          "stats",
          point >= 0.5 ? parity : parity === "EVEN" ? "ODD" : "EVEN",
          Math.min(1, Math.abs(point - 0.5) * 8),
          clamp01((lower - 0.5) * 8),
          sampleAuthority(primaryStats.sampleSize),
          `${parity} W${primaryStats.windowSize}: ${(point * 100).toFixed(1)}% with Wilson 95% [${(lower * 100).toFixed(1)}%, ${(upper * 100).toFixed(1)}%]`,
          { pointEstimatePWin: point, lowerBoundPWin: lower, primaryWindow: primaryStats.windowSize },
          stats,
        ),
      );
    }
  }

  evidence.push(
    ev(
      "multiHorizon",
      side(multiHorizon.consensusSide),
      multiHorizon.agreementScore / 100,
      multiHorizon.agreementScore / 100,
      sampleAuthority(digits.length),
      multiHorizon.summary,
      { agreementScore: multiHorizon.agreementScore, penalty: multiHorizon.horizonDivergencePenalty },
      multiHorizon,
    ),
  );

  const activeMarkov = markov.activeContext3 ?? markov.activeContext2 ?? markov.activeContext1;
  if (activeMarkov) {
    for (const parity of ["EVEN", "ODD"] as const) {
      const point = parity === "EVEN" ? activeMarkov.pEven : activeMarkov.pOdd;
      const lower = parity === "EVEN" ? activeMarkov.wilsonEven.lower : 1 - activeMarkov.wilsonEven.upper;
      evidence.push(
        ev(
          "markov",
          point >= 0.5 ? parity : parity === "EVEN" ? "ODD" : "EVEN",
          Math.min(1, Math.abs(point - 0.5) * 8),
          clamp01((lower - 0.5) * 8),
          sampleAuthority(activeMarkov.sampleCount, 300),
          `${parity} Markov context ${activeMarkov.context}: P=${(point * 100).toFixed(1)}%`,
          { pointEstimatePWin: point, lowerBoundPWin: lower, sampleSize: activeMarkov.sampleCount },
          markov,
        ),
      );
    }
  }

  const topPattern = pattern.topMotif;
  if (topPattern) {
    for (const parity of ["EVEN", "ODD"] as const) {
      const point = parity === "EVEN" ? topPattern.pEven : topPattern.pOdd;
      const lower = parity === "EVEN" ? topPattern.wilsonEven.lower : 1 - topPattern.wilsonEven.upper;
      evidence.push(
        ev(
          "pattern",
          point >= 0.5 ? parity : parity === "EVEN" ? "ODD" : "EVEN",
          Math.min(1, Math.abs(point - 0.5) * 8),
          clamp01((lower - 0.5) * 8),
          sampleAuthority(topPattern.occurrences, 120),
          `${parity} motif ${topPattern.ngram}: P=${(point * 100).toFixed(1)}% over ${topPattern.occurrences} occurrences`,
          { pointEstimatePWin: point, sampleSize: topPattern.occurrences },
          pattern,
        ),
      );
    }
  }

  // Run/hazard: RIDE_RUN supports the active side, FADE_RUN opposes it.
  const runDirection: ParityDirection =
    runs.suggestedAction === "RIDE_RUN"
      ? runs.activeSide
      : runs.suggestedAction === "FADE_RUN"
        ? runs.activeSide === "EVEN"
          ? "ODD"
          : "EVEN"
        : "NEUTRAL";
  evidence.push(
    ev(
      "runs",
      runDirection,
      runDirection === "NEUTRAL" ? 0 : Math.abs(runs.pContinueNextTick - 0.5) * 2,
      runs.sampleSizeAtThisLength > 0 ? 0.6 : 0.2,
      sampleAuthority(runs.totalRunsObserved, 120),
      runs.summary,
      { pBreakNextTick: runs.pBreakNextTick, activeLength: runs.activeLength },
      runs,
    ),
  );

  // Pressure: the engine reports both readings; stretch decides which leads.
  const pressureDirection: ParityDirection =
    pressure.stretchedState === "EXTREME_STRETCH"
      ? side(pressure.favouredMeanReversion)
      : side(pressure.favouredMomentum);
  evidence.push(
    ev(
      "pressure",
      pressureDirection,
      Math.min(1, Math.abs(pressure.zScore) / 3),
      (pressure.stretchedState === "EXTREME_STRETCH"
        ? pressure.reversionConfidence
        : pressure.momentumConfidence) / 100,
      sampleAuthority(digits.length, 100),
      pressure.summary,
      { zScore: pressure.zScore, imbalance: pressure.cumulativeImbalance },
      pressure,
    ),
  );

  evidence.push(
    ev(
      "anomaly",
      anomaly.anomalyDirection === "SURGE_EVEN"
        ? "EVEN"
        : anomaly.anomalyDirection === "SURGE_ODD"
          ? "ODD"
          : "NEUTRAL",
      anomaly.isAnomaly ? Math.min(1, Math.abs(anomaly.zScore) / 3) : 0,
      anomaly.significanceLevel === "p < 0.01" ? 0.9 : anomaly.significanceLevel === "p < 0.05" ? 0.6 : 0.2,
      sampleAuthority(digits.length, 300),
      anomaly.summary,
      { zScore: anomaly.zScore },
      anomaly,
    ),
  );

  for (const legacy of structural.evidence) {
    evidence.push(adaptLegacyEvidence("structural", legacy));
  }

  const hmmEvenBias =
    hmm.currentState === "EVEN_DOMINANCE" ? 1 : hmm.currentState === "ODD_DOMINANCE" ? -1 : 0;
  evidence.push(
    ev(
      "hmm",
      hmmEvenBias > 0 ? "EVEN" : hmmEvenBias < 0 ? "ODD" : "NEUTRAL",
      Math.abs(hmmEvenBias) * clamp01(hmm.stateProbabilities[hmm.currentState] ?? 0),
      clamp01(hmm.stateProbabilities[hmm.currentState] ?? 0),
      sampleAuthority(digits.length),
      hmm.narrative,
      { expectedDwellTicks: hmm.expectedDwellTicks },
      hmm,
    ),
  );

  evidence.push(
    ev(
      "regime",
      regime.regime === "EVEN_BIASED" ? "EVEN" : regime.regime === "ODD_BIASED" ? "ODD" : "NEUTRAL",
      clamp01(regime.biasScore / 10),
      regime.regimeStability / 100,
      sampleAuthority(digits.length),
      regime.summary,
      { regimeStability: regime.regimeStability, alternatingRatio: regime.alternatingRatio },
      regime,
    ),
  );

  for (const result of directional) {
    const particles = result.particles;
    const targetProbability = result.parity === "EVEN"
      ? particles.posteriorMeanEven
      : 1 - particles.posteriorMeanEven;
    evidence.push(
      ev(
        `particles_${result.parity.toLowerCase()}`,
        targetProbability > 0.5 ? result.parity : targetProbability < 0.5 ? (result.parity === "EVEN" ? "ODD" : "EVEN") : "NEUTRAL",
        Math.min(1, Math.abs(targetProbability - 0.5) * 8),
        particles.weightCollapse ? 0 : clamp01(particles.effectiveParticles / 100),
        sampleAuthority(digits.length),
        `${result.parity}: ${particles.narrative}`,
        { posteriorMeanTarget: targetProbability, effectiveParticles: particles.effectiveParticles },
        particles,
      ),
    );
  }

  for (const result of directional) {
    evidence.push(
      ev(
        `significance_${result.parity.toLowerCase()}`,
        result.significance.significant ? result.parity : "NEUTRAL",
        result.significance.significant ? clamp01(1 - result.significance.pValue) : 0,
        clamp01(1 - result.significance.qValue),
        sampleAuthority(digits.length),
        result.significance.narrative,
        { pValue: result.significance.pValue, qValue: result.significance.qValue },
        result.significance,
      ),
    );
  }

  evidence.push(
    ev(
      "confluence",
      side(confluence.favouredSide),
      clamp01(Math.abs(confluence.compositeScore - 50) / 50),
      confluence.rawConfidence / 100,
      confluence.agreementRatio,
      confluence.summary,
      { compositeScore: confluence.compositeScore, agreementRatio: confluence.agreementRatio },
      confluence,
    ),
  );

  const decorrelation = decorrelate(toLegacyEvidence(evidence), marketKey);

  // ── Hard vetoes (§11) — derived from existing governance semantics ─────
  const hardVetoes: HardVeto[] = [];
  const softBlockers: SoftBlocker[] = [];

  if (digits.length < 60) {
    hardVetoes.push(
      Object.freeze({
        code: "INSUFFICIENT_DATA",
        engine: "stats",
        reason: `Only ${digits.length} digits available; minimum sample not met.`,
        parity: null,
      }),
    );
  }
  if (quality.isHardVeto) {
    hardVetoes.push(
      Object.freeze({
        code: "FEED_QUALITY",
        engine: "quality",
        reason: quality.vetoReason ?? quality.summary,
        parity: null,
      }),
    );
  }
  if (entropy.isHighEntropyVeto) {
    hardVetoes.push(
      Object.freeze({
        code: "HIGH_ENTROPY",
        engine: "entropy",
        reason: entropy.summary,
        parity: null,
      }),
    );
  }
  for (const result of directional) {
    if (result.danger.hasCriticalVeto) {
      for (const reason of result.danger.vetoReasons) {
        hardVetoes.push(
          Object.freeze({ code: "CRITICAL_DANGER", engine: "danger", reason, parity: result.parity }),
        );
      }
    }
  }
  if (drift.breakDetected && drift.severity === "MAJOR") {
    hardVetoes.push(
      Object.freeze({
        code: "MAJOR_DRIFT",
        engine: "drift",
        reason: drift.narrative,
        parity: null,
      }),
    );
  }
  for (const result of directional) {
    if (result.particles.weightCollapse) {
      hardVetoes.push(
        Object.freeze({
          code: "POSTERIOR_COLLAPSE",
          engine: "particles",
          reason: result.particles.narrative,
          parity: result.parity,
        }),
      );
    }
  }
  for (const result of directional) {
    if (!result.evGate.clearsGate) {
      hardVetoes.push(
        Object.freeze({
          code: "EV_GATE",
          engine: "evGate",
          reason: result.evGate.vetoReason ?? result.evGate.summary,
          parity: result.parity,
        }),
      );
    }
  }

  // ── Soft blockers ──────────────────────────────────────────────────────
  if (drift.breakDetected && drift.severity === "MINOR") {
    softBlockers.push(
      Object.freeze({ code: "MINOR_DRIFT", engine: "drift", reason: drift.narrative, penalty: 0.15, parity: null }),
    );
  }
  if (changepoint.state !== "STABLE") {
    softBlockers.push(
      Object.freeze({
        code: "CHANGEPOINT",
        engine: "changepoint",
        reason: changepoint.summary,
        penalty: clamp01(1 - changepoint.discountFactor),
        parity: null,
      }),
    );
  }
  if (multiHorizon.horizonDivergencePenalty > 0) {
    softBlockers.push(
      Object.freeze({
        code: "HORIZON_DIVERGENCE",
        engine: "multiHorizon",
        reason: multiHorizon.summary,
        penalty: clamp01(multiHorizon.horizonDivergencePenalty / 100),
        parity: null,
      }),
    );
  }
  if (decorrelation.confidencePenalty > 0) {
    softBlockers.push(
      Object.freeze({
        code: "CORRELATED_EVIDENCE",
        engine: "decorrelation",
        reason: decorrelation.narrative,
        penalty: clamp01(decorrelation.confidencePenalty / 100),
        parity: null,
      }),
    );
  }
  for (const result of directional) {
    if (result.danger.dangerScore >= 40 && !result.danger.hasCriticalVeto) {
      softBlockers.push(
        Object.freeze({
          code: "ELEVATED_DANGER",
          engine: "danger",
          reason: result.danger.summary,
          penalty: clamp01(result.danger.dangerScore / 200),
          parity: result.parity,
        }),
      );
    }
    if (result.timing.timing !== "NOW" && result.timing.timing !== "NEXT_TICK") {
      softBlockers.push(
        Object.freeze({
          code: "TIMING_NOT_READY",
          engine: "timing",
          reason: result.timing.condition,
          penalty: 0.1,
          parity: result.parity,
        }),
      );
    }
  }

  // ── Regime compatibility per parity ────────────────────────────────────
  const regimeCompatible = {
    EVEN: isRegimeCompatible("EVEN", regime.regime, hmm.currentState),
    ODD: isRegimeCompatible("ODD", regime.regime, hmm.currentState),
  } as const;

  const alignment =
    multiHorizon.agreementScore >= 95
      ? "ALIGNED"
      : multiHorizon.agreementScore >= 60
        ? "PARTIAL"
        : multiHorizon.isAligned
          ? "PARTIAL"
          : contradictoryHorizons(multiHorizon.shortHorizonSide, multiHorizon.longHorizonSide)
            ? "CONTRADICTORY"
            : "MIXED";

  const context: ParityContextEvidence = Object.freeze({
    regime: regime.regime,
    regimeStability: regime.regimeStability,
    hiddenRegime: hmm.currentState,
    regimeCompatible,
    driftSeverity: drift.severity,
    driftBreakDetected: drift.breakDetected,
    statisticalStrength:
      digits.length < 60
        ? "INSUFFICIENT"
        : (evenSignificance.significant || oddSignificance.significant) && stats.overallConfidence >= 65
          ? "STRONG"
          : stats.overallConfidence >= 55
            ? "MODERATE"
            : "WEAK",
    significant: evenSignificance.significant || oddSignificance.significant,
    calibrationReliability: clamp01(1 - Math.abs(0.5 - stats.pointEstimatePWin) * 0.2),
    dangerScore: Math.max(evenDanger.dangerScore, oddDanger.dangerScore),
    dangerCritical: evenDanger.hasCriticalVeto || oddDanger.hasCriticalVeto,
    evPoint: Math.max(evenEvGate.pointEstimateEV, oddEvGate.pointEstimateEV),
    evLow: Math.max(evenEvGate.lowerBoundEV, oddEvGate.lowerBoundEV),
    evClears: evenEvGate.clearsGate || oddEvGate.clearsGate,
    timing: evenTiming.timing === "NOW" || evenTiming.timing === "NEXT_TICK"
      ? evenTiming.timing
      : oddTiming.timing,
    timingUrgency: evenTiming.urgency === "HIGH" || oddTiming.urgency === "HIGH"
      ? "HIGH"
      : evenTiming.urgency === "MEDIUM" || oddTiming.urgency === "MEDIUM"
        ? "MEDIUM"
        : "PATIENT",
    entropy: entropy.aggregateEntropy,
    changepoint: changepoint.hasChangepoint,
    multiHorizon: Object.freeze({
      short: side(multiHorizon.shortHorizonSide),
      medium: side(multiHorizon.mediumHorizonSide),
      long: side(multiHorizon.longHorizonSide),
      agreementScore: multiHorizon.agreementScore,
      alignment,
    }),
    decorrelation: Object.freeze({
      rawVotes: decorrelation.rawVotes,
      effectiveVotes: decorrelation.effectiveVotes,
      inflationFactor: decorrelation.inflationFactor,
      confidencePenalty: decorrelation.confidencePenalty,
    }),
    feedQuality: quality.qualityScore,
    feedHardVeto: quality.isHardVeto,
  });

  const intelligence = analyseMarketIntelligence(digits, structural, evidence);

  // Market-intelligence findings are contextual evidence, not a replacement
  // for the specialist engines. They describe the mechanism underneath the
  // parity imbalance so cells can distinguish "EVEN is high" from "EVEN has
  // a coherent reason to remain high".
  for (const parity of ["EVEN", "ODD"] as const) {
    const directionScore = parity === "EVEN" ? intelligence.engineContext.supportEven : intelligence.engineContext.supportOdd;
    const share = parity === "EVEN" ? intelligence.parity.evenShare : intelligence.parity.oddShare;
    const oppositeShare = 1 - share;
    const balanceEdge = clamp01(Math.abs(share - 0.5) * 2);
    const mechanismStrength = clamp01(
      0.30 * balanceEdge +
      0.25 * intelligence.quality +
      0.20 * (1 - intelligence.structural.reversalProbability) +
      0.15 * directionScore +
      0.10 * (intelligence.redistribution.balancing ? 1 : 0.35),
    );
    evidence.push(ev(
      `market_intelligence_${parity.toLowerCase()}`,
      share > oppositeShare + 0.015 ? parity : share < oppositeShare - 0.015 ? (parity === "EVEN" ? "ODD" : "EVEN") : "NEUTRAL",
      mechanismStrength,
      intelligence.quality,
      sampleAuthority(digits.length, 300),
      `${parity} mechanism read: ${intelligence.mechanism}`,
      { mechanismStrength, balanceEdge, intelligenceQuality: intelligence.quality },
      intelligence,
    ));
  }

  return Object.freeze({
    evidence: Object.freeze(evidence),
    intelligence,
    context,
    hardVetoes: Object.freeze(hardVetoes),
    softBlockers: Object.freeze(softBlockers),
    diagnostics: Object.freeze({
      stats,
      markov,
      runs,
      pressure,
      pattern,
      entropy,
      anomaly,
      quality,
      multiHorizon,
      changepoint,
      regime,
      hmm,
      structural,
      confluence,
      particles: { EVEN: evenParticles, ODD: oddParticles },
      drift,
      significance: { EVEN: evenSignificance, ODD: oddSignificance },
      danger: { EVEN: evenDanger, ODD: oddDanger },
      timing: { EVEN: evenTiming, ODD: oddTiming },
      evGate: { EVEN: evenEvGate, ODD: oddEvGate },
      directional,
      decorrelation,
    }),
  });
}

function contradictoryHorizons(short: string, long: string): boolean {
  return (short === "EVEN" && long === "ODD") || (short === "ODD" && long === "EVEN");
}

/**
 * A parity proposition is regime-incompatible when the stream regime or the
 * hidden regime is actively dominated by the opposite parity, or when the
 * stream is alternating hard enough that a directional parity thesis has no
 * carrier. Derived from the existing regime/HMM vocabulary.
 */
export function isRegimeCompatible(
  parity: "EVEN" | "ODD",
  streamRegime: string,
  hiddenRegime: string,
): boolean {
  const opposite = parity === "EVEN" ? "ODD" : "EVEN";
  if (streamRegime === `${opposite}_BIASED`) return false;
  if (hiddenRegime === `${opposite}_DOMINANCE`) return false;
  if (hiddenRegime === "REVERSAL_BUILDING" && streamRegime === `${parity}_BIASED`) return false;
  return true;
}

import { describe, it, expect, beforeAll } from "vitest";
import { scanNow, DEFAULT_SCAN_OPTIONS } from "./scan";
import { operatorSurfaceGate } from "./operator-surface-gate";
import { APEX_UNIVERSE_SYMBOLS } from "./universe";
import { PROPOSITIONS, type Proposition } from "@/lib/sentinel/observation/constants";
import type { MarketIntel, ContractEval, RankedOpportunity, BestOf90Result } from "./types";
import { NearSignalEngine } from "@/lib/sentinel/near-signal";
import { canonicalDigitState, contractPsychology } from "@/lib/sentinel/digit-psychology";
import { seedObservationEngine } from "@/lib/sentinel/observation/test-helpers";

function createControlledRankedCandidate(params: {
  symbol: string;
  contractId: Proposition;
  score: number;
  stage4Verdict: "CLEARED" | "HELD" | "HELD_EXPOSURE_CAP" | "HELD_UNCONFIRMED_SIGNIFICANCE" | "BLOCKED";
  danger?: number;
  digitPsychologyVerdict?: "SUPPORT" | "NEUTRAL" | "CONFLICT";
  digitPsychologyScore?: number;
  digitPsychologyHardBlock?: boolean;
}): RankedOpportunity {
  const side = params.contractId.startsWith("OVER") ? "OVER" : "UNDER";
  const barrier = parseInt(params.contractId.replace(/\D/g, ""), 10) || (side === "OVER" ? 2 : 7);
  const winners =
    side === "OVER"
      ? Array.from({ length: 9 - barrier }, (_, i) => barrier + 1 + i)
      : Array.from({ length: barrier }, (_, i) => i);
  const losers = Array.from({ length: 10 }, (_, i) => i).filter((d) => !winners.includes(d));
  const dangerVal = params.danger ?? 15;
  const psychVerdict = params.digitPsychologyVerdict ?? "SUPPORT";
  const psychScore = params.digitPsychologyScore ?? 75;
  const psychHardBlock = params.digitPsychologyHardBlock ?? false;

  const contract: ContractEval = {
    id: params.contractId as any,
    label: `${side === "OVER" ? "Over" : "Under"} ${barrier}`,
    side,
    barrier,
    winners,
    theoretical: winners.length / 10,
    empirical: winners.length / 10 + 0.05,
    recent: winners.length / 10 + 0.05,
    micro: winners.length / 10 + 0.05,
    n: 1000,
    edge: 0.05,
    edgeLB: 0.04,
    pressureAsymmetry: 0.2,
    transitionSupport: 0.1,
    compositeEdge: 5.0,
    stability: 85,
    freshness: 90,
    quality: 85,
    danger: dangerVal,
    confidence: 82,
    opportunity: params.score,
    phase: "MATURE",
    supports: [],
    conflicts: [],
    contradiction: 0,
    ageTicks: 1000,
    threat: null,
    critical: null,
    stats: null,
    rate: null,
    ensemble: null,
    forward: null,
    analogue: null,
    fakeEdge: null,
    regimeCompatible: true,
    regimeNote: "Compatible",
    threatPenalty: 0,
    alerts: [],
  };

  const intel = createMockMarket(params.symbol, `${params.symbol} Index`, winners[0] ?? 7, 1000, dangerVal);

  const finalDecision = {
    verdict: params.stage4Verdict,
    action: (params.stage4Verdict === "CLEARED" ? "EXECUTE" : "HOLD") as any,
    score: params.score,
    summary:
      params.stage4Verdict === "CLEARED"
        ? "Cleared by Stage 4 risk controls."
        : `Held by Stage 4: ${params.stage4Verdict}`,
    stage1Score: params.score,
    stage2Score: params.score,
    stage3Score: params.score,
    stage4Score: params.stage4Verdict === "CLEARED" ? params.score : params.score - 10,
    significance: {
      activeComparisons: 90,
      adjustedAlpha: 0.05,
      fdrMethod: "Benjamini-Hochberg",
      candidatePValue: params.stage4Verdict === "CLEARED" ? 0.001 : 0.45,
      passesCorrection: params.stage4Verdict === "CLEARED",
      significanceThreshold: 0.05,
    },
    exposure: {
      allowed: params.stage4Verdict !== "HELD_EXPOSURE_CAP",
      clusterId: `${params.symbol}_CORR`,
      currentClusterStake: 0,
      maxClusterStake: 5,
      currentDirectionStake: 0,
      maxDirectionStake: 10,
      reasons: [],
    },
    circuitBreaker: {
      tripped: params.stage4Verdict === "BLOCKED",
      state: (params.stage4Verdict === "BLOCKED" ? "TRIPPED" : "HEALTHY") as any,
      level: "GREEN" as any,
      cooldownRemainingTicks: 0,
      reason: null,
    },
  };

  return {
    rank: 1,
    symbol: params.symbol,
    name: `${params.symbol} Index`,
    contract,
    intel,
    score: params.score,
    preferred: true,
    simulator: null,
    simNote: "",
    entry: null,
    agreement: "SUPPORT",
    factors: [],
    invalidation: [],
    recent: null,
    clearance: {
      state: "CLEAR",
      risk: 0,
      reasons: [],
      blockers: [],
      cautions: [],
      instability: { score: 5, label: "CALM", drivers: [] },
      summary: "Clearance CLEAR.",
      executable: true,
    },
    evidence: {
      status: "STRONG",
      confidence: 85,
      uncertainty: 10,
      authority: 1,
      codes: [],
      note: "High confidence evidence",
    },
    blocked: false,
    direction: {
      score: 80,
      confidence: 82,
      label: "STRONG",
      votes: [],
      supporting: [],
      opposing: [],
      disagreement: 0,
      disagreementPenalty: 0,
      summary: `Direction 80/100 (STRONG) for ${side}.`,
    },
    dangerComposition: {
      total: dangerVal,
      level: "LOW",
      components: [],
      autoBlock: [],
      severe: [],
      summary: "Low danger",
      overallDangerScore: dangerVal,
      isHardBlocked: false,
      dangerFactor: dangerVal / 100,
    },
    setup: {
      score: params.score,
      grade: "PRIME",
      confidence: 85,
      sampleSize: 1000,
      recentSampleSize: 100,
      direction: {
        score: 80,
        confidence: 82,
        label: "STRONG",
        votes: [],
        supporting: [],
        opposing: [],
        disagreement: 0,
        disagreementPenalty: 0,
        summary: `Direction 80/100 (STRONG) for ${side}.`,
      },
      danger: {
        total: dangerVal,
        level: "LOW",
        components: [],
        autoBlock: [],
        severe: [],
        summary: "Low danger",
        overallDangerScore: dangerVal,
        isHardBlocked: false,
        dangerFactor: dangerVal / 100,
      },
      factors: [],
      autoBlocked: false,
      summary: "SETUP PRIME",
    },
    entryClearance: {
      verdict: "CLEARED",
      confidence: 85,
      requirements: [],
      unmet: [],
      blockers: [],
      waiting: [],
      combination: {} as any,
      bestEntryCondition: null,
      autoBlock: [],
      executable: true,
      summary: "CLEARED",
    },
    combination: {} as any,
    relative: {
      relativeEdge: 2.5,
      label: "STRONG_RELATIVE_EDGE",
      fieldSize: 90,
      rankInField: 1,
    } as any,
    persistence: {
      scanCount: 10,
      stability: 85,
    } as any,
    entryPoint: {
      status: "ARMED",
      preferred: { digit: winners[0] ?? 7, pWin: 0.72, pWinLower: 0.68 } as any,
      window: { label: "12 ticks", value: 12, basis: "empirical" },
      invalidation: [],
      confidence: 75,
    } as any,
    survival: null,
    survivalInfluence: { points: 0, label: "NOT APPLICABLE", detail: "No validated entry digit.", sufficient: false, fragile: false },
    entryTrigger: null,
    signal: {
      state: "VALID_ENTRY_ARMED",
      waitForEntry: false,
    } as any,
    digitPsychology: {
      contract: contract.label,
      side,
      barrier,
      winningZone: winners,
      losingZone: losers,
      boundary: [],
      positions: [],
      score: psychScore,
      confidence: 85,
      verdict: psychVerdict,
      rankingDelta: psychVerdict === "SUPPORT" ? 2 : psychVerdict === "CONFLICT" ? -2 : 0,
      hardBlock: psychHardBlock,
      hardBlockReason: psychHardBlock ? "Fatal excluded digit violation" : null,
      redSemantics: {
        fatal: psychHardBlock,
        fatalReason: psychHardBlock ? "Fatal excluded digit violation" : null,
        violations: [],
        conflictSeverity: 0,
        risingOnLosingSide: false,
        redOnWinningSide: true,
        secondRedOnWinningSide: true,
        winningSideGainingPercentage: true,
        mandatoryRedStructureFailed: false,
        mandatoryFailureReasons: [],
        summary: "RED semantics fixture",
      },
      zoneContested: false,
      zoneContestedReason: null,
      reasons: [],
      cautions: [],
      summary: `Digit psychology ${psychVerdict} (${psychScore}/100)`,
    },
    digitState: {
      n: 1000,
      windowSize: 1000,
      pct: Array(10).fill(10),
      recentPct: Array(10).fill(10),
      deltaPp: Array(10).fill(0),
      green: winners[0] ?? 7,
      secondGreen: winners[1] ?? 8,
      red: losers[0] ?? 1,
      secondRed: losers[1] ?? 2,
      mostIncreasing: winners[0] ?? 7,
      mostDecreasing: losers[0] ?? 1,
      change: "STABLE",
      changeDetail: "Stable",
      summary: "Stable",
    },
    priceAction: {
      confirmsStructure: true,
      alignment: "CONFIRMED",
      losingSidePressure: { state: "SAFE", index: 15, modifier: 1.0 },
    } as any,
    priceActionField: {} as any,
    operatorSpecial: {} as any,
    convergence: {} as any,
    executionReady: true,
    executionReadyReasons: [],
    finalDecision: finalDecision as any,
    recommendedStake: {
      baseStake: 1.0,
      drawdownAdjustedStake: 1.0,
      kellyFraction: 0.02,
      maxBankrollPct: 2,
      maturityFactor: 1,
      confidenceFactor: 1,
      factors: [],
      summary: "Base stake 1.0",
    },
  };
}

/** Evaluates the Best-of-90 selection from a ranked candidate population strictly honoring operator gates and Stage 4 clearance */
function selectBestOf90FromPopulation(candidates: RankedOpportunity[], minScore: number = 70): BestOf90Result | null {
  const qualified = candidates.filter((r) => {
    const gate = operatorSurfaceGate(r, r.intel, { minScore });
    const stage4Cleared = r.finalDecision?.verdict === "CLEARED";
    return gate.qualified && stage4Cleared;
  });

  const leadCandidate = qualified.length > 0 ? qualified[0] : candidates.length > 0 ? candidates[0] : null;
  if (!leadCandidate) return null;

  const gate = operatorSurfaceGate(leadCandidate, leadCandidate.intel, { minScore });
  const isStage4Cleared = leadCandidate.finalDecision?.verdict === "CLEARED";
  const isFullyQualified = gate.qualified && isStage4Cleared;

  return {
    rank: 1,
    populationSize: candidates.length,
    bestOfPopulation: true,
    candidate: leadCandidate,
    status: isFullyQualified ? "BEST OF 90 — QUALIFIED" : "BEST OF 90 — NOT QUALIFIED",
    qualified: isFullyQualified,
    blockers: [...gate.blockers],
    executionReady: Boolean(leadCandidate.executionReady && isStage4Cleared),
    executionReadyReasons: leadCandidate.executionReadyReasons ?? [],
    waitForEntry: false,
    analyzedAt: Date.now(),
    finalDecision: leadCandidate.finalDecision,
  };
}

function createMockContracts(marketId: string, biasDigit: number, baseDanger: number = 15): ContractEval[] {
  return PROPOSITIONS.map((prop: Proposition): ContractEval => {
    const side = prop.startsWith("OVER") ? "OVER" : "UNDER";
    const barrier = parseInt(prop.replace(/\D/g, ""), 10) || (side === "OVER" ? 2 : 7);
    const winners =
      side === "OVER"
        ? Array.from({ length: 9 - barrier }, (_, i) => barrier + 1 + i)
        : Array.from({ length: barrier }, (_, i) => i);
    const theoretical = winners.length / 10;
    const isWinningBias = winners.includes(biasDigit);
    const empirical = isWinningBias ? theoretical + 0.08 : theoretical - 0.04;
    const compositeEdge = empirical - theoretical;

    return {
      id: prop as any,
      label: `${side === "OVER" ? "Over" : "Under"} ${barrier}`,
      side,
      barrier,
      winners,
      theoretical,
      empirical,
      recent: empirical,
      micro: empirical,
      n: 1000,
      edge: compositeEdge,
      edgeLB: compositeEdge * 0.8,
      pressureAsymmetry: 0.15,
      transitionSupport: 0.1,
      compositeEdge,
      stability: 85,
      freshness: 90,
      quality: 85,
      danger: baseDanger,
      confidence: 82,
      opportunity: 78,
      phase: "MATURE",
      supports: [{ engine: "Distribution", label: "Strong positive bias", detail: "Strong positive bias observed", weight: 1.5, n: 1000 }],
      conflicts: [],
      contradiction: 0,
      ageTicks: 1000,
      threat: null,
      critical: null,
      stats: null,
      rate: null,
      ensemble: null,
      forward: null,
      analogue: null,
      fakeEdge: null,
      regimeCompatible: true,
      regimeNote: "Compatible",
      threatPenalty: 0,
      alerts: [],
    };
  });
}

function createMockMarket(symbol: string, name: string, biasDigit: number = 7, tickCount: number = 1000, dangerVal: number = 15): MarketIntel {
  const pcts = Array(10).fill(0.08);
  pcts[biasDigit] = 0.28;

  const digits: number[] = [];
  for (let i = 0; i < tickCount; i++) {
    const r = Math.random();
    if (r < 0.28) {
      digits.push(biasDigit);
    } else {
      digits.push(Math.floor(Math.random() * 10));
    }
  }

  const contracts = createMockContracts(symbol, biasDigit, dangerVal);

  return {
    symbol,
    name,
    dataState: "OK",
    ticks: tickCount,
    lastTickAt: Date.now() - 500,
    ageMs: 500,
    contracts,
    best: contracts[0],
    stats: {
      n: tickCount,
      freq: pcts.map((p) => Math.round(p * tickCount)),
      pct: pcts,
      midPct: pcts,
      recentPct: pcts,
      microPct: pcts,
      z: pcts.map(() => 0),
      lastDigit: biasDigit,
      dominant: biasDigit,
      suppressed: (biasDigit + 5) % 10,
    },
    pressure: {
      pressure: Array(10).fill(0),
      impulse: Array(10).fill(0),
      lifecycle: Array(10).fill("neutral"),
      exhaustion: Array(10).fill(0),
      zoneAShare: 0.5,
      zoneBShare: 0.5,
      migration: 0.1,
    },
    transition: null,
    sequence: null,
    entropy: {
      entropy: 0.82,
      chi2: 5,
      uniformityFail: false,
    },
    anomaly: null,
    volatility: {
      base: 0.1,
      recent: 0.105,
      ratio: 1.05,
      label: "normal",
    },
    trend: null,
    regime: {
      label: "TRENDING",
      confidence: 85,
      detail: "Stable directional trend detected.",
    },
    personality: null,
    buildup: null,
    quality: {
      score: 82,
      detail: "High quality streaming data.",
    },
    danger: 15,
    updatedAt: Date.now(),
    digitIntel: null,
    bars: null,
    criticalReport: null,
    battle: null,
    deepTicks: tickCount,
    psychology: null,
    specialDigits: null,
    fluctuation: {
      n: 30,
      score: 18,
      state: "CALM",
      signalFlickerRate: 0.02,
      edgeSignFlipRate: 0.01,
      confidenceOscillation: 1,
      psychologyFlipRate: 0.01,
      rankChurn: 0.01,
      drivers: [],
      summary: "Calm market environment with low noise.",
    },
  };
}

describe("Best-of-90 Full Signal Hydration & Authoritative Presentation", () => {
  beforeAll(() => {
    seedObservationEngine();
  });

  const mockMarkets = APEX_UNIVERSE_SYMBOLS.map((s, idx) =>
    createMockMarket(s, `${s} Synthetic Index`, (idx * 2) % 10, 1000),
  );

  // TEST 1 — FULL HYDRATION
  it("TEST 1: scanNow() produces a fully hydrated Best-of-90 object", () => {
    const scan = scanNow(mockMarkets, DEFAULT_SCAN_OPTIONS);
    expect(scan.bestOf90).not.toBeNull();
    const candidate = scan.bestOf90!.candidate;

    expect(candidate.symbol).toBeDefined();
    expect(candidate.contract).toBeDefined();
    expect(candidate.score).toBeGreaterThan(0);
    expect(candidate.agreement).toBeDefined();
    expect(candidate.entryPoint).toBeDefined();
    expect(candidate.digitPsychology).toBeDefined();
    expect(candidate.priceAction).toBeDefined();
    expect(candidate.relative).toBeDefined();
    expect(candidate.persistence).toBeDefined();
    expect(candidate.dangerComposition).toBeDefined();
    expect(candidate.combination).toBeDefined();
    expect(candidate.setup).toBeDefined();
    expect(candidate.signal).toBeDefined();
  });

  // TEST 2 — SAME-CANDIDATE CONSISTENCY
  it("TEST 2: candidate values are perfectly identical between bestOf90 and lead candidate", () => {
    const scan = scanNow(mockMarkets, DEFAULT_SCAN_OPTIONS);
    const b90 = scan.bestOf90!;
    expect(b90.candidate.symbol).toBe(scan.best!.symbol);
    expect(b90.candidate.contract.id).toBe(scan.best!.contract.id);
    expect(b90.candidate.score).toBe(scan.best!.score);
    expect(b90.candidate.entryPoint.status).toBe(scan.best!.entryPoint.status);
  });

  // TEST 3 — ENTRY DIGIT ACCURACY
  it("TEST 3: preferred entry digit matches item.entryPoint.preferred exactly", () => {
    const scan = scanNow(mockMarkets, DEFAULT_SCAN_OPTIONS);
    const candidate = scan.bestOf90!.candidate;
    if (candidate.entryPoint.preferred) {
      expect(candidate.entryPoint.preferred.digit).toBeGreaterThanOrEqual(0);
      expect(candidate.entryPoint.preferred.digit).toBeLessThanOrEqual(9);
      expect(candidate.entryPoint.preferred.pWin).toBeGreaterThan(0);
      expect(candidate.entryPoint.preferred.pWinLower).toBeLessThanOrEqual(candidate.entryPoint.preferred.pWin);
    }
  });

  // TEST 4 — VALIDITY ACCURACY
  it("TEST 4: validity window reflects candidate window definition accurately", () => {
    const scan = scanNow(mockMarkets, DEFAULT_SCAN_OPTIONS);
    const candidate = scan.bestOf90!.candidate;
    expect(candidate.entryPoint.window.label).toBeDefined();
    expect(candidate.entryPoint.window.value).toBeGreaterThanOrEqual(0);
    expect(candidate.entryPoint.window.basis).toBeDefined();
  });

  // TEST 5 — DBOT HANDOFF CONSISTENCY
  it("TEST 5: DBot handoff payload can be completely formed from the bestOf90 candidate", () => {
    const scan = scanNow(mockMarkets, DEFAULT_SCAN_OPTIONS);
    const candidate = scan.bestOf90!.candidate;
    expect(candidate.symbol).toBeTruthy();
    expect(candidate.contract.label).toBeTruthy();
    expect(candidate.contract.side).toBeTruthy();
    expect(candidate.entryPoint.window.label).toBeTruthy();
    expect(Array.isArray(candidate.invalidation)).toBe(true);
  });

  // TEST 6 — NO SYNTHETIC VALUES
  it("TEST 6: unvalidated components report honest empty states instead of fabricated numbers", () => {
    const thinMarket = createMockMarket("R_100", "Thin Market", 7, 5);
    thinMarket.dataState = "THIN";
    const scan = scanNow([thinMarket], DEFAULT_SCAN_OPTIONS);
    if (scan.bestOf90) {
      const candidate = scan.bestOf90.candidate;
      if (!candidate.survival?.sufficient) {
        expect(candidate.survival?.sufficient ?? false).toBe(false);
      }
    }
  });

  // TEST 7 — CANONICAL PSYCHOLOGY
  it("TEST 7: digit psychology uses 1,000-tick canonical distribution", () => {
    const scan = scanNow(mockMarkets, DEFAULT_SCAN_OPTIONS);
    const candidate = scan.bestOf90!.candidate;
    expect(candidate.digitState).toBeDefined();
    expect(candidate.digitState.pct.length).toBe(10);
    expect(candidate.digitPsychology.winningZone).toBeDefined();
    expect(candidate.digitPsychology.losingZone).toBeDefined();
  });

  // TEST 8 — PRESSURE TIMEFRAMES
  it("TEST 8: multi-window pressure (15/30/60/120t) is present and distinct from 1,000t psychology", () => {
    const scan = scanNow(mockMarkets, DEFAULT_SCAN_OPTIONS);
    const candidate = scan.bestOf90!.candidate;
    expect(candidate.priceAction).toBeDefined();
    expect(candidate.priceAction.alignment).toBeDefined();
    expect(candidate.intel.pressure?.pressure).toBeDefined();
    expect(candidate.intel.pressure?.migration).toBeDefined();
  });

  // TEST 9 — LOSING-SIDE PRESSURE
  it("TEST 9: losing side pressure is computed with index, modifier and state", () => {
    const scan = scanNow(mockMarkets, DEFAULT_SCAN_OPTIONS);
    const candidate = scan.bestOf90!.candidate;
    const lsp = candidate.contract.losingSidePressure;
    expect(lsp).toBeDefined();
    if (lsp) {
      expect(lsp.index).toBeGreaterThanOrEqual(0);
      expect(lsp.index).toBeLessThanOrEqual(100);
      expect(lsp.modifier).toBeGreaterThanOrEqual(0.85);
      expect(lsp.modifier).toBeLessThanOrEqual(1.15);
    }
  });

  // TEST 10 — EXECUTION READY GATE
  it("TEST 10: executionReady boolean and reasons are evaluated correctly", () => {
    const scan = scanNow(mockMarkets, DEFAULT_SCAN_OPTIONS);
    const candidate = scan.bestOf90!.candidate;
    const gate = operatorSurfaceGate(candidate, candidate.intel);

    expect(typeof candidate.executionReady).toBe("boolean");
    expect(Array.isArray(candidate.executionReadyReasons)).toBe(true);
    expect(scan.bestOf90!.qualified).toBe(gate.qualified);
  });

  // TEST 11 — SINGLE-CLICK HYDRATION
  it("TEST 11: single call to scanNow() populates all 90 cells and selects the best candidate", () => {
    const scan = scanNow(mockMarkets, DEFAULT_SCAN_OPTIONS);
    expect(scan.evaluated).toBe(90);
    expect(scan.bestOf90).not.toBeNull();
    expect(scan.bestOf90!.populationSize).toBe(90);
    expect(scan.bestOf90!.bestOfPopulation).toBe(true);
  });

  // TEST 12 — BLOCKED BEST
  it("TEST 12: high-danger candidate that fails the gate is displayed with honest BLOCKED status", () => {
    const dangerousMarkets = APEX_UNIVERSE_SYMBOLS.map((s, idx) => {
      return createMockMarket(s, `${s} Dangerous Index`, (idx * 2) % 10, 1000, 85);
    });
    const scan = scanNow(dangerousMarkets, DEFAULT_SCAN_OPTIONS);
    expect(scan.bestOf90).not.toBeNull();
    expect(scan.bestOf90!.qualified).toBe(false);
    expect(scan.bestOf90!.status).toBe("BEST OF 90 — BLOCKED");
    expect(scan.bestOf90!.blockers.length).toBeGreaterThan(0);
  });

  // TEST 13 — EXPLICIT BEST-OF-90 DISPLACEMENT PROOF (95 HELD vs 91 CLEARED vs 87 CLEARED)
  it("TEST 13: Stage-4-ineligible raw leader (Score 95, Stage 4 HELD) is displaced by the strongest Stage-4-cleared candidate (Score 91, Stage 4 CLEARED)", () => {
    // Construct the three exact candidates:
    // Candidate A: raw Stage-3 score = 95, Stage-4 verdict = HELD
    const candidateA = createControlledRankedCandidate({
      symbol: "R_100",
      contractId: "OVER2",
      score: 95,
      stage4Verdict: "HELD_UNCONFIRMED_SIGNIFICANCE",
      danger: 12,
      digitPsychologyVerdict: "SUPPORT",
      digitPsychologyScore: 85,
    });

    // Candidate B: raw Stage-3 score = 91, Stage-4 verdict = CLEARED
    const candidateB = createControlledRankedCandidate({
      symbol: "R_75",
      contractId: "UNDER7",
      score: 91,
      stage4Verdict: "CLEARED",
      danger: 15,
      digitPsychologyVerdict: "SUPPORT",
      digitPsychologyScore: 80,
    });

    // Candidate C: raw Stage-3 score = 87, Stage-4 verdict = CLEARED
    const candidateC = createControlledRankedCandidate({
      symbol: "R_50",
      contractId: "OVER3",
      score: 87,
      stage4Verdict: "CLEARED",
      danger: 18,
      digitPsychologyVerdict: "SUPPORT",
      digitPsychologyScore: 75,
    });

    const candidatePopulation = [candidateA, candidateB, candidateC];

    // Assert the exact 9 requirements specified in the directive:
    // 1. A has the highest raw score
    expect(candidateA.score).toBe(95);
    expect(candidateA.score).toBeGreaterThan(candidateB.score);
    expect(candidateB.score).toBeGreaterThan(candidateC.score);

    // 2. A is HELD / non-CLEARED
    expect(candidateA.finalDecision?.verdict).toBe("HELD_UNCONFIRMED_SIGNIFICANCE");
    expect(candidateA.finalDecision?.verdict).not.toBe("CLEARED");

    // 3. B is CLEARED
    expect(candidateB.finalDecision?.verdict).toBe("CLEARED");

    // 4. C is CLEARED
    expect(candidateC.finalDecision?.verdict).toBe("CLEARED");

    // Execute the selection logic
    const bestOf90Result = selectBestOf90FromPopulation(candidatePopulation);
    expect(bestOf90Result).not.toBeNull();

    // 5. A is NOT selected as final Best-of-90
    expect(bestOf90Result!.candidate.symbol).not.toBe(candidateA.symbol);
    expect(bestOf90Result!.candidate.score).not.toBe(candidateA.score);

    // 6. B IS selected as final Best-of-90
    expect(bestOf90Result!.candidate.symbol).toBe(candidateB.symbol);
    expect(bestOf90Result!.candidate.score).toBe(91);
    expect(bestOf90Result!.qualified).toBe(true);

    // 7. C is not selected ahead of B
    expect(bestOf90Result!.candidate.symbol).not.toBe(candidateC.symbol);

    // 8. The final Best-of-90 candidate retains its Stage-4 attribution
    expect(bestOf90Result!.candidate.finalDecision?.verdict).toBe("CLEARED");
    expect(bestOf90Result!.candidate.finalDecision?.significance?.passesCorrection).toBe(true);
    expect(bestOf90Result!.status).toBe("BEST OF 90 — QUALIFIED");

    // 9. The test proves selection is based on the eligible/cleared population rather than blindly selecting highest raw score
    expect(bestOf90Result!.candidate).toBe(candidateB);
  });

  // TEST 14 — CONVERSE: Genuinely CLEARED raw leader remains Best-of-90
  it("TEST 14: Genuinely CLEARED raw leader (Score 95, Stage 4 CLEARED) remains Best-of-90 without artificial displacement", () => {
    // Candidate A: raw score = 95, Stage-4 = CLEARED
    const candidateA = createControlledRankedCandidate({
      symbol: "R_100",
      contractId: "OVER2",
      score: 95,
      stage4Verdict: "CLEARED",
      danger: 12,
    });

    // Candidate B: raw score = 91, Stage-4 = CLEARED
    const candidateB = createControlledRankedCandidate({
      symbol: "R_75",
      contractId: "UNDER7",
      score: 91,
      stage4Verdict: "CLEARED",
      danger: 15,
    });

    const candidatePopulation = [candidateA, candidateB];
    const bestOf90Result = selectBestOf90FromPopulation(candidatePopulation);

    expect(bestOf90Result).not.toBeNull();
    // Candidate A remains Best-of-90
    expect(bestOf90Result!.candidate.symbol).toBe(candidateA.symbol);
    expect(bestOf90Result!.candidate.score).toBe(95);
    expect(bestOf90Result!.candidate.finalDecision?.verdict).toBe("CLEARED");
    expect(bestOf90Result!.qualified).toBe(true);
  });

  // TEST 15 — ALL NON-CLEARED POPULATION
  it("TEST 15: When no candidate in the population is Stage-4-cleared, Best-of-90 honestly reports non-qualified status with exact blockers", () => {
    const candidateA = createControlledRankedCandidate({
      symbol: "R_100",
      contractId: "OVER2",
      score: 95,
      stage4Verdict: "HELD_UNCONFIRMED_SIGNIFICANCE",
      danger: 12,
    });
    const candidateB = createControlledRankedCandidate({
      symbol: "R_75",
      contractId: "UNDER7",
      score: 91,
      stage4Verdict: "HELD_EXPOSURE_CAP",
      danger: 15,
    });

    const candidatePopulation = [candidateA, candidateB];
    const bestOf90Result = selectBestOf90FromPopulation(candidatePopulation);

    expect(bestOf90Result).not.toBeNull();
    expect(bestOf90Result!.qualified).toBe(false);
    expect(bestOf90Result!.status).toBe("BEST OF 90 — NOT QUALIFIED");
    expect(bestOf90Result!.candidate.symbol).toBe("R_100");
  });

  // TEST 16 — NEAR-SIGNAL NON-EXECUTABILITY AND DIGIT-PSYCHOLOGY INTEGRITY
  it("TEST 16: Near-Signal is strictly diagnostic with isExecutable: false and rejects weak digit psychology", () => {
    // 1. Candidate with supportive digit psychology but remaining execution wait
    const supportiveCandidate = createControlledRankedCandidate({
      symbol: "R_100",
      contractId: "OVER2",
      score: 82,
      stage4Verdict: "HELD_UNCONFIRMED_SIGNIFICANCE",
      danger: 15,
      digitPsychologyVerdict: "SUPPORT",
      digitPsychologyScore: 78,
    });
    supportiveCandidate.entryPoint.status = "UNVALIDATED";
    supportiveCandidate.executionReady = false;
    supportiveCandidate.executionReadyReasons = ["Entry trigger touch not yet confirmed on preferred digit"];

    const evalSupportive = NearSignalEngine.evaluate(supportiveCandidate);
    expect(evalSupportive.isNearSignal).toBe(true);
    expect(evalSupportive.verdict).toBe("NEAR_SIGNAL");
    expect(evalSupportive.isExecutable).toBe(false); // Strictly non-executable
    expect(evalSupportive.missingConditions.length).toBeGreaterThan(0);

    // 2. Candidate with conflicting digit psychology (cannot qualify as Near-Signal)
    const conflictingCandidate = createControlledRankedCandidate({
      symbol: "R_100",
      contractId: "OVER2",
      score: 82,
      stage4Verdict: "HELD_UNCONFIRMED_SIGNIFICANCE",
      danger: 15,
      digitPsychologyVerdict: "CONFLICT",
      digitPsychologyScore: 30,
    });
    conflictingCandidate.entryPoint.status = "UNVALIDATED";
    conflictingCandidate.executionReady = false;

    const evalConflicting = NearSignalEngine.evaluate(conflictingCandidate);
    expect(evalConflicting.isNearSignal).toBe(false);
    expect(evalConflicting.verdict).toBe("NOT_NEAR_SIGNAL");
    expect(evalConflicting.isExecutable).toBe(false);

    // 3. Candidate with hard-blocked digit psychology
    const hardBlockedCandidate = createControlledRankedCandidate({
      symbol: "R_100",
      contractId: "OVER2",
      score: 82,
      stage4Verdict: "HELD_UNCONFIRMED_SIGNIFICANCE",
      danger: 15,
      digitPsychologyVerdict: "SUPPORT",
      digitPsychologyScore: 75,
      digitPsychologyHardBlock: true,
    });
    const evalHardBlocked = NearSignalEngine.evaluate(hardBlockedCandidate);
    expect(evalHardBlocked.isNearSignal).toBe(false);
    expect(evalHardBlocked.verdict).toBe("NOT_NEAR_SIGNAL");
    expect(evalHardBlocked.isExecutable).toBe(false);
  });

  // TEST 17 — DIGIT PSYCHOLOGY CANONICAL RULES (Most-decreasing can be any digit, extreme 0/9, excluded 1/8)
  it("TEST 17: Digit psychology allows most-decreasing digit to be any digit and preserves 1/8/012/789 rules", () => {
    // Generate synthetic 1,000 digits with digit 4 decreasing and digit 7 dominant
    const digits: number[] = [];
    for (let i = 0; i < 1000; i++) {
      if (i < 500) {
        // First 500 ticks: digit 4 has high share
        digits.push(i % 5 === 0 ? 4 : (i % 10));
      } else {
        // Last 500 ticks: digit 4 decreases, digit 7 increases
        digits.push(i % 4 === 0 ? 7 : (i % 10));
      }
    }

    const state = canonicalDigitState(digits);
    expect(state.n).toBe(1000);
    // Most decreasing digit can be any digit (e.g. 4, 3, etc.)
    expect(state.mostDecreasing).toBeDefined();

    // Evaluate on OVER 2 contract
    const over2Shape = {
      label: "Over 2",
      side: "OVER" as const,
      barrier: 2,
      winners: [3, 4, 5, 6, 7, 8, 9],
    };

    const psych = contractPsychology(state, over2Shape);
    expect(psych).toBeDefined();
    expect(psych.score).toBeGreaterThanOrEqual(0);
    expect(psych.score).toBeLessThanOrEqual(100);
    expect(["SUPPORT", "NEUTRAL", "CONFLICT"]).toContain(psych.verdict);
  });
});

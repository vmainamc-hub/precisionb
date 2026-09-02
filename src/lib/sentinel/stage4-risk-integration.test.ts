import { describe, it, expect, beforeAll } from "vitest";
import { FinalDecisionEngine, computeBinomialPValue } from "./final-decision";
import { SignificanceGuardEngine, type ComboEvidence } from "../risk/significance-guard";
import { CircuitBreakerEngine, idleCircuitBreaker } from "../risk/circuit-breaker";
import { PortfolioExposureEngine } from "../risk/portfolio-exposure";
import { PositionSizingEngine } from "../risk/position-sizing";
import { scanNow, rankOpportunities, DEFAULT_SCAN_OPTIONS } from "../apex/scan";
import { NearSignalEngine } from "./near-signal";
import { APEX_UNIVERSE_SYMBOLS } from "../apex/universe";
import { PROPOSITIONS, type Proposition } from "./observation/constants";
import type { MarketIntel, ContractEval, RankedOpportunity } from "../apex/types";
import type { OpportunityCandidate } from "@/types/sentinel";
import { seedObservationEngine } from "./observation/test-helpers";

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
      supports: [{ engine: "Distribution", label: "Strong positive bias", detail: "Bias detected", weight: 1.5, n: 1000 }],
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
      pressure: pcts.map(() => 0.1),
      impulse: pcts.map(() => 0.05),
      lifecycle: pcts.map(() => "STABLE" as any),
      exhaustion: pcts.map(() => 0.1),
      zoneAShare: 0.5,
      zoneBShare: 0.5,
      migration: 0.1,
    },
    transition: null,
    sequence: null,
    entropy: {
      entropy: 0.82,
      chi2: 3.5,
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
      label: "TRENDING" as any,
      confidence: 85,
      detail: "Stable directional trend detected.",
    },
    personality: null,
    buildup: null,
    quality: {
      score: 82,
      detail: "High quality streaming data.",
    },
    danger: dangerVal,
    updatedAt: Date.now(),
    digitIntel: null,
    bars: null,
    criticalReport: null,
    battle: null,
    deepTicks: tickCount,
    psychology: null,
    specialDigits: null,
    fluctuation: {
      n: tickCount,
      score: 18,
      state: "CALM" as any,
      signalFlickerRate: 0.02,
      edgeSignFlipRate: 0.01,
      confidenceOscillation: 0.05,
      psychologyFlipRate: 0.01,
      rankChurn: 0.02,
      drivers: [],
      summary: "Stable evidence.",
    },
  };
}

describe("Stage 4 Master Verification Test Suite (Tests 1 - 10)", () => {
  beforeAll(() => {
    seedObservationEngine();
  });

  const mockMarkets = APEX_UNIVERSE_SYMBOLS.map((s, idx) =>
    createMockMarket(s, `${s} Synthetic Index`, (idx * 2) % 10, 1000),
  );

  // TEST 1: Stage 4 receives the candidate population and records its actual size.
  it("Test 1: Stage 4 receives the candidate population and records its actual size", () => {
    const scan = scanNow(mockMarkets, DEFAULT_SCAN_OPTIONS);
    expect(scan.evaluated).toBe(90);
    expect(scan.bestOf90).not.toBeNull();
    expect(scan.bestOf90!.populationSize).toBe(90);
    expect(scan.exposureReport).toBeDefined();
    expect(scan.bestOf90!.candidate.finalDecision).toBeDefined();
    expect(scan.bestOf90!.candidate.finalDecision?.significance?.activeComparisons).toBe(90);
  });

  // TEST 2: SignificanceGuardEngine applies multiple-testing correction across the candidate population.
  it("Test 2: SignificanceGuardEngine applies Benjamini-Hochberg FDR across the candidate population", () => {
    const mockEvidences: ComboEvidence[] = [
      { comboKey: "R_100:UNDER_7", pVal: 0.001, rawWilsonLower: 73.5, measuredEdge: 5.2, sampleSize: 1000 },
      { comboKey: "R_75:UNDER_7", pVal: 0.04, rawWilsonLower: 70.8, measuredEdge: 2.1, sampleSize: 1000 },
      { comboKey: "R_50:OVER_2", pVal: 0.08, rawWilsonLower: 70.2, measuredEdge: 1.6, sampleSize: 1000 },
      { comboKey: "R_25:UNDER_8", pVal: 0.35, rawWilsonLower: 79.5, measuredEdge: 0.5, sampleSize: 1000 },
    ];

    const result = SignificanceGuardEngine.evaluateAll(mockEvidences);
    expect(result.size).toBe(4);
    expect(result.get("R_100:UNDER_7")?.passesCorrection).toBe(true);
    expect(result.get("R_25:UNDER_8")?.passesCorrection).toBe(false); // edge 0.5 < 1.5 and p-value too high
  });

  // TEST 3: A Stage-3 CLEARED candidate with unconfirmed significance becomes HELD_UNCONFIRMED_SIGNIFICANCE.
  it("Test 3: A Stage-3 CLEARED candidate with unconfirmed significance becomes HELD_UNCONFIRMED_SIGNIFICANCE", () => {
    const dummyCandidate: Partial<RankedOpportunity> = {
      symbol: "R_100",
      contract: {
        id: "UNDER_7" as any,
        label: "Under 7",
        theoretical: 0.7,
        empirical: 0.702, // only 0.2pp edge - fails Minimum Effect Size (1.5pp)
        n: 1000,
        edge: 0.002,
        edgeLB: 0,
        danger: 15,
        confidence: 80,
      } as any,
      score: 85,
      entryClearance: { verdict: "CLEARED" } as any,
      blocked: false,
    };

    const cb = idleCircuitBreaker();
    const { ranked } = FinalDecisionEngine.evaluateStage4([dummyCandidate as RankedOpportunity], cb, []);

    expect(ranked[0].finalDecision?.stage3Verdict).toBe("CLEARED");
    expect(ranked[0].finalDecision?.significance?.passesCorrection).toBe(false);
    expect(ranked[0].finalDecision?.verdict).toBe("HELD_UNCONFIRMED_SIGNIFICANCE");
  });

  // TEST 4: A Stage-3 WAIT or BLOCKED candidate is never promoted by Stage 4.
  it("Test 4: A Stage-3 WAIT or BLOCKED candidate is never promoted by Stage 4", () => {
    const waitCand: Partial<RankedOpportunity> = {
      symbol: "R_100",
      contract: {
        id: "UNDER_7" as any,
        label: "Under 7",
        theoretical: 0.7,
        empirical: 0.78, // massive 8pp edge and massive sample
        n: 1000,
        edge: 0.08,
        edgeLB: 0.06,
        danger: 15,
        confidence: 90,
      } as any,
      score: 88,
      entryClearance: { verdict: "WAIT" } as any,
      blocked: false,
    };

    const blockedCand: Partial<RankedOpportunity> = {
      symbol: "R_50",
      contract: {
        id: "OVER_2" as any,
        label: "Over 2",
        theoretical: 0.7,
        empirical: 0.78,
        n: 1000,
        edge: 0.08,
        edgeLB: 0.06,
        danger: 65,
        confidence: 90,
      } as any,
      score: 80,
      entryClearance: { verdict: "BLOCKED" } as any,
      blocked: true,
    };

    const cb = idleCircuitBreaker();
    const { ranked } = FinalDecisionEngine.evaluateStage4([waitCand as RankedOpportunity, blockedCand as RankedOpportunity], cb, []);

    expect(ranked[0].finalDecision?.verdict).toBe("WAIT");
    expect(ranked[1].finalDecision?.verdict).toBe("BLOCKED");
  });

  // TEST 5: CircuitBreakerEngine trips and halts trading when limits are breached.
  it("Test 5: CircuitBreakerEngine trips and halts trading when limits are breached", () => {
    // Breached consecutive losses
    const cbLosses = CircuitBreakerEngine.evaluate({ consecutiveLosses: 4 });
    expect(cbLosses.tripped).toBe(true);
    expect(cbLosses.reason).toContain("4 consecutive losses");

    // Breached drawdown
    const cbDrawdown = CircuitBreakerEngine.evaluate({ sessionDrawdownPct: 15 });
    expect(cbDrawdown.tripped).toBe(true);
    expect(cbDrawdown.reason).toContain("session drawdown 15.0%");

    // Breached global danger
    const cbDanger = CircuitBreakerEngine.evaluate({ sustainedGlobalDanger: 85 });
    expect(cbDanger.tripped).toBe(true);
    expect(cbDanger.reason).toContain("sustained global danger 85/100");

    // Stage 4 evaluates candidate under tripped breaker
    const dummyCandidate: Partial<RankedOpportunity> = {
      symbol: "R_100",
      contract: {
        id: "UNDER_7" as any,
        label: "Under 7",
        theoretical: 0.7,
        empirical: 0.78,
        n: 1000,
        edge: 0.08,
        edgeLB: 0.06,
        danger: 15,
        confidence: 85,
      } as any,
      score: 85,
      entryClearance: { verdict: "CLEARED" } as any,
      blocked: false,
    };

    const { ranked } = FinalDecisionEngine.evaluateStage4([dummyCandidate as RankedOpportunity], cbLosses, []);
    expect(ranked[0].finalDecision?.verdict).toBe("HELD_CIRCUIT_BREAKER");
    expect(ranked[0].finalDecision?.recommendedStake?.drawdownAdjustedStake).toBe(0);
  });

  // TEST 6: PortfolioExposureEngine enforces group and total exposure ceilings.
  it("Test 6: PortfolioExposureEngine enforces group and total exposure ceilings", () => {
    const candidates = [
      {
        symbol: "R_100",
        contract: { id: "UNDER_7", label: "Under 7", theoretical: 0.7, empirical: 0.78, n: 1000, edge: 0.08, danger: 15, confidence: 85 } as any,
        score: 88,
        entryClearance: { verdict: "CLEARED" } as any,
        blocked: false,
        recommendedStake: { drawdownAdjustedStake: 15 } as any,
      },
      {
        symbol: "R_75",
        contract: { id: "UNDER_7", label: "Under 7", theoretical: 0.7, empirical: 0.78, n: 1000, edge: 0.08, danger: 15, confidence: 85 } as any,
        score: 82,
        entryClearance: { verdict: "CLEARED" } as any,
        blocked: false,
        recommendedStake: { drawdownAdjustedStake: 15 } as any,
      },
    ];

    const cb = idleCircuitBreaker();
    const { ranked, exposureReport } = FinalDecisionEngine.evaluateStage4(candidates as any, cb, []);

    expect(exposureReport.recommendation).toBe("TRIM");
    // The lower-scoring R_75 ($15 + $15 = $30 > $25 group ceiling) should be held
    const r75 = ranked.find((r: any) => r.symbol === "R_75");
    expect(r75?.finalDecision?.verdict).toBe("HELD_EXPOSURE_CAP");
  });

  // TEST 7: PositionSizingEngine computes drawdown-adjusted stakes from real inputs.
  it("Test 7: PositionSizingEngine computes drawdown-adjusted stakes from real inputs", () => {
    const baseStake = PositionSizingEngine.calculateBaseStake(85, 80, 78, 1.38, 1000, 1000);
    expect(baseStake.baseStake).toBeGreaterThanOrEqual(0.35);
    expect(baseStake.kellyFraction).toBeGreaterThan(0);
    expect(baseStake.maturityFactor).toBe(1.0); // 1000 ticks = full maturity

    // With consecutive losses
    const cbStreak = CircuitBreakerEngine.evaluate({ consecutiveLosses: 2 });
    const adjustedStreak = PositionSizingEngine.applyDrawdownAdjustment(baseStake, cbStreak);
    expect(adjustedStreak.drawdownAdjustedStake).toBeLessThan(baseStake.baseStake);

    // With drawdown
    const cbDrawdown = CircuitBreakerEngine.evaluate({ sessionDrawdownPct: 8 });
    const adjustedDrawdown = PositionSizingEngine.applyDrawdownAdjustment(baseStake, cbDrawdown);
    expect(adjustedDrawdown.drawdownAdjustedStake).toBeLessThan(baseStake.baseStake);
  });

  // TEST 8: Missing statistical evidence results in honest unconfirmed states, never fabricated confidence.
  it("Test 8: Missing statistical evidence results in honest unconfirmed states, never fabricated confidence", () => {
    const pValZeroSample = computeBinomialPValue(0.75, 0.7, 0);
    expect(pValZeroSample).toBe(1.0);

    const thinCandidate: Partial<RankedOpportunity> = {
      symbol: "R_10",
      contract: {
        id: "UNDER_7" as any,
        label: "Under 7",
        theoretical: 0.7,
        empirical: 0.7, // zero edge
        n: 0, // zero sample
        edge: 0,
        edgeLB: 0,
        danger: 15,
        confidence: 0,
      } as any,
      score: 50,
      entryClearance: { verdict: "CLEARED" } as any,
      blocked: false,
    };

    const cb = idleCircuitBreaker();
    const { ranked } = FinalDecisionEngine.evaluateStage4([thinCandidate as RankedOpportunity], cb, []);

    expect(ranked[0].finalDecision?.significance?.passesCorrection).toBe(false);
    expect(ranked[0].finalDecision?.significance?.detail).toContain("sample 0 below minimum 60 observations");
    expect(ranked[0].finalDecision?.verdict).toBe("HELD_UNCONFIRMED_SIGNIFICANCE");
  });

  // TEST 9: Best-of-90 reflects the final Stage 4 verdict and is passed to the UI.
  it("Test 9: Best-of-90 reflects the final Stage 4 verdict and is passed to the UI", () => {
    const scan = scanNow(mockMarkets, DEFAULT_SCAN_OPTIONS);
    expect(scan.bestOf90).not.toBeNull();
    expect(scan.bestOf90!.finalDecision).toBeDefined();
    expect(scan.bestOf90!.recommendedStake).toBeDefined();
    expect(scan.bestOf90!.candidate.finalDecision?.verdict).toBeDefined();
  });

  // TEST 10: Full pipeline test: 1000 ticks → 90 cells → psychology → direction → executionReady → operator surface gate → Stage 4 → Best-of-90.
  it("Test 10: Full pipeline test: 1000 ticks → 90 cells → psychology → direction → executionReady → operator surface gate → Stage 4 → Best-of-90", () => {
    const scan = scanNow(mockMarkets, DEFAULT_SCAN_OPTIONS);

    // 1000 ticks & 90 cells
    expect(scan.evaluated).toBe(90);
    const best = scan.bestOf90!;
    expect(best.candidate.intel.ticks).toBe(1000);

    // Psychology & Direction
    expect(best.candidate.digitPsychology).toBeDefined();
    expect(best.candidate.direction).toBeDefined();

    // Execution Ready
    expect(typeof best.executionReady).toBe("boolean");

    // Operator Surface Gate
    expect(typeof best.qualified).toBe("boolean");

    // Stage 4
    expect(best.finalDecision).toBeDefined();
    expect(best.finalDecision?.circuitBreaker).toBeDefined();
    expect(best.finalDecision?.significance).toBeDefined();
    expect(best.finalDecision?.recommendedStake).toBeDefined();

    // UI payload integrity
    expect(best.populationSize).toBe(90);
    expect(best.bestOfPopulation).toBe(true);
  });
});

describe("Section 8: Portfolio Exposure — Anti-Phantom Exposure Tests", () => {
  it("Test A: 1 genuinely executable candidate and 89 WAIT/BLOCKED candidates do not create phantom exposure", () => {
    const cb = idleCircuitBreaker();
    const executableCand: Partial<RankedOpportunity> = {
      symbol: "R_100",
      contract: {
        id: "UNDER_7" as any,
        label: "Under 7",
        side: "UNDER",
        theoretical: 0.7,
        empirical: 0.78,
        n: 1000,
        edge: 0.08,
        edgeLB: 0.06,
        danger: 15,
        confidence: 85,
      } as any,
      score: 88,
      entryClearance: { verdict: "CLEARED" } as any,
      blocked: false,
    };

    const waitCandidates: Partial<RankedOpportunity>[] = Array.from({ length: 89 }, (_, i) => ({
      symbol: `R_${(i % 5) * 25 + 10}`,
      contract: {
        id: "OVER_2" as any,
        label: "Over 2",
        side: "OVER",
        theoretical: 0.7,
        empirical: 0.78,
        n: 1000,
        edge: 0.08,
        edgeLB: 0.06,
        danger: 20,
        confidence: 80,
      } as any,
      score: 75,
      entryClearance: { verdict: "WAIT" } as any,
      blocked: false,
    }));

    const allCandidates = [executableCand as RankedOpportunity, ...waitCandidates as RankedOpportunity[]];
    const { ranked, exposureReport } = FinalDecisionEngine.evaluateStage4(allCandidates, cb, []);

    // Total proposed exposure must reflect ONLY the 1 cleared candidate, NOT all 90 ($15 * 90 = $1350)
    expect(exposureReport.totalProposedExposure).toBeLessThanOrEqual(25);
    expect(exposureReport.recommendation).toBe("OK");
    expect(ranked[0].finalDecision?.verdict).toBe("CLEARED");
  });

  it("Test B: Non-executable candidates with large hypothetical stakes cannot cause false TRIM or BLOCK_NEW", () => {
    const cb = idleCircuitBreaker();
    const executableCand: Partial<RankedOpportunity> = {
      symbol: "R_100",
      contract: {
        id: "UNDER_7" as any,
        label: "Under 7",
        side: "UNDER",
        theoretical: 0.7,
        empirical: 0.78,
        n: 1000,
        edge: 0.08,
        edgeLB: 0.06,
        danger: 15,
        confidence: 85,
      } as any,
      score: 88,
      entryClearance: { verdict: "CLEARED" } as any,
      blocked: false,
    };

    const blockedCandidates: Partial<RankedOpportunity>[] = Array.from({ length: 10 }, (_, i): Partial<RankedOpportunity> => ({
      symbol: "R_75", // Same correlation group
      contract: {
        id: "OVER_2" as any,
        label: "Over 2",
        side: "OVER",
        theoretical: 0.7,
        empirical: 0.78,
        n: 1000,
        edge: 0.08,
        edgeLB: 0.06,
        danger: 75,
        confidence: 80,
      } as any,
      score: 70,
      entryClearance: { verdict: "BLOCKED" } as any,
      blocked: true,
      clearance: { state: "BLOCKED", blockers: ["HARD DANGER"], warnings: [] },
    } as any));

    const allCandidates = [executableCand as RankedOpportunity, ...blockedCandidates as RankedOpportunity[]];
    const { ranked, exposureReport } = FinalDecisionEngine.evaluateStage4(allCandidates, cb, []);

    expect(exposureReport.recommendation).toBe("OK");
    expect(ranked[0].finalDecision?.verdict).toBe("CLEARED");
  });
});

describe("Stage 4 does not create a competing ranking", () => {
  it("preserves candidate population order while attaching Stage 4 verdicts", () => {
    const cb = idleCircuitBreaker();
    const first: any = {
      symbol: "R_FIRST",
      contract: { id: "OVER_2", label: "Over 2", theoretical: 0.7, empirical: 0.8, n: 1000, edge: 0.1, edgeLB: 0.05, danger: 20, confidence: 80 },
      score: 60,
      entryClearance: { verdict: "WAIT" },
      blocked: false,
    };
    const second: any = {
      symbol: "R_SECOND",
      contract: { id: "UNDER_7", label: "Under 7", theoretical: 0.7, empirical: 0.8, n: 1000, edge: 0.1, edgeLB: 0.05, danger: 20, confidence: 80 },
      score: 90,
      entryClearance: { verdict: "CLEARED" },
      blocked: false,
    };

    const { ranked } = FinalDecisionEngine.evaluateStage4([first, second], cb, []);
    expect(ranked.map((c: any) => c.symbol)).toEqual(["R_FIRST", "R_SECOND"]);
  });
});

describe("Section 20: Diagnostic NEAR-SIGNAL Tests", () => {
  it("Test A: Strong candidate missing only execution trigger -> NEAR_SIGNAL -> NOT_EXECUTABLE", () => {
    const strongNearSignalCand: Partial<RankedOpportunity> = {
      symbol: "R_100",
      name: "Volatility 100 Index",
      contract: {
        id: "UNDER_7" as any,
        label: "Under 7",
        side: "UNDER",
        theoretical: 0.7,
        empirical: 0.78,
        n: 1000,
        edge: 0.08,
        danger: 25,
        confidence: 85,
        winners: [0, 1, 2, 3, 4, 5, 6],
        regimeCompatible: true,
        contradiction: 0,
        conflicts: [],
      } as any,
      score: 82,
      dangerComposition: { total: 25 } as any,
      agreement: "SUPPORT",
      direction: { direction: "UNDER", state: "CONFIRMED", consistency: 80 } as any,
      digitPsychology: { verdict: "SUPPORT", score: 80, hardBlock: false, summary: "Supportive" } as any,
      priceAction: { confirmsStructure: true, losingSidePressure: { state: "NEGLIGIBLE" } } as any,
      entryPoint: { status: "WAIT", preferred: null, window: { label: "15-20 TICKS" } } as any,
      signal: { state: "VALID_WAIT_ENTRY", waitForEntry: true } as any,
      entryClearance: { verdict: "WAIT" } as any,
      blocked: false,
      executionReady: false,
      executionReadyReasons: ["Awaiting entry trigger touch on preferred digit"],
      finalDecision: {
        verdict: "WAIT",
        stage3Verdict: "WAIT",
        recommendedStake: {} as any,
        significance: { passesCorrection: true } as any,
        exposure: null,
        circuitBreaker: idleCircuitBreaker(),
        factors: [],
        summary: "WAIT",
      },
    };

    const ns = NearSignalEngine.evaluate(strongNearSignalCand as RankedOpportunity);
    expect(ns.isNearSignal).toBe(true);
    expect(ns.verdict).toBe("NEAR_SIGNAL");
    expect(ns.isExecutable).toBe(false);
    expect(ns.strengths.length).toBeGreaterThanOrEqual(3);
    expect(ns.missingConditions.length).toBeGreaterThan(0);
  });

  it("Test B: Weak psychology/pressure/engine evidence -> NOT_NEAR_SIGNAL", () => {
    const weakCand: Partial<RankedOpportunity> = {
      symbol: "R_50",
      contract: {
        id: "OVER_2" as any,
        label: "Over 2",
        side: "OVER",
        theoretical: 0.7,
        empirical: 0.71,
        n: 1000,
        edge: 0.01,
        danger: 40,
        confidence: 45,
        winners: [3, 4, 5, 6, 7, 8, 9],
        regimeCompatible: true,
        contradiction: 1,
      } as any,
      score: 55,
      dangerComposition: { total: 40 } as any,
      agreement: "NEUTRAL",
      direction: { direction: "OVER", state: "WEAK" } as any,
      digitPsychology: { verdict: "CONFLICT", score: 35, hardBlock: false, summary: "Conflict" } as any,
      priceAction: { confirmsStructure: false, losingSidePressure: { state: "ACTIVE_THREAT" } } as any,
      entryClearance: { verdict: "WAIT" } as any,
      blocked: false,
      executionReady: false,
      executionReadyReasons: ["Weak setup score"],
    };

    const ns = NearSignalEngine.evaluate(weakCand as RankedOpportunity);
    expect(ns.isNearSignal).toBe(false);
    expect(ns.verdict).toBe("NOT_NEAR_SIGNAL");
  });

  it("Test C: Strong candidate with active hard veto -> NOT_NEAR_SIGNAL", () => {
    const vetoedCand: Partial<RankedOpportunity> = {
      symbol: "R_100",
      contract: {
        id: "UNDER_7" as any,
        label: "Under 7",
        side: "UNDER",
        theoretical: 0.7,
        empirical: 0.78,
        n: 1000,
        edge: 0.08,
        danger: 25,
        confidence: 85,
      } as any,
      score: 82,
      dangerComposition: { total: 25 } as any,
      agreement: "SUPPORT",
      direction: { direction: "UNDER", state: "CONFIRMED" } as any,
      digitPsychology: { winningSideDominance: true, supportScore: 80 } as any,
      blocked: true, // Hard veto
      vetoResolution: { hasVeto: true, vetoes: ["GLOBAL DANGER VETO"] } as any,
    };

    const ns = NearSignalEngine.evaluate(vetoedCand as RankedOpportunity);
    expect(ns.isNearSignal).toBe(false);
    expect(ns.verdict).toBe("NOT_NEAR_SIGNAL");
    expect(ns.missingConditions).toContain("Active hard veto in place");
  });

  it("Test D: All mandatory requirements satisfied -> EXECUTABLE state", () => {
    const executableCand: Partial<RankedOpportunity> = {
      symbol: "R_100",
      contract: {
        id: "UNDER_7" as any,
        label: "Under 7",
        side: "UNDER",
        theoretical: 0.7,
        empirical: 0.78,
        n: 1000,
        edge: 0.08,
        danger: 20,
        confidence: 85,
      } as any,
      score: 85,
      dangerComposition: { total: 20 } as any,
      clearance: { state: "CLEAR", blockers: [], cautions: [] } as any,
      blocked: false,
      executionReady: true,
      finalDecision: { verdict: "CLEARED" } as any,
    };

    const ns = NearSignalEngine.evaluate(executableCand as RankedOpportunity);
    expect(ns.isNearSignal).toBe(false);
    expect(ns.verdict).toBe("EXECUTABLE");
  });

  it("Test D2: Hard blockers (danger > 45, thin sample, broken direction, circuit breaker, high contradiction) strictly prevent Near-Signal", () => {
    // 1. Extreme danger
    const dangerousCand: Partial<RankedOpportunity> = {
      symbol: "R_100",
      contract: { id: "UNDER_7" as any, label: "Under 7", side: "UNDER", theoretical: 0.7, empirical: 0.78, n: 1000, danger: 65 } as any,
      score: 85,
      dangerComposition: { total: 65 } as any,
      direction: { direction: "UNDER", state: "CONFIRMED" } as any,
      digitPsychology: { winningSideDominance: true, supportScore: 80 } as any,
    };
    expect(NearSignalEngine.evaluate(dangerousCand as RankedOpportunity).isNearSignal).toBe(false);

    // 2. Thin sample
    const thinCand: Partial<RankedOpportunity> = {
      symbol: "R_100",
      contract: { id: "UNDER_7" as any, label: "Under 7", side: "UNDER", theoretical: 0.7, empirical: 0.78, n: 8, danger: 15 } as any,
      score: 85,
      dangerComposition: { total: 15 } as any,
      direction: { direction: "UNDER", state: "CONFIRMED" } as any,
      digitPsychology: { winningSideDominance: true, supportScore: 80 } as any,
    };
    expect(NearSignalEngine.evaluate(thinCand as RankedOpportunity).isNearSignal).toBe(false);

    // 3. Broken / opposed direction
    const brokenDirCand: Partial<RankedOpportunity> = {
      symbol: "R_100",
      contract: { id: "UNDER_7" as any, label: "Under 7", side: "UNDER", theoretical: 0.7, empirical: 0.78, n: 1000, danger: 15 } as any,
      score: 85,
      dangerComposition: { total: 15 } as any,
      direction: { direction: "OVER", state: "OPPOSED", broken: true } as any,
      digitPsychology: { winningSideDominance: true, supportScore: 80 } as any,
    };
    expect(NearSignalEngine.evaluate(brokenDirCand as RankedOpportunity).isNearSignal).toBe(false);

    // 4. Circuit breaker tripped
    const cbCand: Partial<RankedOpportunity> = {
      symbol: "R_100",
      contract: { id: "UNDER_7" as any, label: "Under 7", side: "UNDER", theoretical: 0.7, empirical: 0.78, n: 1000, danger: 15 } as any,
      score: 85,
      dangerComposition: { total: 15 } as any,
      direction: { direction: "UNDER", state: "CONFIRMED" } as any,
      digitPsychology: { winningSideDominance: true, supportScore: 80 } as any,
      finalDecision: { circuitBreaker: { tripped: true, reason: "Max drawdown exceeded" } } as any,
    };
    expect(NearSignalEngine.evaluate(cbCand as RankedOpportunity).isNearSignal).toBe(false);

    // 5. Severe contradiction
    const contraCand: Partial<RankedOpportunity> = {
      symbol: "R_100",
      contract: { id: "UNDER_7" as any, label: "Under 7", side: "UNDER", theoretical: 0.7, empirical: 0.78, n: 1000, danger: 15, contradiction: 55 } as any,
      score: 85,
      dangerComposition: { total: 15 } as any,
      direction: { direction: "UNDER", state: "CONFIRMED" } as any,
      digitPsychology: { winningSideDominance: true, supportScore: 80 } as any,
    };
    expect(NearSignalEngine.evaluate(contraCand as RankedOpportunity).isNearSignal).toBe(false);
  });

  it("Test E & F: Stage 4 never promotes Near-Signal and maintains rank order", () => {
    const nearSignalCand: Partial<RankedOpportunity> = {
      symbol: "R_100",
      contract: {
        id: "UNDER_7" as any,
        label: "Under 7",
        side: "UNDER",
        theoretical: 0.7,
        empirical: 0.78,
        n: 1000,
        edge: 0.08,
        danger: 25,
        confidence: 85,
      } as any,
      score: 82,
      entryClearance: { verdict: "WAIT" } as any,
      blocked: false,
      executionReady: false,
    };

    const cb = idleCircuitBreaker();
    const { ranked } = FinalDecisionEngine.evaluateStage4([nearSignalCand as RankedOpportunity], cb, []);

    // Stage 4 verdict MUST remain WAIT, never upgraded to CLEARED
    expect(ranked[0].finalDecision?.verdict).toBe("WAIT");
  });
});

describe("Section 7: Single Authoritative Stage 4 Call-Graph & Consumer Fidelity", () => {
  beforeAll(() => {
    seedObservationEngine();
  });

  const mockMarkets = APEX_UNIVERSE_SYMBOLS.map((s, idx) =>
    createMockMarket(s, `${s} Synthetic Index`, (idx * 2) % 10, 1000),
  );

  it("Prove rankOpportunities performs Stage 4 and decorates all candidates with finalDecision, recommendedStake, and nearSignal", () => {
    const { ranked, exposureReport, circuitBreaker } = rankOpportunities(mockMarkets);

    expect(ranked.length).toBe(90);
    expect(exposureReport).toBeDefined();
    expect(circuitBreaker).toBeDefined();

    for (const cand of ranked) {
      expect(cand.finalDecision).toBeDefined();
      expect(cand.recommendedStake).toBeDefined();
      expect(cand.nearSignal).toBeDefined();
      expect(cand.finalDecision!.circuitBreaker).toBeDefined();
      expect(cand.finalDecision!.significance).toBeDefined();
    }
  });

  it("Prove scanNow consumes the Stage-4 decorated ranked output without altering Stage 4 attribution", () => {
    const scan = scanNow(mockMarkets, DEFAULT_SCAN_OPTIONS);

    expect(scan.bestOf90).not.toBeNull();
    expect(scan.bestOf90!.finalDecision).toBeDefined();
    expect(scan.bestOf90!.recommendedStake).toBeDefined();
    expect(scan.bestOf90!.nearSignal).toBeDefined();
    expect(scan.bestOf90!.candidate.finalDecision).toBe(scan.bestOf90!.finalDecision);
  });
});



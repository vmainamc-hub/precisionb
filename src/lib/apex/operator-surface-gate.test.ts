import { describe, it, expect } from "vitest";
import { operatorSurfaceGate } from "./operator-surface-gate";
import { scanNow, DEFAULT_SCAN_OPTIONS } from "./scan";
import { engineInfluence, engineEffectiveness } from "./engine-effectiveness";
import { runParityConfluenceEngine } from "../parity/engine-library/engines/confluence-engine";
import { ParityEnsembleLearner } from "../parity/engine-library/engines/ensemble-engine";
import { runSignalDecayEngine } from "../parity/engine-library/engines/decay-engine";
import type { RankedOpportunity, MarketIntel } from "./types";
import type { SimTrade } from "./simulator";

describe("Operator Surface Gate & Dormant Systems Integration Test", () => {
  it("strictly gates candidates and provides detailed reason logs", () => {
    const mockOpportunity: any = {
      symbol: "R_100",
      name: "Volatility 100 Index",
      score: 45, // < 65 => should fail minScore
      agreement: 2,
      contract: {
        id: "matches",
        label: "Matches",
        phase: "FORMING", // Non-fresh/mature
        edge: 0.02, // < 3pp => fails fake edge
        pWin: 0.52,
        danger: 75, // > 45 => fails danger
        streak: 0,
        theoretical: 0.5,
        supports: [],
        resists: [],
        contradictionCount: 2,
      },
    };

    const mockIntel: any = {
      symbol: "R_100",
      name: "Volatility 100 Index",
      ticks: 15, // < 20 STRUCTURAL_MIN_TICKS
      lastTickAt: Date.now() - 30_000, // > 15s stale
      dataState: "THIN",
      digitFreq: Array(10).fill(0.1),
      lastDigit: 5,
      pressure: 0,
      danger: 75,
      regime: "BALANCED",
      entropy: 0.98,
      opportunities: [],
      entryClearance: {
        score: 40,
        verdict: "WAIT",
        reasons: ["Hazard elevated"],
        executionReady: false,
        breakdown: {
          hazardCleared: false,
          regimeFavorable: false,
          entropyAcceptable: false,
          spreadAcceptable: false,
        },
      },
      observationGrid: {
        symbol: "R_100",
        marketName: "Volatility 100 Index",
        totalCells: 6,
        qualifiedCells: 0,
        dominantState: "FORMING",
        cells: [],
      },
    };

    const result = operatorSurfaceGate(mockOpportunity, mockIntel);
    expect(result.qualified).toBe(false);
    expect(result.surfaceState).toBe("HIDDEN");
    expect(result.gateResults.structuralMinTicks).toBe(false);
    expect(result.gateResults.dataFreshness).toBe(false);
    expect(result.gateResults.executionReady).toBe(false);
    expect(result.gateResults.dangerThreshold).toBe(false);
    expect(result.gateResults.opportunityScore).toBe(false);
    expect(result.blockers.length).toBeGreaterThan(0);
  });

  it("qualifies a clean candidate passing all 9 gates", () => {
    const cleanOpp: any = {
      symbol: "R_100",
      name: "Volatility 100 Index",
      score: 72,
      agreement: 4,
      contract: {
        id: "differs",
        label: "Differs",
        phase: "FRESH",
        edge: 0.05,
        pWin: 0.95,
        danger: 25,
        streak: 0,
        theoretical: 0.9,
        supports: [{ label: "Strong distribution deviation", engine: "Distribution", weight: 1.5, detail: "Strong distribution deviation", n: 100 }],
        resists: [],
        contradictionCount: 0,
      },
    };

    const cleanIntel: any = {
      symbol: "R_100",
      name: "Volatility 100 Index",
      ticks: 120,
      lastTickAt: Date.now() - 2000,
      dataState: "ROBUST",
      digitFreq: Array(10).fill(0.1),
      lastDigit: 3,
      pressure: 0,
      danger: 25,
      regime: "BALANCED",
      entropy: 0.85,
      opportunities: [],
      entryClearance: {
        score: 85,
        verdict: "EXECUTE",
        reasons: ["All metrics clear"],
        executionReady: true,
        breakdown: {
          hazardCleared: true,
          regimeFavorable: true,
          entropyAcceptable: true,
          spreadAcceptable: true,
        },
      },
      observationGrid: {
        symbol: "R_100",
        marketName: "Volatility 100 Index",
        totalCells: 6,
        qualifiedCells: 1,
        dominantState: "RIPE",
        cells: [],
      },
    };

    const result = operatorSurfaceGate(cleanOpp, cleanIntel);
    expect(result.qualified).toBe(true);
    expect(result.surfaceState).toBe("SURFACED");
    expect(result.blockers.length).toBe(0);
    expect(result.gateResults.structuralMinTicks).toBe(true);
    expect(result.gateResults.dataFreshness).toBe(true);
    expect(result.gateResults.executionReady).toBe(true);
    expect(result.gateResults.opportunityScore).toBe(true);
  });

  it("scanNow returns empty top array when no candidate is qualified (no fallback to ranked[0])", () => {
    const thinIntels: any[] = [
      {
        symbol: "R_10",
        name: "Volatility 10 Index",
        ticks: 5, // thin ticks
        lastTickAt: Date.now(),
        dataState: "THIN",
        digitFreq: Array(10).fill(0.1),
        lastDigit: 0,
        pressure: 0,
        danger: 80,
        regime: "BALANCED",
        entropy: 0.99,
        opportunities: [],
      },
    ];

    const scan = scanNow(thinIntels, DEFAULT_SCAN_OPTIONS);
    expect(scan.top).toEqual([]); // Must be empty, no fallback!
    expect(scan.evaluated).toBeGreaterThanOrEqual(0);
  });

  it("engineInfluence correctly modulates weights when sample size N >= 25", () => {
    // Before min N, influence is neutral 1.0
    const initialInf = engineInfluence("Distribution", []);
    expect(initialInf).toBe(1.0);

    // Create 30 winning trades supporting "Distribution"
    const winningTrades: SimTrade[] = Array.from({ length: 30 }, (_, i) => ({
      id: `trade-win-${i}`,
      openedAt: Date.now() - (30 - i) * 1000,
      resolvedAt: Date.now() - (30 - i) * 1000 + 500,
      symbol: "R_100",
      market: "Volatility 100 Index",
      contract: "UNDER7",
      contractLabel: "Differs",
      side: "UNDER",
      barrier: 7,
      winners: [0, 1, 2, 3, 4, 5, 6],
      entryDigit: 4,
      entryQuote: 1000,
      durationTicks: 1,
      ticksElapsed: 1,
      expiryAt: Date.now(),
      expiryDigit: 3,
      result: "WIN",
      stake: 1,
      payout: 0.38,
      pnl: 0.38,
      entryCondition: "DISTRIBUTION_EXTREME",
      entryRule: null,
      invalidationReason: null,
      state: {
        opportunity: 80,
        confidence: 80,
        edge: 0.05,
        quality: 80,
        stability: 80,
        freshness: 100,
        danger: 20,
        dangerClearance: true,
        regime: "BALANCED",
        threatState: "CALM",
        losingThreat: 0,
        sensitiveConflict: false,
        criticalDetail: "",
        barState: "NORMAL",
        mostIncreasing: null,
        forwardState: "NONE",
        agreement: "NEUTRAL",
        modelState: "NONE",
        reason: "",
        simBefore: { n: 0, winRate: 0 },
        simRecentBefore: { n: 0, winRate: 0 },
        engineVotes: [{ engine: "Distribution", weight: 1 }],
      },
    }));

    const highEffectivenessInf = engineInfluence("Distribution", winningTrades);
    expect(highEffectivenessInf).toBeGreaterThan(1.0);
    expect(highEffectivenessInf).toBeLessThanOrEqual(1.4);

    // Create 30 losing trades supporting "FailingEngine"
    const losingTrades: SimTrade[] = Array.from({ length: 30 }, (_, i) => ({
      id: `trade-loss-${i}`,
      openedAt: Date.now() - (30 - i) * 1000,
      resolvedAt: Date.now() - (30 - i) * 1000 + 500,
      symbol: "R_100",
      market: "Volatility 100 Index",
      contract: "OVER2",
      contractLabel: "Matches",
      side: "OVER",
      barrier: 2,
      winners: [3, 4, 5, 6, 7, 8, 9],
      entryDigit: 1,
      entryQuote: 1000,
      durationTicks: 1,
      ticksElapsed: 1,
      expiryAt: Date.now(),
      expiryDigit: 0,
      result: "LOSS",
      stake: 1,
      payout: 0.9,
      pnl: -1,
      entryCondition: "FAILING_SETUP",
      entryRule: null,
      invalidationReason: null,
      state: {
        opportunity: 40,
        confidence: 40,
        edge: -0.05,
        quality: 30,
        stability: 30,
        freshness: 50,
        danger: 70,
        dangerClearance: false,
        regime: "CHAOTIC",
        threatState: "HOSTILE",
        losingThreat: 70,
        sensitiveConflict: true,
        criticalDetail: "",
        barState: "NORMAL",
        mostIncreasing: null,
        forwardState: "NONE",
        agreement: "NEUTRAL",
        modelState: "NONE",
        reason: "",
        simBefore: { n: 0, winRate: 0 },
        simRecentBefore: { n: 0, winRate: 0 },
        engineVotes: [{ engine: "FailingEngine", weight: 1 }],
      },
    }));

    const lowEffectivenessInf = engineInfluence("FailingEngine", losingTrades);
    expect(lowEffectivenessInf).toBeLessThan(1.0);
    expect(lowEffectivenessInf).toBeGreaterThanOrEqual(0.5);
  });

  it("decay engine decreases confidence over elapsed ticks and triggers expiration", () => {
    const fresh = runSignalDecayEngine(80, 0, 8);
    expect(fresh.status).toBe("FRESH");
    expect(fresh.decayedConfidence).toBe(80);
    expect(fresh.isExpired).toBe(false);

    const decaying = runSignalDecayEngine(80, 3, 8);
    expect(decaying.status).toBe("DECAYING");
    expect(decaying.decayedConfidence).toBeLessThan(80);
    expect(decaying.isExpired).toBe(false);

    const expired = runSignalDecayEngine(80, 8, 8);
    expect(expired.status).toBe("EXPIRED");
    expect(expired.isExpired).toBe(true);
  });

  it("ensemble learner adapts engine weights based on outcome track-record", () => {
    const learner = ParityEnsembleLearner.get();
    const defaultWeight = learner.getEngineWeight("R_100", "Markov Transitions", 1.0);
    expect(defaultWeight).toBe(1.0);

    // Record 15 correct outcomes
    for (let i = 0; i < 15; i++) {
      learner.recordEngineOutcome("R_100", "Markov Transitions", true);
    }

    const updatedWeight = learner.getEngineWeight("R_100", "Markov Transitions", 1.0);
    expect(updatedWeight).toBeGreaterThan(1.0);
  });
});
